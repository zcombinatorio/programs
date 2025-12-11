use anchor_lang::prelude::*;

// Maximum number of conditional options per vault
#[constant]
pub const MAX_OPTIONS: u8 = 8;

// Minimum number of conditional options required
#[constant]
pub const MIN_OPTIONS: u8 = 2;

// Seed constants for PDA derivation
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
pub const CONDITIONAL_MINT_SEED: &[u8] = b"cmint";
