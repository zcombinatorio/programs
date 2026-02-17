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
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::RedemptionError;
use crate::state::RedemptionVault;

#[event]
pub struct QuoteDeposited {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// Admin depositing more quote tokens
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The redemption vault
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.admin == admin.key() @ RedemptionError::Unauthorized,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub quote_mint: Account<'info, Mint>,

    /// Vault's quote token account
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
    )]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    /// Admin's quote token account
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
    )]
    pub admin_quote_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn deposit_handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, RedemptionError::InvalidAmount);

    // Transfer quote tokens from admin to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.admin_quote_ata.to_account_info(),
        to: ctx.accounts.vault_quote_ata.to_account_info(),
        authority: ctx.accounts.admin.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    emit!(QuoteDeposited {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
        amount,
    });

    Ok(())
}
