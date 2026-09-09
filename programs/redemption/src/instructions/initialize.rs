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
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::errors::RedemptionError;
use crate::state::{RedemptionVault, VAULT_SEED};

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

    #[account(owner = anchor_spl::token::ID @ RedemptionError::UnsupportedTokenProgram)]
    pub base_mint: InterfaceAccount<'info, Mint>,

    #[account(owner = anchor_spl::token::ID @ RedemptionError::UnsupportedTokenProgram)]
    pub quote_mint: InterfaceAccount<'info, Mint>,

    /// Vault's ATA for holding quote tokens (what users receive)
    #[account(
        init,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
        associated_token::token_program = quote_token_program,
    )]
    pub vault_quote_ata: InterfaceAccount<'info, TokenAccount>,

    /// Vault's ATA for collecting base tokens (what users send)
    #[account(
        init,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
        associated_token::token_program = base_token_program,
    )]
    pub vault_base_ata: InterfaceAccount<'info, TokenAccount>,

    /// Admin's quote token account (source of initial deposit)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
        associated_token::token_program = quote_token_program,
    )]
    pub admin_quote_ata: InterfaceAccount<'info, TokenAccount>,

    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
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
    vault.quote_decimals = ctx.accounts.quote_mint.decimals;

    // Transfer initial quote tokens from admin to vault
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.quote_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.admin_quote_ata.to_account_info(),
                mint: ctx.accounts.quote_mint.to_account_info(),
                to: ctx.accounts.vault_quote_ata.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        deposit,
        ctx.accounts.quote_mint.decimals,
    )
}
