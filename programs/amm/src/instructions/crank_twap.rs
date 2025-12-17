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
use anchor_spl::token::{TokenAccount};

use crate::constants::*;
use crate::state::{PoolAccount, PoolState};
use crate::errors::*;

#[derive(Accounts)]
pub struct CrankTwap<'info> {
    #[account(
        mut,
        seeds = [
            POOL_SEED,
            pool.admin.as_ref(),
            pool.mint_a.as_ref(),
            pool.mint_b.as_ref(),
        ],
        bump = pool.bumps.pool,
        constraint = pool.state == PoolState::Trading @ AmmError::InvalidState
    )]
    pub pool: Account<'info, PoolAccount>,

    #[account(
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            pool.mint_a.as_ref(),
        ],
        bump = pool.bumps.reserve_a,
        token::mint = pool.mint_a,
        token::authority = pool,
    )]
    pub reserve_a: Account<'info, TokenAccount>,

    #[account(
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            pool.mint_b.as_ref(),
        ],
        bump = pool.bumps.reserve_b,
        token::mint = pool.mint_b,
        token::authority = pool,
    )]
    pub reserve_b: Account<'info, TokenAccount>,
}

pub fn crank_twap_handler(ctx: Context<CrankTwap>) -> Result<u128> {
    let reserve_a = ctx.accounts.reserve_a.amount;
    let reserve_b = ctx.accounts.reserve_b.amount;

    ctx.accounts.pool.oracle.crank_twap(reserve_a, reserve_b)
}
