/*
 * Type definitions for the SVault program.
 * Exports IDL-derived types and SDK-friendly enums.
 */

import { IdlAccounts, IdlEvents } from "@coral-xyz/anchor";
import { TxOptions } from "../utils";

export { Svault } from "../generated/types";
import type { Svault } from "../generated/types";

/* IDL-derived Account Types */

export type StakingConfigAccount = IdlAccounts<Svault>["stakingConfig"];
export type UserStakeAccount = IdlAccounts<Svault>["userStake"];
export type DelegateAccount = IdlAccounts<Svault>["delegate"];

/* IDL-derived Event Types */

export type StakingVaultInitializedEvent = IdlEvents<Svault>["stakingVaultInitialized"];
export type StakedEvent = IdlEvents<Svault>["staked"];
export type UnstakeInitiatedEvent = IdlEvents<Svault>["unstakeInitiated"];
export type WithdrawnEvent = IdlEvents<Svault>["withdrawn"];
export type RewardsPostedEvent = IdlEvents<Svault>["rewardsPosted"];
export type RewardsClaimedEvent = IdlEvents<Svault>["rewardsClaimed"];
export type SlashedEvent = IdlEvents<Svault>["slashed"];
export type DelegateAddedEvent = IdlEvents<Svault>["delegateAdded"];
export type DelegateRemovedEvent = IdlEvents<Svault>["delegateRemoved"];

/* Event Union Type */

export type SVaultEvent =
  | { name: "StakingVaultInitialized"; data: StakingVaultInitializedEvent }
  | { name: "Staked"; data: StakedEvent }
  | { name: "UnstakeInitiated"; data: UnstakeInitiatedEvent }
  | { name: "Withdrawn"; data: WithdrawnEvent }
  | { name: "RewardsPosted"; data: RewardsPostedEvent }
  | { name: "RewardsClaimed"; data: RewardsClaimedEvent }
  | { name: "Slashed"; data: SlashedEvent }
  | { name: "DelegateAdded"; data: DelegateAddedEvent }
  | { name: "DelegateRemoved"; data: DelegateRemovedEvent };

/* Client Options */

export interface SVaultTxOptions extends TxOptions {}
