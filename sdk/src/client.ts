import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
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

import IDL from "../../target/idl/vault.json";

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
    proposalId: number,
    vaultType: VaultType
  ): [PublicKey, number] {
    return deriveVaultPDA(owner, proposalId, vaultType, this.programId);
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

  // ===========================================================================
  // High-level Instruction Builders
  // ===========================================================================

  initialize(
    signer: PublicKey,
    mint: PublicKey,
    vaultType: VaultType,
    proposalId: number
  ) {
    const [vaultPda] = this.deriveVaultPDA(signer, proposalId, vaultType);
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
    return deposit(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      vault.condMints,
      amount
    );
  }

  async withdraw(signer: PublicKey, vaultPda: PublicKey, amount: BN | number) {
    const vault = await this.fetchVault(vaultPda);
    return withdraw(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      vault.condMints,
      amount
    );
  }

  finalize(signer: PublicKey, vaultPda: PublicKey, winningIdx: number) {
    return finalize(this.program, signer, vaultPda, winningIdx);
  }

  async redeemWinnings(signer: PublicKey, vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    return redeemWinnings(
      this.program,
      signer,
      vaultPda,
      vault.mint,
      vault.condMints
    );
  }
}
