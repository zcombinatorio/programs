pub use anchor_lang::prelude::*;

#[constant]
pub const STAKING_CONFIG_SEED: &[u8] = b"staking_config";
#[constant]
pub const USER_STAKE_SEED: &[u8] = b"user_stake";
#[constant]
pub const STAKE_VAULT_SEED: &[u8] = b"stake_vault";
#[constant]
pub const REWARD_VAULT_SEED: &[u8] = b"reward_vault";

/// Seeds: [STAKING_CONFIG_SEED, token_mint]
/// Unique per token mint
#[account]
#[derive(InitSpace)]
pub struct StakingConfig {
    pub bump: u8,
    pub admin: Pubkey,
    pub token_mint: Pubkey,
    pub unstaking_period: u64, // n days
    pub volume_window: u64, // w days (14 default)
    pub reward_vault: Pubkey,
    pub stake_vault: Pubkey,
    pub total_staked: u64,
    // Rewards
    pub current_merkle_root: [u8; 32],
    pub last_updated_at: i64,
}

/// Seeds: [USER_STAKE_SEED, staking_config, user]
/// Unique per user per staking config
#[account]
#[derive(InitSpace)]
pub struct UserStake {
    pub user: Pubkey,
    // Staking
    pub staked_amount: u64,
    pub pending_unstake: u64,
    pub unstake_initiated_at: i64, // 0 if not unstaking
    // Rewards
    pub total_claimed: u64,
}