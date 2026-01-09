/*
 * High-level client for the Futarchy program.
 * Handles account derivation, instruction building, and transaction composition.
 */

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
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PROGRAM_ID, SQUADS_PROGRAM_ID } from "./constants";
import {
  Futarchy,
  DAOAccount,
  ModeratorAccount,
  ProposalAccount,
  ProposalParams,
  PoolType,
} from "./types";
import {
  deriveDAOPDA,
  deriveModeratorPDA,
  deriveProposalPDA,
  deriveMintCreateKeyPDA,
  fetchDAOAccount,
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
  initializeParentDAO,
  initializeChildDAO,
  upgradeDAO,
} from "./instructions";
import { TxOptions } from "../utils";

import { VaultClient, deriveVaultPDA, deriveConditionalMint, VaultType } from "../vault";
import { AMMClient, derivePoolPDA, deriveReservePDA, deriveFeeVaultPDA, FEE_AUTHORITY } from "../amm";

import { FutarchyIDL } from "../generated/idls";
import * as multisig from "@sqds/multisig";

const DEFAULT_COMPUTE_UNITS = 500_000;

export class FutarchyClient {
  public program: Program<Futarchy>;
  public programId: PublicKey;
  public vault: VaultClient;
  public amm: AMMClient;
  private defaultComputeUnits: number;

  constructor(provider: AnchorProvider, programId?: PublicKey, computeUnits?: number) {
    this.programId = programId ?? PROGRAM_ID;
    this.program = new Program(FutarchyIDL as Futarchy, provider);
    this.vault = new VaultClient(provider);
    this.amm = new AMMClient(provider);
    this.defaultComputeUnits = computeUnits ?? DEFAULT_COMPUTE_UNITS;
  }

  /* PDA Helpers */

  deriveDAOPDA(name: string): [PublicKey, number] {
    return deriveDAOPDA(name, this.programId);
  }

  deriveModeratorPDA(name: string): [PublicKey, number] {
    return deriveModeratorPDA(name, this.programId);
  }

  deriveProposalPDA(moderator: PublicKey, proposalId: number): [PublicKey, number] {
    return deriveProposalPDA(moderator, proposalId, this.programId);
  }

  /* Fetchers */

  async fetchDAO(daoPda: PublicKey): Promise<DAOAccount> {
    return fetchDAOAccount(this.program, daoPda);
  }

  async fetchModerator(moderatorPda: PublicKey): Promise<ModeratorAccount> {
    return fetchModeratorAccount(this.program, moderatorPda);
  }

  async fetchProposal(proposalPda: PublicKey): Promise<ProposalAccount> {
    return fetchProposalAccount(this.program, proposalPda);
  }

  /* Proposal Helpers */

  isProposalExpired(proposal: ProposalAccount): boolean {
    return isProposalExpired(proposal);
  }

  getTimeRemaining(proposal: ProposalAccount): number {
    return getTimeRemaining(proposal);
  }

  private getComputeUnits(options?: TxOptions): number {
    return options?.computeUnits ?? this.defaultComputeUnits;
  }

  private maybeAddComputeBudget(options?: TxOptions): TransactionInstruction[] {
    if (options?.includeCuBudget === false) {
      return [];
    }
    return [ComputeBudgetProgram.setComputeUnitLimit({ units: this.getComputeUnits(options) })];
  }

  /* Instruction Builders */

  async initializeModerator(
    admin: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    name: string,
    options?: TxOptions
  ) {
    const [moderatorPda] = this.deriveModeratorPDA(name);

    const builder = initializeModerator(
      this.program,
      admin,
      baseMint,
      quoteMint,
      moderatorPda,
      name
    ).preInstructions(this.maybeAddComputeBudget(options));

    return { builder, moderatorPda, name };
  }

  async addHistoricalProposal(
    admin: PublicKey,
    moderatorPda: PublicKey,
    numOptions: number,
    winningIdx: number,
    length: number,
    createdAt: BN | number,
    options?: TxOptions
  ) {
    const moderator = await this.fetchModerator(moderatorPda);
    const proposalId = moderator.proposalIdCounter;
    const [proposalPda] = this.deriveProposalPDA(moderatorPda, proposalId);

    const builder = addHistoricalProposal(
      this.program,
      admin,
      moderatorPda,
      proposalPda,
      numOptions,
      winningIdx,
      length,
      createdAt
    ).preInstructions(this.maybeAddComputeBudget(options));

    return { builder, proposalPda, proposalId };
  }

  async initializeProposal(
    creator: PublicKey,
    moderatorPda: PublicKey,
    proposalParams: ProposalParams,
    metadata?: string,
    options?: TxOptions
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
      creator,
      moderatorPda,
      proposalPda,
      proposalParams,
      metadata ?? null,
      remainingAccounts
    ).preInstructions(this.maybeAddComputeBudget(options));

    return {
      builder,
      proposalPda,
      proposalId,
      vaultPda,
      pools: [pool0, pool1],
      condBaseMints: [condBaseMint0, condBaseMint1],
      condQuoteMints: [condQuoteMint0, condQuoteMint1],
    };
  }

  async addOption(creator: PublicKey, proposalPda: PublicKey, options?: TxOptions) {
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
      { pubkey: condBaseMint, isSigner: false, isWritable: true },             // 1: cond_base_mint
      { pubkey: condQuoteMint, isSigner: false, isWritable: true },            // 2: cond_quote_mint
      { pubkey: pool, isSigner: false, isWritable: true },                     // 3: pool
      { pubkey: reserveA, isSigner: false, isWritable: true },                 // 4: reserve_a
      { pubkey: reserveB, isSigner: false, isWritable: true },                 // 5: reserve_b
      { pubkey: FEE_AUTHORITY, isSigner: false, isWritable: false },           // 6: fee_authority
      { pubkey: feeVault, isSigner: false, isWritable: true },                 // 7: fee_vault
    ];

    const builder = addOption(this.program, creator, proposalPda, remainingAccounts)
      .preInstructions(this.maybeAddComputeBudget(options));

    return { builder, optionIndex, pool, condBaseMint, condQuoteMint };
  }

  async launchProposal(
    creator: PublicKey,
    proposalPda: PublicKey,
    baseAmount: BN | number,
    quoteAmount: BN | number,
    options?: TxOptions
  ) {
    const proposal = await this.fetchProposal(proposalPda);
    const vault = await this.vault.fetchVault(proposal.vault);
    const numOptions = proposal.numOptions;

    // Slice arrays to numOptions (fixed-size arrays from Rust include empty slots)
    const condBaseMints = vault.condBaseMints.slice(0, numOptions);
    const condQuoteMints = vault.condQuoteMints.slice(0, numOptions);

    // Pre-create conditional ATAs for 3+ options to avoid exceeding the
    // 64 instruction trace limit. Each ATA creation via vault deposit adds
    // 5 inner instructions; with 4 options that's 40 extra instructions.
    const shouldEnsureATAs = options?.ensureATAs ?? (numOptions >= 3);
    if (shouldEnsureATAs) {
      await this._createConditionalATAs(creator, condBaseMints, condQuoteMints);
    }
    const pools = proposal.pools.slice(0, numOptions);

    // Derive all user conditional token ATAs
    const userCondBaseATAs = condBaseMints.map((m) => getAssociatedTokenAddressSync(m, creator));
    const userCondQuoteATAs = condQuoteMints.map((m) => getAssociatedTokenAddressSync(m, creator));

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
      { pubkey: vault.baseMint.address, isSigner: false, isWritable: false },                              // 0: base_mint
      { pubkey: vault.quoteMint.address, isSigner: false, isWritable: false },                             // 1: quote_mint
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint.address, proposal.vault, true), isSigner: false, isWritable: true },   // 2: vault_base_ata
      { pubkey: getAssociatedTokenAddressSync(vault.quoteMint.address, proposal.vault, true), isSigner: false, isWritable: true },  // 3: vault_quote_ata
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint.address, creator), isSigner: false, isWritable: true },  // 4: user_base_ata
      { pubkey: getAssociatedTokenAddressSync(vault.quoteMint.address, creator), isSigner: false, isWritable: true }, // 5: user_quote_ata
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
      creator,
      proposalPda,
      proposal.vault,
      baseAmount,
      quoteAmount,
      remainingAccounts
    ).preInstructions(this.maybeAddComputeBudget(options));

    return { builder };
  }

  /**
   * Pre-creates all conditional token ATAs for a user before launching a proposal.
   *
   * This is REQUIRED for proposals with 3+ options to avoid exceeding Solana's
   * max instruction trace length limit (64 instructions). The vault's deposit CPI
   * creates ATAs on-the-fly, each requiring 5 inner instructions. For 4 options:
   * 8 ATAs × 5 = 40 extra instructions, pushing the total over 64.
   *
   * Pre-creating ATAs eliminates this overhead, reducing the trace to ~32 instructions.
   *
   * @param creator - The user who will receive conditional tokens
   * @param proposalPda - The proposal PDA (must be initialized but not launched)
   * @returns Transaction signature
   */
  async ensureConditionalATAs(
    creator: PublicKey,
    proposalPda: PublicKey,
  ): Promise<string> {
    const proposal = await this.fetchProposal(proposalPda);
    const vault = await this.vault.fetchVault(proposal.vault);
    const condBaseMints = vault.condBaseMints.slice(0, proposal.numOptions);
    const condQuoteMints = vault.condQuoteMints.slice(0, proposal.numOptions);
    return this._createConditionalATAs(creator, condBaseMints, condQuoteMints);
  }

  /**
   * Internal helper to create conditional ATAs given mint arrays.
   * Used by both ensureConditionalATAs and launchProposal to avoid redundant fetches.
   */
  private async _createConditionalATAs(
    creator: PublicKey,
    condBaseMints: PublicKey[],
    condQuoteMints: PublicKey[],
  ): Promise<string> {
    const provider = this.program.provider as AnchorProvider;

    // Build ATA creation instructions (idempotent - won't fail if exists)
    const instructions: TransactionInstruction[] = [];
    for (let i = 0; i < condBaseMints.length; i++) {
      const userCondBaseAta = getAssociatedTokenAddressSync(condBaseMints[i], creator);
      const userCondQuoteAta = getAssociatedTokenAddressSync(condQuoteMints[i], creator);

      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          creator,
          userCondBaseAta,
          creator,
          condBaseMints[i]
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          creator,
          userCondQuoteAta,
          creator,
          condQuoteMints[i]
        )
      );
    }

    // Send transaction
    const tx = new Transaction().add(...instructions);
    return provider.sendAndConfirm(tx);
  }

  async finalizeProposal(signer: PublicKey, proposalPda: PublicKey, options?: TxOptions) {
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
    ).preInstructions(this.maybeAddComputeBudget(options));

    return { builder };
  }

  async redeemLiquidity(creator: PublicKey, proposalPda: PublicKey, options?: TxOptions) {
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
    const creatorCondQuoteAta = getAssociatedTokenAddressSync(vault.condQuoteMints[winningIdx], creator);
    const creatorCondBaseAta = getAssociatedTokenAddressSync(vault.condBaseMints[winningIdx], creator);

    // Build remaining accounts (see redeem_liquidity.rs)
    const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
      // remove_liquidity accounts (0-3)
      { pubkey: reserveA, isSigner: false, isWritable: true },
      { pubkey: reserveB, isSigner: false, isWritable: true },
      { pubkey: creatorCondQuoteAta, isSigner: false, isWritable: true },
      { pubkey: creatorCondBaseAta, isSigner: false, isWritable: true },

      // redeem_winnings base fixed accounts (4-6)
      { pubkey: vault.baseMint.address, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint.address, proposal.vault, true), isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(vault.baseMint.address, creator), isSigner: false, isWritable: true },
    ];

    // redeem_winnings base remaining (7..7+2N): [cond_base_mint_i, user_cond_base_ata_i]
    for (let i = 0; i < numOptions; i++) {
      remainingAccounts.push({ pubkey: vault.condBaseMints[i], isSigner: false, isWritable: true });
      remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.condBaseMints[i], creator), isSigner: false, isWritable: true });
    }

    // redeem_winnings quote fixed accounts
    remainingAccounts.push({ pubkey: vault.quoteMint.address, isSigner: false, isWritable: false });
    remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.quoteMint.address, proposal.vault, true), isSigner: false, isWritable: true });
    remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.quoteMint.address, creator), isSigner: false, isWritable: true });

    // redeem_winnings quote remaining: [cond_quote_mint_i, user_cond_quote_ata_i]
    for (let i = 0; i < numOptions; i++) {
      remainingAccounts.push({ pubkey: vault.condQuoteMints[i], isSigner: false, isWritable: true });
      remainingAccounts.push({ pubkey: getAssociatedTokenAddressSync(vault.condQuoteMints[i], creator), isSigner: false, isWritable: true });
    }

    const builder = redeemLiquidity(
      this.program,
      creator,
      proposalPda,
      proposal.vault,
      winningPool,
      remainingAccounts
    ).preInstructions(this.maybeAddComputeBudget(options));

    return { builder, numOptions };
  }

  /**
   * Creates an Address Lookup Table for redemption operations.
   * Required for proposals with 3+ options to avoid exceeding transaction size limits.
   *
   * @param creator - The user redeeming (creator of proposal or liquidity provider)
   * @param proposalPda - The proposal PDA
   * @returns ALT address
   */
  async createRedemptionALT(
    creator: PublicKey,
    proposalPda: PublicKey,
  ): Promise<{ altAddress: PublicKey }> {
    const provider = this.program.provider as AnchorProvider;
    const proposal = await this.fetchProposal(proposalPda);
    const vault = await this.vault.fetchVault(proposal.vault);
    const numOptions = proposal.numOptions;

    const { winningIdx } = parseProposalState(proposal.state);
    if (winningIdx === null) {
      throw new Error("Proposal not finalized");
    }

    const addresses: PublicKey[] = [
      // Programs
      this.programId,
      this.vault.programId,
      this.amm.programId,
      SystemProgram.programId,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      // Core accounts
      proposalPda,
      proposal.vault,
      proposal.moderator,
      vault.baseMint.address,
      vault.quoteMint.address,
      // Winning pool and reserves
      proposal.pools[winningIdx],
      // Vault token accounts
      getAssociatedTokenAddressSync(vault.baseMint.address, proposal.vault, true),
      getAssociatedTokenAddressSync(vault.quoteMint.address, proposal.vault, true),
      // Creator's base/quote ATAs
      getAssociatedTokenAddressSync(vault.baseMint.address, creator),
      getAssociatedTokenAddressSync(vault.quoteMint.address, creator),
    ];

    // Winning pool reserves
    const [reserveA] = deriveReservePDA(proposal.pools[winningIdx], vault.condQuoteMints[winningIdx], this.amm.programId);
    const [reserveB] = deriveReservePDA(proposal.pools[winningIdx], vault.condBaseMints[winningIdx], this.amm.programId);
    addresses.push(reserveA, reserveB);

    // Per-option accounts (conditional mints and user ATAs)
    for (let i = 0; i < numOptions; i++) {
      addresses.push(
        vault.condBaseMints[i],
        vault.condQuoteMints[i],
        getAssociatedTokenAddressSync(vault.condBaseMints[i], creator),
        getAssociatedTokenAddressSync(vault.condQuoteMints[i], creator),
      );
    }

    // Get recent slot for ALT creation
    const slot = await provider.connection.getSlot("finalized");

    const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
      authority: creator,
      payer: creator,
      recentSlot: slot,
    });

    // Create ALT
    const createTx = new Transaction().add(createIx);
    createTx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    createTx.feePayer = creator;
    const signedTx = await provider.wallet.signTransaction(createTx);
    const sig = await provider.connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: true,
    });
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Extend ALT with addresses
    // Use skipPreflight to avoid race condition where simulation sees stale state
    // before previous extend has propagated (same pattern as CREATE above)
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
      extendTx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      extendTx.feePayer = creator;
      const signedExtendTx = await provider.wallet.signTransaction(extendTx);
      const extendSig = await provider.connection.sendRawTransaction(signedExtendTx.serialize(), {
        skipPreflight: true,
      });
      await provider.connection.confirmTransaction(extendSig, "confirmed");
    }

    return { altAddress };
  }

  /**
   * Builds a versioned transaction for redeeming liquidity with ALT.
   * Required for proposals with 3+ options to avoid exceeding transaction size limits.
   *
   * @param creator - The user redeeming
   * @param proposalPda - The proposal PDA
   * @param altAddress - Optional ALT address (will be created if not provided for 3+ options)
   * @returns Unsigned versioned transaction, ALT address, and number of options
   */
  async redeemLiquidityVersioned(
    creator: PublicKey,
    proposalPda: PublicKey,
    altAddress?: PublicKey,
  ): Promise<{ versionedTx: VersionedTransaction; altAddress: PublicKey; numOptions: number }> {
    const provider = this.program.provider as AnchorProvider;
    const { builder, numOptions } = await this.redeemLiquidity(creator, proposalPda);

    // Create ALT if not provided and needed
    let altPubkey = altAddress;
    let verifiedALT: AddressLookupTableAccount | null = null;

    if (!altPubkey && numOptions >= 3) {
      console.log(`  Creating redemption ALT for ${numOptions} options...`);
      const result = await this.createRedemptionALT(creator, proposalPda);
      altPubkey = result.altAddress;
      console.log(`  ✓ Redemption ALT created: ${altPubkey.toBase58()}`);

      // Wait for ALT to be fully available with all addresses
      // Use longer delays after extending to ensure propagation
      console.log(`  Waiting for ALT propagation...`);
      const expectedAddresses = 18 + (numOptions * 4); // Base accounts + per-option accounts
      let attempts = 0;

      // Initial delay after extension
      await new Promise(resolve => setTimeout(resolve, 2000));

      while (attempts < 30) {
        const altAccount = await provider.connection.getAddressLookupTable(altPubkey, {
          commitment: 'confirmed',
        });
        if (altAccount.value) {
          const addressCount = altAccount.value.state.addresses.length;
          console.log(`  Attempt ${attempts + 1}: ALT has ${addressCount}/${expectedAddresses} addresses`);
          if (addressCount >= expectedAddresses) {
            verifiedALT = altAccount.value;
            console.log(`  ✓ ALT verified with ${addressCount} addresses`);
            break;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      if (!verifiedALT) {
        throw new Error(`ALT failed to populate with expected ${expectedAddresses} addresses after ${attempts} attempts`);
      }
    }

    if (!altPubkey) {
      throw new Error("ALT address required for multi-option redemption");
    }

    // Fetch ALT if we don't have it verified already
    if (!verifiedALT) {
      verifiedALT = await this.fetchALT(altPubkey);
    }

    // Build instruction
    const instruction = await builder.instruction();
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 });

    // Get fresh blockhash
    const { blockhash } = await provider.connection.getLatestBlockhash();

    // Build versioned transaction using the verified ALT (no re-fetch)
    const versionedTx = this.buildVersionedTxWithALT(
      creator,
      [computeBudgetIx, instruction],
      verifiedALT,
      blockhash,
    );

    // Return the versioned transaction for the caller to sign and send
    // This allows the caller to use their own signing mechanism (e.g., keypair.sign)
    return { versionedTx, altAddress: altPubkey, numOptions };
  }

  /**
   * Helper to send a signed versioned transaction.
   */
  async sendVersionedTransaction(
    signedTx: VersionedTransaction,
  ): Promise<string> {
    const provider = this.program.provider as AnchorProvider;
    const signature = await provider.connection.sendTransaction(signedTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await provider.connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  /* Address Lookup Table */

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
    // Use skipPreflight to avoid race condition where simulation sees stale state
    // before previous extend has propagated (same pattern as CREATE above)
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
      extendTx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      extendTx.feePayer = creator;
      const signedExtendTx = await provider.wallet.signTransaction(extendTx);
      const extendSig = await provider.connection.sendRawTransaction(signedExtendTx.serialize(), {
        skipPreflight: true,
      });
      await provider.connection.confirmTransaction(extendSig, "confirmed");
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
    const provider = this.program.provider as AnchorProvider;
    const alt = await this.fetchALT(altAddress);
    const { blockhash } = await provider.connection.getLatestBlockhash();
    return this.buildVersionedTxWithALT(payer, instructions, alt, blockhash);
  }

  buildVersionedTxWithALT(
    payer: PublicKey,
    instructions: TransactionInstruction[],
    alt: AddressLookupTableAccount,
    blockhash: string,
  ): VersionedTransaction {
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([alt]);

    return new VersionedTransaction(message);
  }

  /* DAO Methods */

  deriveMintCreateKeyPDA(daoPda: PublicKey, name: string): [PublicKey, number] {
    return deriveMintCreateKeyPDA(daoPda, name, this.programId);
  }

  private async fetchSquadsProgramConfig() {
    const [programConfigPda] = multisig.getProgramConfigPda({
      programId: SQUADS_PROGRAM_ID,
    });
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
      this.program.provider.connection,
      programConfigPda
    );
    return {
      programConfig: programConfigPda,
      programConfigTreasury: programConfig.treasury,
    };
  }

  private deriveMultisigPda(createKey: PublicKey): PublicKey {
    const [multisigPda] = multisig.getMultisigPda({
      createKey,
      programId: SQUADS_PROGRAM_ID,
    });
    return multisigPda;
  }

  async initializeParentDAO(
    admin: PublicKey,
    parentAdmin: PublicKey,
    name: string,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    treasuryCosigner: PublicKey,
    pool: PublicKey,
    poolType: PoolType,
    options?: TxOptions
  ) {
    const [daoPda] = this.deriveDAOPDA(name);
    const [moderatorPda] = this.deriveModeratorPDA(name);
    const [mintCreateKeyPda] = this.deriveMintCreateKeyPDA(daoPda, name);

    // Derive Squads accounts (single RPC call)
    const squadsConfig = await this.fetchSquadsProgramConfig();
    const treasuryMultisigPda = this.deriveMultisigPda(daoPda);
    const mintMultisigPda = this.deriveMultisigPda(mintCreateKeyPda);

    const builder = initializeParentDAO(
      this.program,
      admin,
      parentAdmin,
      daoPda,
      moderatorPda,
      baseMint,
      quoteMint,
      squadsConfig.programConfig,
      squadsConfig.programConfigTreasury,
      treasuryMultisigPda,
      mintMultisigPda,
      mintCreateKeyPda,
      SQUADS_PROGRAM_ID,
      name,
      treasuryCosigner,
      pool,
      poolType
    ).preInstructions(this.maybeAddComputeBudget(options));

    return {
      builder,
      daoPda,
      moderatorPda,
      treasuryMultisig: treasuryMultisigPda,
      mintMultisig: mintMultisigPda,
    };
  }

  async initializeChildDAO(
    admin: PublicKey,
    parentAdmin: PublicKey,
    parentDaoName: string,
    name: string,
    tokenMint: PublicKey,
    treasuryCosigner: PublicKey,
    options?: TxOptions
  ) {
    const [daoPda] = this.deriveDAOPDA(name);
    const [parentDaoPda] = this.deriveDAOPDA(parentDaoName);
    const [mintCreateKeyPda] = this.deriveMintCreateKeyPDA(daoPda, name);

    // Derive Squads accounts (single RPC call)
    const squadsConfig = await this.fetchSquadsProgramConfig();
    const treasuryMultisigPda = this.deriveMultisigPda(daoPda);
    const mintMultisigPda = this.deriveMultisigPda(mintCreateKeyPda);

    const builder = initializeChildDAO(
      this.program,
      admin,
      parentAdmin,
      daoPda,
      parentDaoPda,
      tokenMint,
      squadsConfig.programConfig,
      squadsConfig.programConfigTreasury,
      treasuryMultisigPda,
      mintMultisigPda,
      mintCreateKeyPda,
      SQUADS_PROGRAM_ID,
      name,
      treasuryCosigner
    ).preInstructions(this.maybeAddComputeBudget(options));

    return {
      builder,
      daoPda,
      parentDaoPda,
      treasuryMultisig: treasuryMultisigPda,
      mintMultisig: mintMultisigPda,
    };
  }

  async upgradeDAO(
    admin: PublicKey,
    parentAdmin: PublicKey,
    daoName: string,
    parentDaoName: string,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    pool: PublicKey,
    poolType: PoolType,
    options?: TxOptions
  ) {
    const [daoPda] = this.deriveDAOPDA(daoName);
    const [parentDaoPda] = this.deriveDAOPDA(parentDaoName);
    const [moderatorPda] = this.deriveModeratorPDA(daoName);

    const builder = upgradeDAO(
      this.program,
      admin,
      parentAdmin,
      daoPda,
      parentDaoPda,
      moderatorPda,
      baseMint,
      quoteMint,
      pool,
      poolType
    ).preInstructions(this.maybeAddComputeBudget(options));

    return { builder, daoPda, moderatorPda };
  }
}
