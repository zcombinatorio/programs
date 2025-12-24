/*
 * Constants for the Futarchy program.
 * Parsed from the generated IDL to stay in sync with the Rust program.
 */

import { PublicKey } from "@solana/web3.js";
import { FutarchyIDL } from "../generated/idls";
import { parseIdlBytes, getIdlConstant } from "../utils";

/* Program ID */

export const PROGRAM_ID = new PublicKey(FutarchyIDL.address);

/* PDA Seeds */

export const DAO_SEED = parseIdlBytes(getIdlConstant(FutarchyIDL, "DAO_SEED"));
export const MODERATOR_SEED = parseIdlBytes(getIdlConstant(FutarchyIDL, "MODERATOR_SEED"));
export const PROPOSAL_SEED = parseIdlBytes(getIdlConstant(FutarchyIDL, "PROPOSAL_SEED"));

/* Numeric Constants */

export const MAX_OPTIONS = Number(getIdlConstant(FutarchyIDL, "MAX_OPTIONS"));
export const MIN_OPTIONS = Number(getIdlConstant(FutarchyIDL, "MIN_OPTIONS"));

/* Squads Integration */

export const SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
export const MINT_CREATE_KEY_SEED = parseIdlBytes(getIdlConstant(FutarchyIDL, "MINT_CREATE_KEY_SEED"));
