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

#[derive(Accounts)]
#[instruction(nonce: u16)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + RedemptionVault::INIT_SPACE,
        seeds = [VAULT_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    /// Vault's ATA for holding quote tokens (what users receive)
    #[account(
        init,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
    )]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    /// Vault's ATA for collecting base tokens (what users send)
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

/// Initialize a new redemption vault with a price and initial quote deposit
pub fn initialize_handler(ctx: Context<Initialize>, nonce: u16, price: u64, deposit: u64) -> Result<()> {
    require!(price > 0 && deposit > 0, RedemptionError::InvalidAmount);

    let vault = &mut ctx.accounts.vault;
    vault.bump = ctx.bumps.vault;
    vault.nonce = nonce;
    vault.admin = ctx.accounts.admin.key();
    vault.base_mint = ctx.accounts.base_mint.key();
    vault.quote_mint = ctx.accounts.quote_mint.key();
    vault.price = price;
    vault.base_decimals = ctx.accounts.base_mint.decimals;

    // Transfer initial quote tokens from admin to vault
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
