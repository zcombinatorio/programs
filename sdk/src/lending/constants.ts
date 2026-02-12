/*
 * Constants for the Lending program.
 * Program ID and PDA seeds.
 */

import { PublicKey } from "@solana/web3.js";

/* Program ID (from declare_id! in lib.rs) */

export const PROGRAM_ID = new PublicKey("LEND7YMJZSudGFhVmx1xJCAahk8Vv62RQ9p4QkyeBH8");

/* PDA Seeds */

export const VAULT_SEED = Buffer.from("vault");
export const VAULT_BASE_ATA_SEED = Buffer.from("vault_base");
export const VAULT_QUOTE_ATA_SEED = Buffer.from("vault_quote");
export const POSITION_SEED = Buffer.from("position");

/* Numeric Constants */

export const PRICE_SCALE = 1_000_000_000_000n; // 1e12
export const BASIS_POINTS_DIVISOR = 10_000;
