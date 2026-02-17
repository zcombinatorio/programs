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
pub struct Withdraw<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.admin == admin.key() @ RedemptionError::Unauthorized,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = quote_mint, associated_token::authority = vault)]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = base_mint, associated_token::authority = vault)]
    pub vault_base_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
    )]
    pub admin_quote_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = admin,
    )]
    pub admin_base_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn withdraw_handler(ctx: Context<Withdraw>, quote_amount: u64, base_amount: u64) -> Result<()> {
    let seeds = &[
        VAULT_SEED,
        ctx.accounts.vault.base_mint.as_ref(),
        ctx.accounts.vault.quote_mint.as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer = &[&seeds[..]];

    if quote_amount > 0 {
        require!(
            ctx.accounts.vault_quote_ata.amount >= quote_amount,
            RedemptionError::InsufficientBalance
        );
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_quote_ata.to_account_info(),
                    to: ctx.accounts.admin_quote_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            quote_amount,
        )?;
    }

    if base_amount > 0 {
        require!(
            ctx.accounts.vault_base_ata.amount >= base_amount,
            RedemptionError::InsufficientBalance
        );
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_base_ata.to_account_info(),
                    to: ctx.accounts.admin_base_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            base_amount,
        )?;
    }

    Ok(())
}
