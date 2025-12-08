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
pub struct LiquidityRemoved {
    pool: Pubkey,
    amount_a: u64,
    amount_b: u64
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
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

pub fn remove_liquidity_handler(ctx: Context<RemoveLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
    require!(amount_a > 0, AmmError::InvalidAmount);
    require!(amount_b > 0, AmmError::InvalidAmount);

    // Ensure withdrawal doesn't exceed reserve balances
    require!(amount_a <= ctx.accounts.reserve_a.amount, AmmError::InsufficientReserve);
    require!(amount_b <= ctx.accounts.reserve_b.amount, AmmError::InsufficientReserve);

    let pool = &ctx.accounts.pool;
    let seeds = &[
        POOL_SEED,
        pool.admin.as_ref(),
        pool.mint_a.as_ref(),
        pool.mint_b.as_ref(),
        &[pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer tokens from reserves -> depositor
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reserve_a.to_account_info(),
                to: ctx.accounts.depositor_token_acc_a.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        amount_a,
    )?;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reserve_b.to_account_info(),
                to: ctx.accounts.depositor_token_acc_b.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        amount_b,
    )?;

    emit!( LiquidityRemoved {
        pool: ctx.accounts.pool.key(),
        amount_a,
        amount_b
    });

    Ok(())
}
