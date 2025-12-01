import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "4oiXvA71BdpWsdcmjMysn57W3FzB9uqbujtq7Vpzt7ag"
);

export const VAULT_SEED = Buffer.from("vault");
export const CONDITIONAL_MINT_SEED = Buffer.from("cmint");

export const MAX_OPTIONS = 4;
export const MIN_OPTIONS = 2;
