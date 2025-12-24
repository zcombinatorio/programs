/*
 * Type definitions for the Futarchy program.
 * Derived from the generated IDL types.
 */

import { IdlAccounts, IdlEvents, IdlTypes } from "@coral-xyz/anchor";

// Re-export the generated IDL type
export { Futarchy } from "../generated/types";
import type { Futarchy } from "../generated/types";

/* Account Types */

export type DAOAccount = IdlAccounts<Futarchy>["daoAccount"];
export type ModeratorAccount = IdlAccounts<Futarchy>["moderatorAccount"];
export type ProposalAccount = IdlAccounts<Futarchy>["proposalAccount"];

/* IDL Types */

export type ProposalParams = IdlTypes<Futarchy>["proposalParams"];
export type ProposalStateRaw = IdlTypes<Futarchy>["proposalState"];
export type DAOType = IdlTypes<Futarchy>["daoType"];
export type PoolType = IdlTypes<Futarchy>["poolType"];

/* Event Types */

export type DAOInitializedEvent = IdlEvents<Futarchy>["daoInitialized"];
export type DAOUpgradedEvent = IdlEvents<Futarchy>["daoUpgraded"];
export type ModeratorInitializedEvent = IdlEvents<Futarchy>["moderatorInitialized"];
export type ProposalInitializedEvent = IdlEvents<Futarchy>["proposalInitialized"];
export type ProposalLaunchedEvent = IdlEvents<Futarchy>["proposalLaunched"];
export type OptionAddedEvent = IdlEvents<Futarchy>["optionAdded"];
export type ProposalFinalizedEvent = IdlEvents<Futarchy>["proposalFinalized"];
export type LiquidityRedeemedEvent = IdlEvents<Futarchy>["liquidityRedeemed"];

/* Enums */

export enum ProposalState {
  Setup = "setup",
  Pending = "pending",
  Resolved = "resolved",
}

/* Event Union Type */

export type FutarchyEvent =
  | { name: "DAOInitialized"; data: DAOInitializedEvent }
  | { name: "DAOUpgraded"; data: DAOUpgradedEvent }
  | { name: "ModeratorInitialized"; data: ModeratorInitializedEvent }
  | { name: "ProposalInitialized"; data: ProposalInitializedEvent }
  | { name: "ProposalLaunched"; data: ProposalLaunchedEvent }
  | { name: "OptionAdded"; data: OptionAddedEvent }
  | { name: "ProposalFinalized"; data: ProposalFinalizedEvent }
  | { name: "LiquidityRedeemed"; data: LiquidityRedeemedEvent };
