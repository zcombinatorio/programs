import { PublicKey } from "@solana/web3.js";

// =============================================================================
// Enums
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
// Account Types
// =============================================================================

export interface VaultAccount {
  owner: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  nonce: number;
  proposalId: number;
  state: VaultState;
  numOptions: number;
  condBaseMints: PublicKey[];
  condQuoteMints: PublicKey[];
  winningIdx: number | null;
  bump: number;
}

// =============================================================================
// Event Types
// =============================================================================

export interface VaultInitializedEvent {
  vault: PublicKey;
  owner: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  nonce: number;
}

export interface VaultActivatedEvent {
  vault: PublicKey;
  numOptions: number;
}

export interface VaultDepositEvent {
  vault: PublicKey;
  user: PublicKey;
  vaultType: VaultType;
  amount: bigint;
}

export interface VaultWithdrawalEvent {
  vault: PublicKey;
  user: PublicKey;
  vaultType: VaultType;
  amount: bigint;
}

export interface VaultFinalizedEvent {
  vault: PublicKey;
  winningIdx: number;
  winningBaseMint: PublicKey;
  winningQuoteMint: PublicKey;
}

export interface OptionAddedEvent {
  vault: PublicKey;
  optionIndex: number;
  condBaseMint: PublicKey;
  condQuoteMint: PublicKey;
}

export interface WinningsRedeemedEvent {
  vault: PublicKey;
  user: PublicKey;
  vaultType: VaultType;
  amount: bigint;
}

export type VaultEvent =
  | { name: "VaultInitialized"; data: VaultInitializedEvent }
  | { name: "VaultActivated"; data: VaultActivatedEvent }
  | { name: "VaultDeposit"; data: VaultDepositEvent }
  | { name: "VaultWithdrawal"; data: VaultWithdrawalEvent }
  | { name: "VaultFinalized"; data: VaultFinalizedEvent }
  | { name: "OptionAdded"; data: OptionAddedEvent }
  | { name: "WinningsRedeemed"; data: WinningsRedeemedEvent };
