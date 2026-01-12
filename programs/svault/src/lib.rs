use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("SVLTnMmZLkY5bCJbRgYdSABQNW14qfy5ZWhmEcASGx3");

#[program]
pub mod svault {
    use super::*;

    pub fn initialize_staking_vault(
        ctx: Context<InitializeStakingVault>,
        unstaking_period: u64,
        volume_window: u64,
    ) -> Result<()> {
        initialize::initialize_handler(ctx, unstaking_period, volume_window)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        stake::stake_handler(ctx, amount)
    }

    pub fn initiate_unstake(ctx: Context<InitiateUnstake>, amount: u64) -> Result<()> {
        initiate_unstake::initiate_unstake_handler(ctx, amount)
    }
}
