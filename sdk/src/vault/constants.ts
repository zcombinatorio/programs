import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("vLTgeZhLgcr4HvBGxKonSnmU4t7qLcgsVcVtUd3haZc");

export const VAULT_SEED = Buffer.from("vault");
export const CONDITIONAL_MINT_SEED = Buffer.from("cmint");

export const MAX_OPTIONS = 8;
export const MIN_OPTIONS = 2;
