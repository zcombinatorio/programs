import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { VAULT_SEED, CONDITIONAL_MINT_SEED, PROGRAM_ID } from "./constants";
import { VaultType, VaultState, VaultAccount } from "./types";

// =============================================================================
// PDA Helpers
// =============================================================================

export function deriveVaultPDA(
  owner: PublicKey,
  nonce: number,
  proposalId: number,
  vaultType: VaultType,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      VAULT_SEED,
      owner.toBuffer(),
      Buffer.from([nonce]),
      Buffer.from([proposalId]),
      Buffer.from([vaultType]),
    ],
    programId
  );
}

export function deriveConditionalMint(
  vaultPda: PublicKey,
  index: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONDITIONAL_MINT_SEED, vaultPda.toBuffer(), Buffer.from([index])],
    programId
  );
}

// =============================================================================
// Parsers
// =============================================================================

export function parseVaultState(state: any): VaultState {
  if ("setup" in state) return VaultState.Setup;
  if ("active" in state) return VaultState.Active;
  if ("finalized" in state) return VaultState.Finalized;
  throw new Error("Unknown vault state");
}

export function parseVaultType(vaultType: any): VaultType {
  if ("base" in vaultType) return VaultType.Base;
  if ("quote" in vaultType) return VaultType.Quote;
  throw new Error("Unknown vault type");
}

// =============================================================================
// Fetch
// =============================================================================

export async function fetchVaultAccount(
  program: Program,
  vaultPda: PublicKey
): Promise<VaultAccount> {
  const raw = await (program.account as any).vaultAccount.fetch(vaultPda);

  return {
    owner: raw.owner,
    mint: raw.mint,
    nonce: raw.nonce,
    proposalId: raw.proposalId,
    vaultType: parseVaultType(raw.vaultType),
    state: parseVaultState(raw.state),
    numOptions: raw.numOptions,
    condMints: raw.condMints.slice(0, raw.numOptions),
    winningIdx: raw.winningIdx ?? null,
    bump: raw.bump,
  };
}
