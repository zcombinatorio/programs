import { IdlAccounts, IdlEvents, IdlTypes } from "@coral-xyz/anchor";

// Re-export the generated IDL type
export { Vault } from "../generated/types";
import type { Vault } from "../generated/types";

// =============================================================================
// IDL-derived Types (primary account/state types)
// =============================================================================

export type VaultAccount = IdlAccounts<Vault>["vaultAccount"];
export type VaultStateRaw = IdlTypes<Vault>["vaultState"];
export type VaultTypeRaw = IdlTypes<Vault>["vaultType"];

// Event types from IDL
export type VaultInitializedEvent = IdlEvents<Vault>["vaultInitialized"];
export type VaultActivatedEvent = IdlEvents<Vault>["vaultActivated"];
export type VaultDepositEvent = IdlEvents<Vault>["vaultDeposit"];
export type VaultWithdrawalEvent = IdlEvents<Vault>["vaultWithdrawal"];
export type VaultFinalizedEvent = IdlEvents<Vault>["vaultFinalized"];
export type OptionAddedEvent = IdlEvents<Vault>["optionAdded"];
export type WinningsRedeemedEvent = IdlEvents<Vault>["winningsRedeemed"];

// =============================================================================
// SDK Enums (user-friendly for parsing)
// =============================================================================

export enum VaultType {
  Base = 0,
  Quote = 1,
}

export enum VaultState {
  Setup = "setup",
  Active = "active",
  Finalized = "finalized",
}

// =============================================================================
// Event Union Type
// =============================================================================

export type VaultEvent =
  | { name: "VaultInitialized"; data: VaultInitializedEvent }
  | { name: "VaultActivated"; data: VaultActivatedEvent }
  | { name: "VaultDeposit"; data: VaultDepositEvent }
  | { name: "VaultWithdrawal"; data: VaultWithdrawalEvent }
  | { name: "VaultFinalized"; data: VaultFinalizedEvent }
  | { name: "OptionAdded"; data: OptionAddedEvent }
  | { name: "WinningsRedeemed"; data: WinningsRedeemedEvent };
