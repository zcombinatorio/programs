import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// =============================================================================
// Enums
// =============================================================================

export enum ProposalState {
  Setup = "setup",
  Pending = "pending",
  Resolved = "resolved",
}

// =============================================================================
// Account Types
// =============================================================================

export interface GlobalConfig {
  moderatorIdCounter: number;
}

export interface ModeratorAccount {
  id: number;
  quoteMint: PublicKey;
  baseMint: PublicKey;
  proposalIdCounter: number;
  bump: number;
}

export interface TWAPConfig {
  startingObservation: BN;
  maxObservationDelta: BN;
  warmupDuration: number;
}

export interface ProposalAccount {
  creator: PublicKey;
  moderator: PublicKey;
  id: number;
  numOptions: number;
  state: ProposalState;
  createdAt: BN;
  length: number;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  vault: PublicKey;
  pools: PublicKey[];
  fee: number;
  twapConfig: TWAPConfig;
  bump: number;
  winningIdx: number | null;
}

// =============================================================================
// Event Types
// =============================================================================

export interface ModeratorInitializedEvent {
  id: number;
  moderator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
}

export interface ProposalInitializedEvent {
  proposalId: number;
  proposal: PublicKey;
  moderator: PublicKey;
  creator: PublicKey;
  vault: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  length: number;
}

export interface ProposalLaunchedEvent {
  proposalId: number;
  proposal: PublicKey;
  numOptions: number;
  baseAmount: bigint;
  quoteAmount: bigint;
  createdAt: bigint;
}

export interface OptionAddedEvent {
  proposalId: number;
  proposal: PublicKey;
  optionIndex: number;
  pool: PublicKey;
}

export interface ProposalFinalizedEvent {
  proposalId: number;
  proposal: PublicKey;
  winningIdx: number;
}

export interface LiquidityRedeemedEvent {
  proposalId: number;
  proposal: PublicKey;
  redeemer: PublicKey;
  winningIdx: number;
}

export type FutarchyEvent =
  | { name: "ModeratorInitialized"; data: ModeratorInitializedEvent }
  | { name: "ProposalInitialized"; data: ProposalInitializedEvent }
  | { name: "ProposalLaunched"; data: ProposalLaunchedEvent }
  | { name: "OptionAdded"; data: OptionAddedEvent }
  | { name: "ProposalFinalized"; data: ProposalFinalizedEvent }
  | { name: "LiquidityRedeemed"; data: LiquidityRedeemedEvent };
