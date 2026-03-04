use anchor_lang::prelude::*;

// Maximum number of conditional options per vault
#[constant]
pub const MAX_OPTIONS: u8 = 8;

// Minimum number of conditional options required
#[constant]
pub const MIN_OPTIONS: u8 = 2;

#[constant]
pub const VAULT_VERSION: u8 = 2;

// Seed constants for PDA derivation
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const CONDITIONAL_MINT_SEED: &[u8] = b"cmint";

#[constant]
pub const CLAIM_LOCK_SEED: &[u8] = b"claim_lock";
