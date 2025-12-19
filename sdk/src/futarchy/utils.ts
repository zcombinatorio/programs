import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GLOBAL_CONFIG_SEED, MODERATOR_SEED, PROPOSAL_SEED, PROGRAM_ID } from "./constants";
import { Futarchy, GlobalConfig, ModeratorAccount, ProposalAccount, ProposalState } from "./types";

// =============================================================================
// PDA Derivation
// =============================================================================

export function deriveGlobalConfigPDA(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], programId);
}

export function deriveModeratorPDA(
  moderatorId: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MODERATOR_SEED, Buffer.from(new Uint32Array([moderatorId]).buffer)],
    programId
  );
}

export function deriveProposalPDA(
  moderator: PublicKey,
  proposalId: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const proposalIdBuffer = Buffer.alloc(2);
  proposalIdBuffer.writeUInt16LE(proposalId);
  return PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, moderator.toBuffer(), proposalIdBuffer],
    programId
  );
}

// =============================================================================
// Parsers
// =============================================================================

export function parseProposalState(state: any): { state: ProposalState; winningIdx: number | null } {
  if ("setup" in state) {
    return { state: ProposalState.Setup, winningIdx: null };
  }
  if ("pending" in state) {
    return { state: ProposalState.Pending, winningIdx: null };
  }
  if ("resolved" in state) {
    const winningIdx = state.resolved[0] ?? state.resolved;
    return { state: ProposalState.Resolved, winningIdx };
  }
  throw new Error("Unknown proposal state");
}

// =============================================================================
// Fetch
// =============================================================================

export async function fetchGlobalConfig(
  program: Program<Futarchy>,
  programId: PublicKey = PROGRAM_ID
): Promise<GlobalConfig> {
  const [globalConfigPda] = deriveGlobalConfigPDA(programId);
  return program.account.globalConfig.fetch(globalConfigPda);
}

export async function fetchModeratorAccount(
  program: Program<Futarchy>,
  moderatorPda: PublicKey
): Promise<ModeratorAccount> {
  return program.account.moderatorAccount.fetch(moderatorPda);
}

export async function fetchProposalAccount(
  program: Program<Futarchy>,
  proposalPda: PublicKey
): Promise<ProposalAccount> {
  return program.account.proposalAccount.fetch(proposalPda);
}

/**
 * Check if a proposal has expired and is ready for finalization
 */
export function isProposalExpired(proposal: ProposalAccount, currentTime?: number): boolean {
  const now = currentTime ?? Math.floor(Date.now() / 1000);
  const endTime = proposal.createdAt.toNumber() + proposal.length;
  return now >= endTime;
}

/**
 * Get the time remaining until proposal expiration (in seconds)
 */
export function getTimeRemaining(proposal: ProposalAccount, currentTime?: number): number {
  const now = currentTime ?? Math.floor(Date.now() / 1000);
  const endTime = proposal.createdAt.toNumber() + proposal.length;
  return Math.max(0, endTime - now);
}
