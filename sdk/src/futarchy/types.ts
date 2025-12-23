import { BN, IdlAccounts, IdlEvents, IdlTypes } from "@coral-xyz/anchor";

// Re-export the generated IDL type
export { Futarchy } from "../generated/types";
import type { Futarchy } from "../generated/types";

// =============================================================================
// IDL-derived Types (primary account/state types)
// =============================================================================

export type GlobalConfig = IdlAccounts<Futarchy>["globalConfig"];
export type ModeratorAccount = IdlAccounts<Futarchy>["moderatorAccount"];
export type ProposalAccount = IdlAccounts<Futarchy>["proposalAccount"];
export type ProposalStateRaw = IdlTypes<Futarchy>["proposalState"];
export type TWAPConfig = IdlTypes<Futarchy>["twapConfig"];

// Event types from IDL
export type ModeratorInitializedEvent = IdlEvents<Futarchy>["moderatorInitialized"];
export type ProposalInitializedEvent = IdlEvents<Futarchy>["proposalInitialized"];
export type ProposalLaunchedEvent = IdlEvents<Futarchy>["proposalLaunched"];
export type OptionAddedEvent = IdlEvents<Futarchy>["optionAdded"];
export type ProposalFinalizedEvent = IdlEvents<Futarchy>["proposalFinalized"];
export type LiquidityRedeemedEvent = IdlEvents<Futarchy>["liquidityRedeemed"];

// =============================================================================
// Enums (user-friendly for parsing)
// =============================================================================

export enum ProposalState {
  Setup = "setup",
  Pending = "pending",
  Resolved = "resolved",
}

// =============================================================================
// Event Union Type
// =============================================================================

export type FutarchyEvent =
  | { name: "ModeratorInitialized"; data: ModeratorInitializedEvent }
  | { name: "ProposalInitialized"; data: ProposalInitializedEvent }
  | { name: "ProposalLaunched"; data: ProposalLaunchedEvent }
  | { name: "OptionAdded"; data: OptionAddedEvent }
  | { name: "ProposalFinalized"; data: ProposalFinalizedEvent }
  | { name: "LiquidityRedeemed"; data: LiquidityRedeemedEvent };
