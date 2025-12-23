/*
 * Utility functions for the Vault program.
 * PDA derivation, state parsing, and account fetching.
 */

import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { VAULT_SEED, CONDITIONAL_MINT_SEED, PROGRAM_ID } from "./constants";
import { Vault, VaultType, VaultState, VaultAccount } from "./types";

/* PDA Derivation */

export function deriveVaultPDA(
  owner: PublicKey,
  nonce: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(2);
  nonceBuffer.writeUInt16LE(nonce);
  return PublicKey.findProgramAddressSync(
    [
      VAULT_SEED,
      owner.toBuffer(),
      nonceBuffer,
    ],
    programId
  );
}

export function deriveConditionalMint(
  vaultPda: PublicKey,
  vaultType: VaultType,
  index: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      CONDITIONAL_MINT_SEED,
      vaultPda.toBuffer(),
      Buffer.from([vaultType]),
      Buffer.from([index]),
    ],
    programId
  );
}

/* Parsers */

export function parseVaultState(state: any): { state: VaultState; winningIdx: number | null } {
  if ("setup" in state) {
    return { state: VaultState.Setup, winningIdx: null };
  }
  if ("active" in state) {
    return { state: VaultState.Active, winningIdx: null };
  }
  if ("finalized" in state) {
    const winningIdx = state.finalized[0] ?? state.finalized;
    return { state: VaultState.Finalized, winningIdx };
  }
  throw new Error("Unknown vault state");
}

/* Fetch */

export async function fetchVaultAccount(
  program: Program<Vault>,
  vaultPda: PublicKey
): Promise<VaultAccount> {
  return program.account.vaultAccount.fetch(vaultPda);
}
