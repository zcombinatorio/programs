import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("FUT2Nd1EdJGZLgKdNkNeyTGS3nX76PRTQa4Wx9YcDfZC");

export const GLOBAL_CONFIG_SEED = Buffer.from("global_config");
export const MODERATOR_SEED = Buffer.from("moderator");
export const PROPOSAL_SEED = Buffer.from("proposal");

export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;
