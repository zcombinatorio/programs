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
pub struct Redeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = quote_mint, associated_token::authority = vault)]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = base_mint, associated_token::authority = vault)]
    pub vault_base_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = base_mint, associated_token::authority = user)]
    pub user_base_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = quote_mint,
        associated_token::authority = user,
    )]
    pub user_quote_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn redeem_handler(ctx: Context<Redeem>, base_amount: u64) -> Result<()> {
    require!(base_amount > 0, RedemptionError::InvalidAmount);

    let vault = &ctx.accounts.vault;

    // quote = base * price / 10^decimals
    let quote_amount = (base_amount as u128)
        .checked_mul(vault.price as u128)
        .and_then(|v| v.checked_div(10u128.pow(vault.base_decimals as u32)))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(RedemptionError::Overflow)?;

    require!(quote_amount > 0, RedemptionError::InvalidAmount);
    require!(
        ctx.accounts.vault_quote_ata.amount >= quote_amount,
        RedemptionError::InsufficientBalance
    );

    // User sends base to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_base_ata.to_account_info(),
                to: ctx.accounts.vault_base_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        base_amount,
    )?;

    // Vault sends quote to user
    let seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &[vault.bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_quote_ata.to_account_info(),
                to: ctx.accounts.user_quote_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[&seeds[..]],
        ),
        quote_amount,
    )
}
