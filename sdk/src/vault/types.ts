import { PublicKey } from "@solana/web3.js";

export enum VaultType {
  Base = 0,
  Quote = 1,
}

export enum VaultState {
  Setup = "setup",
  Active = "active",
  Finalized = "finalized",
}

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

// Event Types
export interface VaultInitializedEvent {
  vault: PublicKey;
  owner: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  proposalId: number;
  nonce: number;
}

export interface OptionAddedEvent {
  vault: PublicKey;
  optionIndex: number;
  condBaseMint: PublicKey;
  condQuoteMint: PublicKey;
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

export interface WinningsRedeemedEvent {
  vault: PublicKey;
  user: PublicKey;
  vaultType: VaultType;
  amount: bigint;
}

export interface VaultActivatedEvent {
  vault: PublicKey;
  numOptions: number;
}

export interface VaultFinalizedEvent {
  vault: PublicKey;
  winningIdx: number;
  winningBaseMint: PublicKey;
  winningQuoteMint: PublicKey;
}

export type VaultEvent =
  | { name: "VaultInitialized"; data: VaultInitializedEvent }
  | { name: "OptionAdded"; data: OptionAddedEvent }
  | { name: "VaultDeposit"; data: VaultDepositEvent }
  | { name: "VaultWithdrawal"; data: VaultWithdrawalEvent }
  | { name: "WinningsRedeemed"; data: WinningsRedeemedEvent }
  | { name: "VaultActivated"; data: VaultActivatedEvent }
  | { name: "VaultFinalized"; data: VaultFinalizedEvent };
