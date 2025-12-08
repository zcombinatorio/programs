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
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{constants::*, errors::*, state::*};

#[event]
pub struct LiquidityAdded {
    pool: Pubkey,
    amount_a: u64,
    amount_b: u64
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        mut,
        constraint = depositor.key() == pool.admin @ AmmError::InvalidAdmin,
    )]
    pub depositor: Signer<'info>,

    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,

    #[account(
        seeds = [
            POOL_SEED,
            depositor.key().as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
        ],
        bump = pool.bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool: Account<'info, PoolAccount>,

    #[account(
        mut,
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            mint_a.key().as_ref(),
        ],
        bump,
        token::mint = mint_a,
        token::authority = pool,
    )]
    pub reserve_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            mint_b.key().as_ref(),
        ],
        bump,
        token::mint = mint_b,
        token::authority = pool,
    )]
    pub reserve_b: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint_a,
        token::authority = depositor,
    )]
    pub depositor_token_acc_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint_b,
        token::authority = depositor,
    )]
    pub depositor_token_acc_b: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn add_liquidity_handler(
    ctx: Context<AddLiquidity>,
    amount_a: u64,
    amount_b: u64,
) -> Result<()> {
    // Validate amounts are non-zero
    require!(amount_a > 0, AmmError::InvalidAmount);
    require!(amount_b > 0, AmmError::InvalidAmount);

    // Transfer tokens from depositor -> reserves
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_acc_a.to_account_info(),
                to: ctx.accounts.reserve_a.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount_a,
    )?;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_acc_b.to_account_info(),
                to: ctx.accounts.reserve_b.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount_b,
    )?;

    emit!( LiquidityAdded {
        pool: ctx.accounts.pool.key(),
        amount_a,
        amount_b
    });

    Ok(())
}