/*
 * Constants for the AMM program.
 * Parsed from the generated IDL to stay in sync with the Rust program.
 */

import { PublicKey } from "@solana/web3.js";
import { AmmIDL } from "../generated/idls";
import { parseIdlBytes, getIdlConstant } from "../utils";

/* Program ID */

export const PROGRAM_ID = new PublicKey(AmmIDL.address);

/* Authorities */

export const FEE_AUTHORITY = new PublicKey(getIdlConstant(AmmIDL, "FEE_AUTHORITY"));

/* PDA Seeds */

export const POOL_SEED = parseIdlBytes(getIdlConstant(AmmIDL, "POOL_SEED"));
export const RESERVE_SEED = parseIdlBytes(getIdlConstant(AmmIDL, "RESERVE_SEED"));
export const FEE_VAULT_SEED = parseIdlBytes(getIdlConstant(AmmIDL, "FEE_VAULT_SEED"));

/* Numeric Constants */

export const MAX_FEE = Number(getIdlConstant(AmmIDL, "MAX_FEE"));
export const AMM_VERSION = Number(getIdlConstant(AmmIDL, "AMM_VERSION"));

/* Price Constants (not in IDL - internal to Rust) */

export const PRICE_SCALE = 1_000_000_000_000n;
