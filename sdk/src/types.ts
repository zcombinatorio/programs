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
  mint: PublicKey;
  nonce: number;
  proposalId: number;
  vaultType: VaultType;
  state: VaultState;
  numOptions: number;
  condMints: PublicKey[];
  winningIdx: number | null;
  bump: number;
}
