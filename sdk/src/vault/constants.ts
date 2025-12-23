/*
 * Constants for the Vault program.
 * Parsed from the generated IDL to stay in sync with the Rust program.
 */

import { PublicKey } from "@solana/web3.js";
import { VaultIDL } from "../generated/idls";
import { parseIdlBytes, getIdlConstant } from "../utils";

/* Program ID */

export const PROGRAM_ID = new PublicKey(VaultIDL.address);

/* PDA Seeds */

export const VAULT_SEED = parseIdlBytes(getIdlConstant(VaultIDL, "VAULT_SEED"));
export const CONDITIONAL_MINT_SEED = parseIdlBytes(getIdlConstant(VaultIDL, "CONDITIONAL_MINT_SEED"));

/* Numeric Constants */

export const MAX_OPTIONS = Number(getIdlConstant(VaultIDL, "MAX_OPTIONS"));
export const MIN_OPTIONS = Number(getIdlConstant(VaultIDL, "MIN_OPTIONS"));
export const VAULT_VERSION = Number(getIdlConstant(VaultIDL, "VAULT_VERSION"));
