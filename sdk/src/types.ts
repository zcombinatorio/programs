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
