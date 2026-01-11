pub use anchor_lang::prelude::*;

#[constant]
pub const STAKING_CONFIG_SEED: &[u8] = b"staking_config";
#[constant]
pub const USER_STAKE_SEED: &[u8] = b"user_stake";
#[constant]
pub const REWARD_EPOCH_SEED: &[u8] = b"reward_epoch";

/// Seeds: [STAKING_CONFIG_SEED, token_mint]
/// Unique per token mint
#[account]
pub struct StakingConfig {
    pub admin: Pubkey,
    pub token_mint: Pubkey,
    pub unstaking_period: u64, // n days in seconds
    pub volume_window: u64, // w days (14 default)
    pub reward_vault: Pubkey,
    pub stake_vault: Pubkey,
    pub total_staked: u64,
}

/// Seeds: [USER_STAKE_SEED, staking_config, user]
/// Unique per user per staking config
#[account]
pub struct UserStake {
    pub user: Pubkey,
    // Staking
    pub staked_amount: u64,
    pub pending_unstake: u64,
    pub unstake_initiated_at: i64, // 0 if not unstaking
    // Volume tracking
    pub daily_volumes: [u64; 30],
    pub last_updated_day: u64, // day index for rotation
}

/// Seeds: [REWARD_EPOCH_SEED, staking_config, &day.to_le_bytes()]
/// Unique per day per staking config
#[account]
pub struct RewardEpoch {
    pub day: u64,
    pub merkle_root: [u8; 32],
    pub total_distribted: u64,
    pub total_unclaimed: u64,
}