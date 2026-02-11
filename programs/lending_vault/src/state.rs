use anchor_lang::prelude::*;

// ============================================================================
// PDA Seeds
// ============================================================================

#[constant]
pub const LENDING_CONFIG_SEED: &[u8] = b"lending_config";
#[constant]
pub const LENDING_POOL_SEED: &[u8] = b"lending_pool";
#[constant]
pub const USER_POSITION_SEED: &[u8] = b"user_position";
#[constant]
pub const COLLATERAL_VAULT_SEED: &[u8] = b"collateral_vault";
#[constant]
pub const LIQUIDITY_VAULT_SEED: &[u8] = b"liquidity_vault";

// ============================================================================
// Bumps
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ConfigBumps {
    pub config: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PoolBumps {
    pub pool: u8,
    pub collateral_vault: u8,
    pub liquidity_vault: u8,
}

// ============================================================================
// State Accounts
// ============================================================================

/// Global lending configuration
/// Seeds: [LENDING_CONFIG_SEED, nonce]
#[account]
#[derive(InitSpace)]
pub struct LendingConfig {
    pub bumps: ConfigBumps,
    pub nonce: u16,
    pub admin: Pubkey,
    pub fee_authority: Pubkey,
    pub protocol_fee_bps: u16,
    pub created_at: i64,
}

/// A lending pool for a specific token pair
/// Seeds: [LENDING_POOL_SEED, config, collateral_mint, liquidity_mint]
#[account]
#[derive(InitSpace)]
pub struct LendingPool {
    pub bumps: PoolBumps,
    pub config: Pubkey,
    pub collateral_mint: Pubkey,
    pub liquidity_mint: Pubkey,
    pub collateral_vault: Pubkey,
    pub liquidity_vault: Pubkey,
    // Pool parameters
    pub ltv_bps: u16,              // Loan-to-value ratio in basis points
    pub liquidation_threshold_bps: u16,
    pub liquidation_penalty_bps: u16,
    // Pool state
    pub total_deposits: u64,
    pub total_borrows: u64,
    pub interest_rate_bps: u16,
    pub last_update: i64,
    pub is_active: bool,
}

/// A user's position in a lending pool
/// Seeds: [USER_POSITION_SEED, pool, user]
#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub last_update: i64,
}
