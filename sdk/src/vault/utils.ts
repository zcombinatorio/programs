import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { VAULT_SEED, CONDITIONAL_MINT_SEED, PROGRAM_ID } from "./constants";
import { VaultType, VaultState, VaultAccount } from "./types";

// =============================================================================
// PDA Derivation
// =============================================================================

export function deriveVaultPDA(
  owner: PublicKey,
  nonce: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      VAULT_SEED,
      owner.toBuffer(),
      Buffer.from([nonce]),
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

// =============================================================================
// Parsers
// =============================================================================

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

// =============================================================================
// Fetch
// =============================================================================

export async function fetchVaultAccount(
  program: Program,
  vaultPda: PublicKey
): Promise<VaultAccount> {
  const raw = await (program.account as any).vaultAccount.fetch(vaultPda);
  const { state, winningIdx } = parseVaultState(raw.state);

  return {
    owner: raw.owner,
    baseMint: raw.baseMint,
    quoteMint: raw.quoteMint,
    nonce: raw.nonce,
    proposalId: raw.proposalId,
    state,
    numOptions: raw.numOptions,
    condBaseMints: raw.condBaseMints.slice(0, raw.numOptions),
    condQuoteMints: raw.condQuoteMints.slice(0, raw.numOptions),
    winningIdx,
    bump: raw.bump,
  };
}
