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

use crate::constants::*;
use crate::state::{PoolAccount, PoolState};
use crate::errors::*;

#[derive(Accounts)]
pub struct CeaseTrading<'info> {
    #[account(constraint = pool.admin == admin.key() @ AmmError::InvalidAdmin)]
    pub admin: Signer<'info>,

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
    pub pool: Box<Account<'info, PoolAccount>>,
}

pub fn cease_trading_handler(ctx: Context<CeaseTrading>) -> Result<()> {
    ctx.accounts.pool.state = PoolState::Finalized;
    Ok(())
}
