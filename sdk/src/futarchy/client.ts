import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  ComputeBudgetProgram,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID } from "./constants";
import {
  Futarchy,
  GlobalConfig,
  ModeratorAccount,
  ProposalAccount,
  TWAPConfig,
} from "./types";
import {
  deriveGlobalConfigPDA,
  deriveModeratorPDA,
  deriveProposalPDA,
  fetchGlobalConfig,
  fetchModeratorAccount,
  fetchProposalAccount,
  parseProposalState,
  isProposalExpired,
  getTimeRemaining,
} from "./utils";
import {
  initializeModerator,
  initializeProposal,
  addOption,
  launchProposal,
  finalizeProposal,
  redeemLiquidity,
  addHistoricalProposal,
} from "./instructions";

import { VaultClient, deriveVaultPDA, deriveConditionalMint, VaultType } from "../vault";
import { AMMClient, derivePoolPDA, deriveReservePDA, deriveFeeVaultPDA, FEE_AUTHORITY } from "../amm";

import { FutarchyIDL } from "../programs/idls";

const MAX_COMPUTE_UNITS = 500_000;

export class FutarchyClient {
  public program: Program<Futarchy>;
  public programId: PublicKey;
  public vault: VaultClient;
  public amm: AMMClient;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.programId = programId ?? PROGRAM_ID;
    this.program = new Program(FutarchyIDL as Futarchy, provider);
    this.vault = new VaultClient(provider);
    this.amm = new AMMClient(provider);
  }

  // ===========================================================================
  // PDA Helpers
  // ===========================================================================

  deriveGlobalConfigPDA(): [PublicKey, number] {
    return deriveGlobalConfigPDA(this.programId);
  }

  deriveModeratorPDA(moderatorId: number): [PublicKey, number] {
    return deriveModeratorPDA(moderatorId, this.programId);
  }

  deriveProposalPDA(moderator: PublicKey, proposalId: number): [PublicKey, number] {
    return deriveProposalPDA(moderator, proposalId, this.programId);
  }

  // ===========================================================================
  // Fetch
  // ===========================================================================

  async fetchGlobalConfig(): Promise<GlobalConfig> {
    return fetchGlobalConfig(this.program, this.programId);
  }

  async fetchModerator(moderatorPda: PublicKey): Promise<ModeratorAccount> {
    return fetchModeratorAccount(this.program, moderatorPda);
  }

  async fetchProposal(proposalPda: PublicKey): Promise<ProposalAccount> {
    return fetchProposalAccount(this.program, proposalPda);
  }

  isProposalExpired(proposal: ProposalAccount): boolean {
    return isProposalExpired(proposal);
  }

  getTimeRemaining(proposal: ProposalAccount): number {
    return getTimeRemaining(proposal);
  }

  // ===========================================================================
  // High-level Instruction Builders
  // ===========================================================================

  async initializeModerator(signer: PublicKey, baseMint: PublicKey, quoteMint: PublicKey) {
    const [globalConfig] = this.deriveGlobalConfigPDA();

    // Fetch current counter to derive moderator PDA
    let moderatorId: number;
    try {
      const config = await this.fetchGlobalConfig();
      moderatorId = config.moderatorIdCounter;
    } catch {
      // Global config doesn't exist yet, first moderator will be id 0
      moderatorId = 0;
    }

    const [moderatorPda] = this.deriveModeratorPDA(moderatorId);

    const builder = initializeModerator(
      this.program,
      signer,
      globalConfig,
      baseMint,
      quoteMint,
      moderatorPda
    );

    return {
      builder,
      globalConfig,
      moderatorPda,
      moderatorId,
    };
  }

  async addHistoricalProposal(
    signer: PublicKey,
    moderatorPda: PublicKey,
    numOptions: number,
    winningIdx: number,
    length: number,
    createdAt: BN | number
  ) {
    const moderator = await this.fetchModerator(moderatorPda);
    const proposalId = moderator.proposalIdCounter;
    const [proposalPda] = this.deriveProposalPDA(moderatorPda, proposalId);

    const builder = addHistoricalProposal(
      this.program,
      signer,
      moderatorPda,
      proposalPda,
      numOptions,
      winningIdx,
      length,
      createdAt
    );

    const instruction = await builder.instruction();

    return {
      builder,
      instruction,
      proposalPda,
      proposalId,
    };
  }

  async initializeProposal(
    signer: PublicKey,
    moderatorPda: PublicKey,
    length: number,
    fee: number,
    twapConfig: TWAPConfig
  ) {
    const moderator = await this.fetchModerator(moderatorPda);
    const proposalId = moderator.proposalIdCounter;
    const [proposalPda] = this.deriveProposalPDA(moderatorPda, proposalId);

    // Derive vault PDA (proposal is the owner, nonce=proposalId)
    const [vaultPda] = deriveVaultPDA(proposalPda, proposalId, this.vault.programId);

    // Derive conditional mints for initial 2 options
    const [condBaseMint0] = deriveConditionalMint(vaultPda, VaultType.Base, 0, this.vault.programId);
    const [condBaseMint1] = deriveConditionalMint(vaultPda, VaultType.Base, 1, this.vault.programId);
    const [condQuoteMint0] = deriveConditionalMint(vaultPda, VaultType.Quote, 0, this.vault.programId);
    const [condQuoteMint1] = deriveConditionalMint(vaultPda, VaultType.Quote, 1, this.vault.programId);

    // Derive pool PDAs for initial 2 options (proposal is admin, mintA=condQuote, mintB=condBase)
    const [pool0] = derivePoolPDA(proposalPda, condQuoteMint0, condBaseMint0, this.amm.programId);
    const [pool1] = derivePoolPDA(proposalPda, condQuoteMint1, condBaseMint1, this.amm.programId);

    // Derive reserves and fee vaults
    const [reserveA0] = deriveReservePDA(pool0, condQuoteMint0, this.amm.programId);
    const [reserveB0] = deriveReservePDA(pool0, condBaseMint0, this.amm.programId);
    const [feeVault0] = deriveFeeVaultPDA(pool0, this.amm.programId);
    const [reserveA1] = deriveReservePDA(pool1, condQuoteMint1, this.amm.programId);
    const [reserveB1] = deriveReservePDA(pool1, condBaseMint1, this.amm.programId);
    const [feeVault1] = deriveFeeVaultPDA(pool1, this.amm.programId);

    // Vault token accounts
    const baseTokenAcc = getAssociatedTokenAddressSync(moderator.baseMint, vaultPda, true);
    const quoteTokenAcc = getAssociatedTokenAddressSync(moderator.quoteMint, vaultPda, true);

    // Build remaining accounts in expected order (see initialize_proposal.rs)
    const remainingAccounts = [
      { pubkey: moderator.baseMint, isSigner: false, isWritable: false },      // 0: base_mint
      { pubkey: moderator.quoteMint, isSigner: false, isWritable: false },     // 1: quote_mint
      { pubkey: vaultPda, isSigner: false, isWritable: true },                 // 2: vault
      { pubkey: baseTokenAcc, isSigner: false, isWritable: true },             // 3: base_token_acc
      { pubkey: quoteTokenAcc, isSigner: false, isWritable: true },            // 4: quote_token_acc
      { pubkey: condBaseMint0, isSigner: false, isWritable: true },            // 5: cond_base_mint_0
      { pubkey: condBaseMint1, isSigner: false, isWritable: true },            // 6: cond_base_mint_1
      { pubkey: condQuoteMint0, isSigner: false, isWritable: true },           // 7: cond_quote_mint_0
      { pubkey: condQuoteMint1, isSigner: false, isWritable: true },           // 8: cond_quote_mint_1
      { pubkey: pool0, isSigner: false, isWritable: true },                    // 9: pool_0
      { pubkey: reserveA0, isSigner: false, isWritable: true },                // 10: reserve_a_0
      { pubkey: reserveB0, isSigner: false, isWritable: true },                // 11: reserve_b_0
      { pubkey: FEE_AUTHORITY, isSigner: false, isWritable: false },           // 12: fee_authority
      { pubkey: feeVault0, isSigner: false, isWritable: true },                // 13: fee_vault_0
      { pubkey: pool1, isSigner: false, isWritable: true },                    // 14: pool_1
      { pubkey: reserveA1, isSigner: false, isWritable: true },                // 15: reserve_a_1
      { pubkey: reserveB1, isSigner: false, isWritable: true },                // 16: reserve_b_1
      { pubkey: feeVault1, isSigner: false, isWritable: true },                // 17: fee_vault_1
    ];

    const builder = initializeProposal(
      this.program,
      signer,
      moderatorPda,
      proposalPda,
      length,
      fee,
      twapConfig,
      remainingAccounts
    ).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS })]);

    const instruction = await builder.instruction();

    return {
      builder,
      instruction,
      proposalPda,
      proposalId,
      vaultPda,
      pools: [pool0, pool1],
      condBaseMints: [condBaseMint0, condBaseMint1],
      condQuoteMints: [condQuoteMint0, condQuoteMint1],
    };
  }

  async addOption(signer: PublicKey, proposalPda: PublicKey) {
    const proposal = await this.fetchProposal(proposalPda);
    const optionIndex = proposal.numOptions;

    // Derive new conditional mints
    const [condBaseMint] = deriveConditionalMint(proposal.vault, VaultType.Base, optionIndex, this.vault.programId);
    const [condQuoteMint] = deriveConditionalMint(proposal.vault, VaultType.Quote, optionIndex, this.vault.programId);

    // Derive pool PDA
    const [pool] = derivePoolPDA(proposalPda, condQuoteMint, condBaseMint, this.amm.programId);
    const [reserveA] = deriveReservePDA(pool, condQuoteMint, this.amm.programId);
    const [reserveB] = deriveReservePDA(pool, condBaseMint, this.amm.programId);
    const [feeVault] = deriveFeeVaultPDA(pool, this.amm.programId);

    // Build remaining accounts (see add_option.rs)
    const remainingAccounts = [
      { pubkey: proposal.vault, isSigner: false, isWritable: true },           // 0: vault
      { pubkey: proposal.baseMint, isSigner: false, isWritable: false },       // 1: base_mint
      { pubkey: proposal.quoteMint, isSigner: false, isWritable: false },      // 2: quote_mint
      { pubkey: condBaseMint, isSigner: false, isWritable: true },             // 3: cond_base_mint
      { pubkey: condQuoteMint, isSigner: false, isWritable: true },            // 4: cond_quote_mint
      { pubkey: pool, isSigner: false, isWritable: true },                     // 5: pool
      { pubkey: reserveA, isSigner: false, isWritable: true },                 // 6: reserve_a
      { pubkey: reserveB, isSigner: false, isWritable: true },                 // 7: reserve_b
      { pubkey: FEE_AUTHORITY, isSigner: false, isWritable: false },           // 8: fee_authority
      { pubkey: feeVault, isSigner: false, isWritable: true },                 // 9: fee_vault
    ];

    const builder = addOption(this.program, signer, proposalPda, remainingAccounts)
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS })]);

    const instruction = await builder.instruction();

    return {
      builder,
      instruction,
      optionIndex,
      pool,
      condBaseMint,
      condQuoteMint,
    };
  }

  async launchProposal(
    signer: PublicKey,
    proposalPda: PublicKey,
    baseAmount: BN | number,
    quoteAmount: BN | number
  ) {
    const proposal = await this.fetchProposal(proposalPda);
    const vault = await this.vault.fetchVault(proposal.vault);
    const numOptions = proposal.numOptions;

    // Slice arrays to numOptions (fixed-size arrays from Rust include empty slots)
    const condBaseMints = vault.condBaseMints.slice(0, numOptions);
    const condQuoteMints = vault.condQuoteMints.slice(0, numOptions);
    const pools = proposal.pools.slice(0, numOptions);

    // Derive all user conditional token ATAs
    const userCondBaseATAs = condBaseMints.map((m) => getAssociatedTokenAddressSync(m, signer));
    const userCondQuoteATAs = condQuoteMints.map((m) => getAssociatedTokenAddressSync(m, signer));

    // Derive reserve accounts for each pool
    const reservesA: PublicKey[] = [];
    const reservesB: PublicKey[] = [];
    for (let i = 0; i < numOptions; i++) {
      const [resA] = deriveReservePDA(pools[i], condQuoteMints[i], this.amm.programId);
      const [resB] = deriveReservePDA(pools[i], condBaseMints[i], this.amm.programId);
      reservesA.push(resA);
      reservesB.push(resB);
    }

    // Build remaining accounts (see launch_proposal.rs)
    // Layout: 6 fixed + 7*N variable
    const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
      { pubkey: vault.baseMint, isSigner: false, isWritable: false },                              // 0: base_mint
      { pubkey: vault.quoteMint, isSigner: false, isWritable: false },                             // 1: quote_mint
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint, proposal.vault, true), isSigner: false, isWritable: true },   // 2: vault_base_ata
      { pubkey: getAssociatedTokenAddressSync(vault.quoteMint, proposal.vault, true), isSigner: false, isWritable: true },  // 3: vault_quote_ata
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint, signer), isSigner: false, isWritable: true },  // 4: user_base_ata
      { pubkey: getAssociatedTokenAddressSync(vault.quoteMint, signer), isSigner: false, isWritable: true }, // 5: user_quote_ata
    ];

    // 6..6+N: cond_base_mints
    for (const mint of condBaseMints) {
      remainingAccounts.push({ pubkey: mint, isSigner: false, isWritable: true });
    }
    // 6+N..6+2N: cond_quote_mints
    for (const mint of condQuoteMints) {
      remainingAccounts.push({ pubkey: mint, isSigner: false, isWritable: true });
    }
    // 6+2N..6+3N: user_cond_base_atas
    for (const ata of userCondBaseATAs) {
      remainingAccounts.push({ pubkey: ata, isSigner: false, isWritable: true });
    }
    // 6+3N..6+4N: user_cond_quote_atas
    for (const ata of userCondQuoteATAs) {
      remainingAccounts.push({ pubkey: ata, isSigner: false, isWritable: true });
    }
    // 6+4N..6+5N: pools
    for (const pool of pools) {
      remainingAccounts.push({ pubkey: pool, isSigner: false, isWritable: true });
    }
    // 6+5N..6+6N: reserves_a
    for (const res of reservesA) {
      remainingAccounts.push({ pubkey: res, isSigner: false, isWritable: true });
    }
    // 6+6N..6+7N: reserves_b
    for (const res of reservesB) {
      remainingAccounts.push({ pubkey: res, isSigner: false, isWritable: true });
    }

    const builder = launchProposal(
      this.program,
      signer,
      proposalPda,
      proposal.vault,
      baseAmount,
      quoteAmount,
      remainingAccounts
    ).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS })]);

    const instruction = await builder.instruction();

    return { builder, instruction };
  }

  async finalizeProposal(signer: PublicKey, proposalPda: PublicKey) {
    const proposal = await this.fetchProposal(proposalPda);
    const vault = await this.vault.fetchVault(proposal.vault);
    const numOptions = proposal.numOptions;

    // Build remaining accounts (3 per pool: pool, reserve_a, reserve_b)
    const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

    for (let i = 0; i < numOptions; i++) {
      const pool = proposal.pools[i];
      const [reserveA] = deriveReservePDA(pool, vault.condQuoteMints[i], this.amm.programId);
      const [reserveB] = deriveReservePDA(pool, vault.condBaseMints[i], this.amm.programId);

      remainingAccounts.push({ pubkey: pool, isSigner: false, isWritable: true });
      remainingAccounts.push({ pubkey: reserveA, isSigner: false, isWritable: false });
      remainingAccounts.push({ pubkey: reserveB, isSigner: false, isWritable: false });
    }

    const builder = finalizeProposal(
      this.program,
      signer,
      proposalPda,
      proposal.vault,
      remainingAccounts
    ).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS })]);

    const instruction = await builder.instruction();

    return { builder, instruction };
  }

  async redeemLiquidity(signer: PublicKey, proposalPda: PublicKey) {
    const proposal = await this.fetchProposal(proposalPda);
    const vault = await this.vault.fetchVault(proposal.vault);
    const numOptions = proposal.numOptions;

    const { winningIdx } = parseProposalState(proposal.state);
    if (winningIdx === null) {
      throw new Error("Proposal not finalized");
    }
    const winningPool = proposal.pools[winningIdx];

    // Derive winning pool reserves
    const [reserveA] = deriveReservePDA(winningPool, vault.condQuoteMints[winningIdx], this.amm.programId);
    const [reserveB] = deriveReservePDA(winningPool, vault.condBaseMints[winningIdx], this.amm.programId);

    // User's winning conditional token ATAs
    const signerCondQuoteAta = getAssociatedTokenAddressSync(vault.condQuoteMints[winningIdx], signer);
    const signerCondBaseAta = getAssociatedTokenAddressSync(vault.condBaseMints[winningIdx], signer);

    // Build remaining accounts (see redeem_liquidity.rs)
    const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
      // remove_liquidity accounts (0-3)
      { pubkey: reserveA, isSigner: false, isWritable: true },
      { pubkey: reserveB, isSigner: false, isWritable: true },
      { pubkey: signerCondQuoteAta, isSigner: false, isWritable: true },
      { pubkey: signerCondBaseAta, isSigner: false, isWritable: true },

      // redeem_winnings base fixed accounts (4-6)
      { pubkey: vault.baseMint, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint, proposal.vault, true), isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint, signer), isSigner: false, isWritable: true },
    ];

    // redeem_winnings base remaining (7..7+2N): [cond_base_mint_i, user_cond_base_ata_i]
    for (let i = 0; i < numOptions; i++) {
      remainingAccounts.push({ pubkey: vault.condBaseMints[i], isSigner: false, isWritable: true });
      remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.condBaseMints[i], signer), isSigner: false, isWritable: true });
    }

    // redeem_winnings quote fixed accounts
    remainingAccounts.push({ pubkey: vault.quoteMint, isSigner: false, isWritable: false });
    remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.quoteMint, proposal.vault, true), isSigner: false, isWritable: true });
    remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.quoteMint, signer), isSigner: false, isWritable: true });

    // redeem_winnings quote remaining: [cond_quote_mint_i, user_cond_quote_ata_i]
    for (let i = 0; i < numOptions; i++) {
      remainingAccounts.push({ pubkey: vault.condQuoteMints[i], isSigner: false, isWritable: true });
      remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.condQuoteMints[i], signer), isSigner: false, isWritable: true });
    }

    const builder = redeemLiquidity(
      this.program,
      signer,
      proposalPda,
      proposal.vault,
      winningPool,
      remainingAccounts
    ).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS })]);

    const instruction = await builder.instruction();

    return { builder, instruction };
  }

  // ===========================================================================
  // Address Lookup Table
  // ===========================================================================

  /**
   * Creates an Address Lookup Table for a proposal.
   * This method handles creating and extending the ALT atomically to avoid stale slot issues.
   *
   * @returns The ALT address after creation and extension
   */
  async createProposalALT(
    creator: PublicKey,
    moderatorPda: PublicKey,
    numOptions: number = 2,
  ): Promise<{ altAddress: PublicKey }> {
    const provider = this.program.provider as AnchorProvider;
    const moderator = await this.fetchModerator(moderatorPda);
    const proposalId = moderator.proposalIdCounter;
    const [proposalPda] = this.deriveProposalPDA(moderatorPda, proposalId);
    const [vaultPda] = deriveVaultPDA(proposalPda, proposalId, this.vault.programId);

    const addresses: PublicKey[] = [
      // Programs
      this.programId,
      this.vault.programId,
      this.amm.programId,
      SystemProgram.programId,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      // Core accounts
      moderatorPda,
      proposalPda,
      vaultPda,
      moderator.baseMint,
      moderator.quoteMint,
      FEE_AUTHORITY,
      // Vault token accounts
      getAssociatedTokenAddressSync(moderator.baseMint, vaultPda, true),
      getAssociatedTokenAddressSync(moderator.quoteMint, vaultPda, true),
      // Creator's base/quote ATAs
      getAssociatedTokenAddressSync(moderator.baseMint, creator),
      getAssociatedTokenAddressSync(moderator.quoteMint, creator),
    ];

    // Per-option accounts
    for (let i = 0; i < numOptions; i++) {
      const [condBaseMint] = deriveConditionalMint(vaultPda, VaultType.Base, i, this.vault.programId);
      const [condQuoteMint] = deriveConditionalMint(vaultPda, VaultType.Quote, i, this.vault.programId);
      const [pool] = derivePoolPDA(proposalPda, condQuoteMint, condBaseMint, this.amm.programId);
      const [reserveA] = deriveReservePDA(pool, condQuoteMint, this.amm.programId);
      const [reserveB] = deriveReservePDA(pool, condBaseMint, this.amm.programId);
      const [feeVault] = deriveFeeVaultPDA(pool, this.amm.programId);

      addresses.push(
        condBaseMint,
        condQuoteMint,
        pool,
        reserveA,
        reserveB,
        feeVault,
        // Creator's conditional token ATAs
        getAssociatedTokenAddressSync(condBaseMint, creator),
        getAssociatedTokenAddressSync(condQuoteMint, creator),
      );
    }

    // Get the most recent slot using "finalized" commitment for stability
    const slot = await provider.connection.getSlot("finalized");

    const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
      authority: creator,
      payer: creator,
      recentSlot: slot,
    });

    // Send create transaction immediately, skip preflight to avoid slot timing issues
    const createTx = new Transaction().add(createIx);
    createTx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    createTx.feePayer = creator;
    const signedTx = await provider.wallet.signTransaction(createTx);
    const sig = await provider.connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: true,
    });
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Split addresses into chunks to avoid transaction size limits
    // Each address is 32 bytes, ~20 addresses per extend instruction is safe
    const CHUNK_SIZE = 20;
    for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
      const chunk = addresses.slice(i, i + CHUNK_SIZE);
      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: creator,
        authority: creator,
        lookupTable: altAddress,
        addresses: chunk,
      });
      const extendTx = new Transaction().add(extendIx);
      await provider.sendAndConfirm(extendTx);
    }

    return { altAddress };
  }

  async fetchALT(altAddress: PublicKey): Promise<AddressLookupTableAccount> {
    const alt = await this.program.provider.connection.getAddressLookupTable(altAddress);
    if (!alt.value) {
      throw new Error("ALT not found");
    }
    return alt.value;
  }

  async buildVersionedTx(
    payer: PublicKey,
    instructions: TransactionInstruction[],
    altAddress: PublicKey,
  ): Promise<VersionedTransaction> {
    const alt = await this.fetchALT(altAddress);
    const blockhash = await this.program.provider.connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash.blockhash,
      instructions,
    }).compileToV0Message([alt]);

    return new VersionedTransaction(message);
  }
}
