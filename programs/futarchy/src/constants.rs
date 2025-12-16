use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";

#[constant]
pub const MODERATOR_SEED: &[u8] = b"moderator";

#[constant]
pub const PROPOSAL_SEED: &[u8] = b"proposal";

#[constant]
pub const MODERATOR_VERSION: u8 = 1;

#[constant]
pub const PROPOSAL_VERSION: u8 = 1;

#[constant]
pub const GLOBAL_CONFIG_VERSION: u8 = 1;

// Maximum number of conditional options
// Bottle-necked by launch_proposal (64 account max)
#[constant]
pub const MAX_OPTIONS: u8 = 6;

// Minimum number of conditional options required
#[constant]
pub const MIN_OPTIONS: u8 = 2;
