import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("D2E45PQk715zosJaJcwauGP5PiyBipYQpNqsCrQMGMWV");

export const GLOBAL_CONFIG_SEED = Buffer.from("global_config");
export const MODERATOR_SEED = Buffer.from("moderator");
export const PROPOSAL_SEED = Buffer.from("proposal");

export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;
