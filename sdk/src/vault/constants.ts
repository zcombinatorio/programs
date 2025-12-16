import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC");

export const VAULT_SEED = Buffer.from("vault");
export const CONDITIONAL_MINT_SEED = Buffer.from("cmint");

export const MAX_OPTIONS = 8;
export const MIN_OPTIONS = 2;
