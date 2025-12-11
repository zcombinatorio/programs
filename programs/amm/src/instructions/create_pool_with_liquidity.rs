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
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::*;
use crate::state::*;
use crate::twap::TwapOracle;
use crate::utils::transfer_tokens;
use crate::instructions::create_pool::PoolCreated;
use crate::instructions::add_liquidity::LiquidityAdded;

#[derive(Accounts)]
pub struct CreatePoolWithLiquidity<'info> {
    // Signer & Depositor
    #[account(mut)]
    pub signer: Signer<'info>,

    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + PoolAccount::INIT_SPACE,
        seeds = [
            POOL_SEED,
            signer.key().as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
        ],
        bump,
    )]
    pub pool: Box<Account<'info, PoolAccount>>,

    // Pool reserves
    #[account(
        init,
        payer = signer,
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
        init,
        payer = signer,
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

    /// CHECK: Validated by address constraint against hardcoded FEE_AUTHORITY constant
    #[account(address = FEE_AUTHORITY)]
    pub fee_authority: UncheckedAccount<'info>,

    // Fee authority token account (mint a)
    #[account(
        init,
        payer = signer,
        seeds = [
            FEE_VAULT_SEED,
            pool.key().as_ref(),
        ],
        bump,
        token::mint = mint_a,
        token::authority = fee_authority
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    // Signer (depositor) token accounts for both mints
    #[account(
        mut,
        token::mint = mint_a,
        token::authority = signer,
    )]
    pub signer_token_acc_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint_b,
        token::authority = signer,
    )]
    pub signer_token_acc_b: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_pool_with_liquidity_handler(
    ctx: Context<CreatePoolWithLiquidity>,
    fee: u16,
    amount_a: u64,
    amount_b: u64,
    starting_observation: u128,
    max_observation_delta: u128,
    warmup_duration: u32,
) -> Result<()> {
    require!(fee <= MAX_FEE, AmmError::InvalidFee);
    require!(amount_a > 0, AmmError::InvalidAmount);
    require!(amount_b > 0, AmmError::InvalidAmount);

    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    pool.admin = ctx.accounts.signer.key();
    pool.mint_a = ctx.accounts.mint_a.key();
    pool.mint_b = ctx.accounts.mint_b.key();
    pool.fee = fee;
    pool.bump = ctx.bumps.pool;
    pool.oracle = TwapOracle::new(
        clock.unix_timestamp,
        starting_observation,
        max_observation_delta,
        warmup_duration,
    );
    pool.state = PoolState::Trading;

    transfer_tokens(
        ctx.accounts.signer_token_acc_a.to_account_info(),
        ctx.accounts.reserve_a.to_account_info(),
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount_a,
    )?;

    transfer_tokens(
        ctx.accounts.signer_token_acc_b.to_account_info(),
        ctx.accounts.reserve_b.to_account_info(),
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount_b,
    )?;

    emit!(PoolCreated {
        pool: pool.key(),
        admin: pool.admin,
        mint_a: pool.mint_a,
        mint_b: pool.mint_b,
        fee: pool.fee,
    });

    emit!(LiquidityAdded {
        pool: pool.key(),
        amount_a,
        amount_b,
    });

    Ok(())
}
