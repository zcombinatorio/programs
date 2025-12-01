import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "cq3CGs4Z2Xw6wL5QLb72MQVNE9gLPS1wpDcQ5vKD1uU"
);

export const VAULT_SEED = Buffer.from("vault");
export const CONDITIONAL_MINT_SEED = Buffer.from("cmint");

export const MAX_OPTIONS = 4;
export const MIN_OPTIONS = 2;
