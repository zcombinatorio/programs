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

#[event]
pub struct PoolCreated {
    pub version: u8,
    pub pool: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub fee: u16,
    pub admin: Pubkey,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub admin: Signer<'info>,

    // Mints; Fees are collected in mint A
    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + PoolAccount::INIT_SPACE,
        seeds = [
            POOL_SEED,
            admin.key().as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
        ],
        bump,
    )]
    pub pool: Box<Account<'info, PoolAccount>>,

    // Pool reserves
    #[account(
        init,
        payer = payer,
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
        payer = payer,
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

    /// CHECK: Hardcoded fee authority wallet
    #[account(address = FEE_AUTHORITY)]
    pub fee_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [
            FEE_VAULT_SEED,
            pool.key().as_ref(),
        ],
        bump,
        token::mint = mint_a,
        token::authority = fee_authority
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_pool_handler(
    ctx: Context<CreatePool>,
    fee: u16,
    starting_observation: u128,
    max_observation_delta: u128,
    warmup_duration: u32,
    liquidity_provider: Option<Pubkey>, // Optional seperate provider
) -> Result<()> {
    // Fee cannot exceed maximum
    require!(fee <= MAX_FEE, AmmError::InvalidFee);

    let clock = Clock::get()?;

    ctx.accounts.pool.set_inner(PoolAccount {
        version: AMM_VERSION,
        admin: ctx.accounts.admin.key(),
        liquidity_provider: liquidity_provider.unwrap_or(ctx.accounts.admin.key()),
        mint_a: ctx.accounts.mint_a.key(),
        mint_b: ctx.accounts.mint_b.key(),
        fee,
        oracle: TwapOracle::new(
            clock.unix_timestamp,
            starting_observation,
            max_observation_delta,
            warmup_duration,
        ),
        state: PoolState::Trading,
        bumps: PoolBumps {
            pool: ctx.bumps.pool,
            reserve_a: ctx.bumps.reserve_a,
            reserve_b: ctx.bumps.reserve_b,
            fee_vault: ctx.bumps.fee_vault,
        },
    });

    emit!(PoolCreated {
        version: AMM_VERSION,
        pool: ctx.accounts.pool.key(),
        admin: ctx.accounts.admin.key(),
        mint_a: ctx.accounts.mint_a.key(),
        mint_b: ctx.accounts.mint_b.key(),
        fee: fee,
    });

    Ok(())
}
