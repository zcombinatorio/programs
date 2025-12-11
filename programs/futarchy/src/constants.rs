use anchor_lang::prelude::*;

#[constant]
pub const MODERATOR_SEED: &[u8] = b"moderator";

#[constant]
pub const PROPOSAL_SEED: &[u8] = b"proposal";

// Maximum number of conditional options per vault
#[constant]
pub const MAX_OPTIONS: u8 = 8;

// Minimum number of conditional options required
#[constant]
pub const MIN_OPTIONS: u8 = 2;
