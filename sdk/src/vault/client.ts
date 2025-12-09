import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PROGRAM_ID } from "./constants";
import { VaultType, VaultAccount } from "./types";
import {
  deriveVaultPDA,
  deriveConditionalMint,
  fetchVaultAccount,
} from "./utils";
import {
  initialize,
  addOption,
  activate,
  deposit,
  withdraw,
  finalize,
  redeemWinnings,
} from "./instructions";

import IDL from "./generated/vault.json";

// Max compute units for deposit/withdraw/redeem operations
const MAX_COMPUTE_UNITS = 450_000;

export class VaultClient {
  public program: Program;
  public programId: PublicKey;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.programId = programId ?? PROGRAM_ID;
    this.program = new Program(IDL as Idl, provider);
  }

  // ===========================================================================
  // PDA Helpers
  // ===========================================================================

  deriveVaultPDA(
    owner: PublicKey,
    nonce: number,
    proposalId: number
  ): [PublicKey, number] {
    return deriveVaultPDA(owner, nonce, proposalId, this.programId);
  }

  deriveConditionalMint(
    vaultPda: PublicKey,
    vaultType: VaultType,
    index: number
  ): [PublicKey, number] {
    return deriveConditionalMint(vaultPda, vaultType, index, this.programId);
  }

  // ===========================================================================
  // Fetch
  // ===========================================================================

  async fetchVault(vaultPda: PublicKey): Promise<VaultAccount> {
    return fetchVaultAccount(this.program, vaultPda);
  }

  async fetchUserATAs(vaultPda: PublicKey, user: PublicKey, vaultType: VaultType) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint : vault.quoteMint;
    const condMints = vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints;
    return {
      userAta: getAssociatedTokenAddressSync(mint, user),
      userCondATAs: condMints.map((m) =>
        getAssociatedTokenAddressSync(m, user)
      ),
    };
  }

  async fetchVaultATA(vaultPda: PublicKey, vaultType: VaultType) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint : vault.quoteMint;
    return getAssociatedTokenAddressSync(mint, vaultPda, true);
  }

  async fetchUserBalances(vaultPda: PublicKey, user: PublicKey, vaultType: VaultType) {
    const { userAta, userCondATAs } = await this.fetchUserATAs(vaultPda, user, vaultType);
    const connection = this.program.provider.connection;

    const getBalanceSafe = async (ata: PublicKey) => {
      try {
        const acc = await getAccount(connection, ata);
        return Number(acc.amount);
      } catch (e) {
        if (e instanceof TokenAccountNotFoundError) {
          return 0;
        }
        throw e;
      }
    };

    const [userBalance, ...condBalances] = await Promise.all([
      getBalanceSafe(userAta),
      ...userCondATAs.map(getBalanceSafe),
    ]);

    return { userBalance, condBalances };
  }

  async fetchVaultBalance(vaultPda: PublicKey, vaultType: VaultType) {
    const vaultAta = await this.fetchVaultATA(vaultPda, vaultType);
    try {
      const acc = await getAccount(this.program.provider.connection, vaultAta);
      return Number(acc.amount);
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) {
        return 0;
      }
      throw e;
    }
  }

  // ===========================================================================
  // High-level Instruction Builders
  // ===========================================================================

  initialize(
    signer: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    nonce: number,
    proposalId: number
  ) {
    const [vaultPda] = this.deriveVaultPDA(signer, nonce, proposalId);
    const [condBaseMint0] = this.deriveConditionalMint(vaultPda, VaultType.Base, 0);
    const [condBaseMint1] = this.deriveConditionalMint(vaultPda, VaultType.Base, 1);
    const [condQuoteMint0] = this.deriveConditionalMint(vaultPda, VaultType.Quote, 0);
    const [condQuoteMint1] = this.deriveConditionalMint(vaultPda, VaultType.Quote, 1);

    const builder = initialize(
      this.program,
      signer,
      vaultPda,
      baseMint,
      quoteMint,
      condBaseMint0,
      condBaseMint1,
      condQuoteMint0,
      condQuoteMint1,
      nonce,
      proposalId
    );

    return {
      builder,
      vaultPda,
      condBaseMint0,
      condBaseMint1,
      condQuoteMint0,
      condQuoteMint1,
    };
  }

  async addOption(signer: PublicKey, vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    const [condBaseMint] = this.deriveConditionalMint(vaultPda, VaultType.Base, vault.numOptions);
    const [condQuoteMint] = this.deriveConditionalMint(vaultPda, VaultType.Quote, vault.numOptions);

    const builder = addOption(
      this.program,
      signer,
      vaultPda,
      vault.baseMint,
      vault.quoteMint,
      condBaseMint,
      condQuoteMint
    );

    return { builder, condBaseMint, condQuoteMint };
  }

  activate(signer: PublicKey, vaultPda: PublicKey) {
    return activate(this.program, signer, vaultPda);
  }

  async deposit(
    signer: PublicKey,
    vaultPda: PublicKey,
    vaultType: VaultType,
    amount: BN | number
  ) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint : vault.quoteMint;
    const condMints = vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints;

    const builder = deposit(
      this.program,
      signer,
      vaultPda,
      mint,
      condMints,
      vaultType,
      amount
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: MAX_COMPUTE_UNITS,
    });

    if (mint.equals(NATIVE_MINT)) {
      const amountBN = typeof amount === "number" ? new BN(amount) : amount;
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      const wrapIxs = [
        computeBudgetIx,
        createAssociatedTokenAccountIdempotentInstruction(
          signer,
          wsolAta,
          signer,
          NATIVE_MINT
        ),
        SystemProgram.transfer({
          fromPubkey: signer,
          toPubkey: wsolAta,
          lamports: BigInt(amountBN.toString()),
        }),
        createSyncNativeInstruction(wsolAta),
      ];
      return builder.preInstructions(wrapIxs);
    }

    return builder.preInstructions([computeBudgetIx]);
  }

  async withdraw(
    signer: PublicKey,
    vaultPda: PublicKey,
    vaultType: VaultType,
    amount: BN | number
  ) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint : vault.quoteMint;
    const condMints = vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints;

    const builder = withdraw(
      this.program,
      signer,
      vaultPda,
      mint,
      condMints,
      vaultType,
      amount
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: MAX_COMPUTE_UNITS,
    });

    if (mint.equals(NATIVE_MINT)) {
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      const unwrapIx = createCloseAccountInstruction(wsolAta, signer, signer);
      return builder
        .preInstructions([computeBudgetIx])
        .postInstructions([unwrapIx]);
    }

    return builder.preInstructions([computeBudgetIx]);
  }

  finalize(signer: PublicKey, vaultPda: PublicKey, winningIdx: number) {
    return finalize(this.program, signer, vaultPda, winningIdx);
  }

  async redeemWinnings(signer: PublicKey, vaultPda: PublicKey, vaultType: VaultType) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint : vault.quoteMint;
    const condMints = vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints;

    const builder = redeemWinnings(
      this.program,
      signer,
      vaultPda,
      mint,
      condMints,
      vaultType
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: MAX_COMPUTE_UNITS,
    });

    if (mint.equals(NATIVE_MINT)) {
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      const unwrapIx = createCloseAccountInstruction(wsolAta, signer, signer);
      return builder
        .preInstructions([computeBudgetIx])
        .postInstructions([unwrapIx]);
    }

    return builder.preInstructions([computeBudgetIx]);
  }
}
