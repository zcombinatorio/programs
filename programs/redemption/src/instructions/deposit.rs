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
pub struct Deposit<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref(), &vault.nonce.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.admin == admin.key() @ RedemptionError::Unauthorized,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
        associated_token::token_program = quote_token_program,
    )]
    pub vault_quote_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
        associated_token::token_program = quote_token_program,
    )]
    pub admin_quote_ata: InterfaceAccount<'info, TokenAccount>,

    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Admin deposits additional quote tokens into the vault
pub fn deposit_handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, RedemptionError::InvalidAmount);

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
        amount,
        ctx.accounts.quote_mint.decimals,
    )
}
