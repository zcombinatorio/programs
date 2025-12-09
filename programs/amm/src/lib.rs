use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod constants;
pub mod instructions;
pub mod utils;
pub mod twap;

pub use state::*;
pub use constants::*;
pub use instructions::*;

declare_id!("3bt3f7BRg7zTZL8LbVTa5QeoD29Svd8t1L3xGwrjgmgz");

#[program]
pub mod amm {
    use super::*;

    pub fn create_pool(
        ctx: Context<CreatePool>,
        fee: u16,
        starting_observation: u128,
        max_observation_delta: u128,
        warmup_duration: u32,
    ) -> Result<()> {
        instructions::create_pool::create_pool_handler(ctx, fee, starting_observation, max_observation_delta, warmup_duration)
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::add_liquidity::add_liquidity_handler(ctx, amount_a, amount_b)
    }

    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::remove_liquidity::remove_liquidity_handler(ctx, amount_a, amount_b)
    }

    pub fn swap(ctx: Context<Swap>, swap_a_to_b: bool, input_amount: u64, min_output_amount: u64) -> Result<()> {
        instructions::swap::swap_handler(ctx, swap_a_to_b, input_amount, min_output_amount)
    }

    pub fn create_pool_with_liquidity(
        ctx: Context<CreatePoolWithLiquidity>,
        fee: u16,
        amount_a: u64,
        amount_b: u64,
        starting_observation: u128,
        max_observation_delta: u128,
        warmup_duration: u32,
    ) -> Result<()> {
        instructions::create_pool_with_liquidity::create_pool_with_liquidity_handler(ctx, fee, amount_a, amount_b, starting_observation, max_observation_delta, warmup_duration)
    }

    pub fn crank_twap(ctx: Context<CrankTwap>) -> Result<()> {
        instructions::crank_twap::crank_twap_handler(ctx)
    }
}
