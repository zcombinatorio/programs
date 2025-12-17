/*
 * Copyright (C) 2025 Spice Finance Inc.
 *
 * This file is part of Z Combinator.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod twap;
pub mod utils;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC");

#[program]
pub mod amm {
    use super::*;

    pub fn create_pool(
        ctx: Context<CreatePool>,
        fee: u16,
        starting_observation: u128,
        max_observation_delta: u128,
        warmup_duration: u32,
        liquidity_provider: Option<Pubkey>,
    ) -> Result<()> {
        instructions::create_pool::create_pool_handler(
            ctx,
            fee,
            starting_observation,
            max_observation_delta,
            warmup_duration,
            liquidity_provider,
        )
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::add_liquidity::add_liquidity_handler(ctx, amount_a, amount_b)
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {
        instructions::remove_liquidity::remove_liquidity_handler(ctx, amount_a, amount_b)
    }

    pub fn swap(
        ctx: Context<Swap>,
        swap_a_to_b: bool,
        input_amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        instructions::swap::swap_handler(ctx, swap_a_to_b, input_amount, min_output_amount)
    }

    pub fn crank_twap(ctx: Context<CrankTwap>) -> Result<u128> {
        instructions::crank_twap::crank_twap_handler(ctx)
    }

    pub fn cease_trading(ctx: Context<CeaseTrading>) -> Result<()> {
        instructions::cease_trading::cease_trading_handler(ctx)
    }
}
