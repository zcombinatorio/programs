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

#[event]
pub struct PoolCreated {
    pool: Pubkey,
    admin: Pubkey,
    mint_a: Pubkey,
    mint_b: Pubkey,
    fee: u16,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // Mints; Fees are collected in mint A
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
    pub pool: Account<'info, PoolAccount>,

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

    #[account(
        init,
        payer = signer,
        seeds = [
            FEE_VAULT_SEED,
            pool.key().as_ref(),
        ],
        bump,
        token::mint = mint_a,
        token::authority = signer
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_pool_handler(ctx: Context<CreatePool>, fee: u16) -> Result<()> {
    // Fee cannot exceed maximum
    require!(fee <= MAX_FEE, AmmError::InvalidFee);

    let pool = &mut ctx.accounts.pool;

    pool.admin = ctx.accounts.signer.key();
    pool.mint_a = ctx.accounts.mint_a.key();
    pool.mint_b = ctx.accounts.mint_b.key();
    pool.fee = fee;
    pool.bump = ctx.bumps.pool;

    emit!(PoolCreated {
        pool: pool.key(),
        admin: pool.admin,
        mint_a: pool.mint_a,
        mint_b: pool.mint_b,
        fee: pool.fee,
    });

    Ok(())
}
