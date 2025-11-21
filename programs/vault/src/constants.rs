// Maximum number of conditional options per vault
pub const MAX_OPTIONS: u8 = 4;

// Minimum number of conditional options required
pub const MIN_OPTIONS: u8 = 2;

// Seed constants for PDA derivation
pub const VAULT_SEED: &[u8] = b"vault";
pub const CONDITIONAL_MINT_SEED: &[u8] = b"cmint";
