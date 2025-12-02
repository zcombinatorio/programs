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
    proposalId: number,
    vaultType: VaultType
  ): [PublicKey, number] {
    return deriveVaultPDA(owner, nonce, proposalId, vaultType, this.programId);
  }

  deriveConditionalMint(
    vaultPda: PublicKey,
    index: number
  ): [PublicKey, number] {
    return deriveConditionalMint(vaultPda, index, this.programId);
  }

  // ===========================================================================
  // Fetch
  // ===========================================================================

  async fetchVault(vaultPda: PublicKey): Promise<VaultAccount> {
    return fetchVaultAccount(this.program, vaultPda);
  }

  async fetchUserATAs(vaultPda: PublicKey, user: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    return {
      userAta: getAssociatedTokenAddressSync(vault.mint, user),
      userCondATAs: vault.condMints.map((m) =>
        getAssociatedTokenAddressSync(m, user)
      ),
    };
  }

  async fetchVaultATA(vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    return getAssociatedTokenAddressSync(vault.mint, vaultPda, true);
  }

  async fetchUserBalances(vaultPda: PublicKey, user: PublicKey) {
    const { userAta, userCondATAs } = await this.fetchUserATAs(vaultPda, user);
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

  async fetchVaultBalance(vaultPda: PublicKey) {
    const vaultAta = await this.fetchVaultATA(vaultPda);
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
    mint: PublicKey,
    vaultType: VaultType,
    nonce: number,
    proposalId: number
  ) {
    const [vaultPda] = this.deriveVaultPDA(
      signer,
      nonce,
      proposalId,
      vaultType
    );
    const [condMint0] = this.deriveConditionalMint(vaultPda, 0);
    const [condMint1] = this.deriveConditionalMint(vaultPda, 1);

    const builder = initialize(
      this.program,
      signer,
      vaultPda,
      mint,
      condMint0,
      condMint1,
      vaultType,
      nonce,
      proposalId
    );

    return { builder, vaultPda, condMint0, condMint1 };
  }

  async addOption(signer: PublicKey, vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    const [condMint] = this.deriveConditionalMint(vaultPda, vault.numOptions);

    const builder = addOption(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      condMint
    );

    return { builder, condMint };
  }

  activate(signer: PublicKey, vaultPda: PublicKey) {
    return activate(this.program, signer, vaultPda);
  }

  async deposit(signer: PublicKey, vaultPda: PublicKey, amount: BN | number) {
    const vault = await this.fetchVault(vaultPda);
    const builder = deposit(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      vault.condMints,
      amount
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: MAX_COMPUTE_UNITS,
    });

    if (vault.mint.equals(NATIVE_MINT)) {
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

  async withdraw(signer: PublicKey, vaultPda: PublicKey, amount: BN | number) {
    const vault = await this.fetchVault(vaultPda);
    const builder = withdraw(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      vault.condMints,
      amount
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: MAX_COMPUTE_UNITS,
    });

    if (vault.mint.equals(NATIVE_MINT)) {
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

  async redeemWinnings(signer: PublicKey, vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    const builder = redeemWinnings(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      vault.condMints
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: MAX_COMPUTE_UNITS,
    });

    if (vault.mint.equals(NATIVE_MINT)) {
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      const unwrapIx = createCloseAccountInstruction(wsolAta, signer, signer);
      return builder
        .preInstructions([computeBudgetIx])
        .postInstructions([unwrapIx]);
    }

    return builder.preInstructions([computeBudgetIx]);
  }
}
