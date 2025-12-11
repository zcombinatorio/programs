import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GLOBAL_CONFIG_SEED, MODERATOR_SEED, PROPOSAL_SEED, PROGRAM_ID } from "./constants";
import { GlobalConfig, ModeratorAccount, ProposalAccount, ProposalState, TWAPConfig } from "./types";

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
  return PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, moderator.toBuffer(), Buffer.from([proposalId])],
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
  program: Program,
  programId: PublicKey = PROGRAM_ID
): Promise<GlobalConfig> {
  const [globalConfigPda] = deriveGlobalConfigPDA(programId);
  const raw = await (program.account as any).globalConfig.fetch(globalConfigPda);

  return {
    moderatorIdCounter: raw.moderatorIdCounter,
  };
}

export async function fetchModeratorAccount(
  program: Program,
  moderatorPda: PublicKey
): Promise<ModeratorAccount> {
  const raw = await (program.account as any).moderatorAccount.fetch(moderatorPda);

  return {
    id: raw.id,
    quoteMint: raw.quoteMint,
    baseMint: raw.baseMint,
    proposalIdCounter: raw.proposalIdCounter,
    bump: raw.bump,
  };
}

export async function fetchProposalAccount(
  program: Program,
  proposalPda: PublicKey
): Promise<ProposalAccount> {
  const raw = await (program.account as any).proposalAccount.fetch(proposalPda);
  const { state, winningIdx } = parseProposalState(raw.state);

  return {
    creator: raw.creator,
    moderator: raw.moderator,
    id: raw.id,
    numOptions: raw.numOptions,
    state,
    createdAt: raw.createdAt,
    length: raw.length,
    baseMint: raw.baseMint,
    quoteMint: raw.quoteMint,
    vault: raw.vault,
    pools: raw.pools.slice(0, raw.numOptions),
    fee: raw.fee,
    twapConfig: {
      startingObservation: raw.twapConfig.startingObservation,
      maxObservationDelta: raw.twapConfig.maxObservationDelta,
      warmupDuration: raw.twapConfig.warmupDuration,
    },
    bump: raw.bump,
    winningIdx,
  };
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
