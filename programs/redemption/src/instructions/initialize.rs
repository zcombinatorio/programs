/*
 * Copyright (C) 2025 Spice Finance Inc.
 * Licensed under AGPL-3.0 — see LICENSE
 */
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::RedemptionError;
use crate::state::RedemptionVault;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + RedemptionVault::INIT_SPACE,
        seeds = [VAULT_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
    )]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
    )]
    pub vault_base_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
    )]
    pub admin_quote_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn initialize_handler(ctx: Context<Initialize>, price: u64, deposit: u64) -> Result<()> {
    require!(price > 0 && deposit > 0, RedemptionError::InvalidAmount);

    let vault = &mut ctx.accounts.vault;
    vault.bump = ctx.bumps.vault;
    vault.admin = ctx.accounts.admin.key();
    vault.base_mint = ctx.accounts.base_mint.key();
    vault.quote_mint = ctx.accounts.quote_mint.key();
    vault.price = price;
    vault.base_decimals = ctx.accounts.base_mint.decimals;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.admin_quote_ata.to_account_info(),
                to: ctx.accounts.vault_quote_ata.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        deposit,
    )
}
