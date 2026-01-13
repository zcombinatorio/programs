/*
 * Constants for the SVault program.
 * Parsed from the generated IDL to stay in sync with the Rust program.
 */

import { PublicKey } from "@solana/web3.js";
import { SvaultIDL } from "../generated/idls";
import { parseIdlBytes, getIdlConstant } from "../utils";

/* Program ID */

export const PROGRAM_ID = new PublicKey(SvaultIDL.address);

/* PDA Seeds */

export const STAKING_CONFIG_SEED = parseIdlBytes(getIdlConstant(SvaultIDL, "STAKING_CONFIG_SEED"));
export const USER_STAKE_SEED = parseIdlBytes(getIdlConstant(SvaultIDL, "USER_STAKE_SEED"));
export const STAKE_VAULT_SEED = parseIdlBytes(getIdlConstant(SvaultIDL, "STAKE_VAULT_SEED"));
export const REWARD_VAULT_SEED = parseIdlBytes(getIdlConstant(SvaultIDL, "REWARD_VAULT_SEED"));

/* Time Constants */

export const SECONDS_PER_DAY = 86400;
