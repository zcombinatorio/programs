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
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub price: u64,
    pub initial_deposit: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Admin who will control the vault
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The redemption vault PDA
    #[account(
        init,
        payer = admin,
        space = 8 + RedemptionVault::INIT_SPACE,
        seeds = [VAULT_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, RedemptionVault>,

    /// The token users will send (base mint)
    pub base_mint: Account<'info, Mint>,

    /// The token users will receive (quote mint)
    pub quote_mint: Account<'info, Mint>,

    /// Vault's ATA for holding quote tokens
    #[account(
        init,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
    )]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    /// Vault's ATA for receiving base tokens (burn destination)
    #[account(
        init,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
    )]
    pub vault_base_ata: Account<'info, TokenAccount>,

    /// Admin's quote token account (source of initial deposit)
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

pub fn initialize_handler(
    ctx: Context<Initialize>,
    price: u64,
    initial_deposit: u64,
) -> Result<()> {
    require!(price > 0, RedemptionError::InvalidPrice);
    require!(initial_deposit > 0, RedemptionError::InvalidAmount);

    let vault = &mut ctx.accounts.vault;

    vault.version = REDEMPTION_VERSION;
    vault.bump = ctx.bumps.vault;
    vault.admin = ctx.accounts.admin.key();
    vault.base_mint = ctx.accounts.base_mint.key();
    vault.quote_mint = ctx.accounts.quote_mint.key();
    vault.price = price;
    vault.base_decimals = ctx.accounts.base_mint.decimals;
    vault.quote_decimals = ctx.accounts.quote_mint.decimals;
    vault.total_redeemed = 0;

    // Transfer initial quote tokens from admin to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.admin_quote_ata.to_account_info(),
        to: ctx.accounts.vault_quote_ata.to_account_info(),
        authority: ctx.accounts.admin.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, initial_deposit)?;

    emit!(VaultInitialized {
        vault: vault.key(),
        admin: vault.admin,
        base_mint: vault.base_mint,
        quote_mint: vault.quote_mint,
        price,
        initial_deposit,
    });

    Ok(())
}
