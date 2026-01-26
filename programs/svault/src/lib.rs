use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("GmH3zEvgmWoC6Y6hxinYYRWLCuxUikRN5SAmVDVF4Jjy");

#[program]
pub mod svault {
    use super::*;

    pub fn initialize_staking_vault(
        ctx: Context<InitializeStakingVault>,
        unstaking_period: u64,
        volume_window: u64,
        nonce: u16,
    ) -> Result<()> {
        initialize::initialize_handler(ctx, unstaking_period, volume_window, nonce)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        stake::stake_handler(ctx, amount)
    }

    pub fn initiate_unstake(ctx: Context<InitiateUnstake>, amount: u64) -> Result<()> {
        initiate_unstake::initiate_unstake_handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw::withdraw_handler(ctx)
    }

    pub fn post_rewards(
        ctx: Context<PostRewards>,
        merkle_root: [u8; 32],
        total_amount: u64,
    ) -> Result<()> {
        post_rewards::post_rewards_handler(ctx, merkle_root, total_amount)
    }

    pub fn claim_rewards(
        ctx: Context<ClaimRewards>,
        cumulative_amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        claim_rewards::claim_rewards_handler(ctx, cumulative_amount, proof)
    }

    pub fn set_config(
        ctx: Context<SetConfig>,
        unstaking_period: Option<u64>,
        volume_window: Option<u64>,
    ) -> Result<()> {
        set_config::set_config_handler(ctx, unstaking_period, volume_window)
    }

    pub fn slash(ctx: Context<Slash>, basis_points: u16) -> Result<()> {
        slash::slash_handler(ctx, basis_points)
    }

    pub fn add_delegate(ctx: Context<AddDelegate>) -> Result<()> {
        add_delegate::add_delegate_handler(ctx)
    }

    pub fn remove_delegate(ctx: Context<RemoveDelegate>) -> Result<()> {
        remove_delegate::remove_delegate_handler(ctx)
    }
}
