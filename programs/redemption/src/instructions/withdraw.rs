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
pub struct AdminWithdrawal {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub quote_amount: u64,
    pub base_amount: u64,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// Admin withdrawing funds
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

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    /// Vault's quote token account
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
    )]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    /// Vault's base token account (collected from redemptions)
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
    )]
    pub vault_base_ata: Account<'info, TokenAccount>,

    /// Admin's quote token account
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
    )]
    pub admin_quote_ata: Account<'info, TokenAccount>,

    /// Admin's base token account
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

pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    quote_amount: Option<u64>,
    base_amount: Option<u64>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let base_mint_key = vault.base_mint;
    let quote_mint_key = vault.quote_mint;
    let bump = vault.bump;

    let seeds = &[
        VAULT_SEED,
        base_mint_key.as_ref(),
        quote_mint_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let mut withdrawn_quote: u64 = 0;
    let mut withdrawn_base: u64 = 0;

    // Withdraw quote tokens if requested
    if let Some(amount) = quote_amount {
        require!(amount > 0, RedemptionError::InvalidAmount);
        require!(
            ctx.accounts.vault_quote_ata.amount >= amount,
            RedemptionError::InsufficientVaultBalance
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_quote_ata.to_account_info(),
            to: ctx.accounts.admin_quote_ata.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;
        withdrawn_quote = amount;
    }

    // Withdraw base tokens if requested (tokens collected from redemptions)
    if let Some(amount) = base_amount {
        require!(amount > 0, RedemptionError::InvalidAmount);
        require!(
            ctx.accounts.vault_base_ata.amount >= amount,
            RedemptionError::InsufficientVaultBalance
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_base_ata.to_account_info(),
            to: ctx.accounts.admin_base_ata.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;
        withdrawn_base = amount;
    }

    emit!(AdminWithdrawal {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
        quote_amount: withdrawn_quote,
        base_amount: withdrawn_base,
    });

    Ok(())
}
