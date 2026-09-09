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
pub struct Withdraw<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref(), &vault.nonce.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.admin == admin.key() @ RedemptionError::Unauthorized,
    )]
    pub vault: Account<'info, RedemptionVault>,

    #[account(constraint = base_mint.key() == vault.base_mint @ RedemptionError::InvalidMint)]
    pub base_mint: InterfaceAccount<'info, Mint>,

    #[account(constraint = quote_mint.key() == vault.quote_mint @ RedemptionError::InvalidMint)]
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
        associated_token::mint = base_mint,
        associated_token::authority = vault,
        associated_token::token_program = base_token_program,
    )]
    pub vault_base_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = quote_mint,
        associated_token::authority = admin,
        associated_token::token_program = quote_token_program,
    )]
    pub admin_quote_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = base_mint,
        associated_token::authority = admin,
        associated_token::token_program = base_token_program,
    )]
    pub admin_base_ata: InterfaceAccount<'info, TokenAccount>,

    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Admin withdraws quote and/or base tokens from the vault
pub fn withdraw_handler(ctx: Context<Withdraw>, quote_amount: u64, base_amount: u64) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &vault.nonce.to_le_bytes(),
        &[vault.bump],
    ];
    let signer = &[&seeds[..]];

    if quote_amount > 0 {
        require!(
            ctx.accounts.vault_quote_ata.amount >= quote_amount,
            RedemptionError::InsufficientBalance
        );
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.quote_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_quote_ata.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.admin_quote_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            quote_amount,
            ctx.accounts.quote_mint.decimals,
        )?;
    }

    if base_amount > 0 {
        require!(
            ctx.accounts.vault_base_ata.amount >= base_amount,
            RedemptionError::InsufficientBalance
        );
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.base_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_base_ata.to_account_info(),
                    mint: ctx.accounts.base_mint.to_account_info(),
                    to: ctx.accounts.admin_base_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            base_amount,
            ctx.accounts.base_mint.decimals,
        )?;
    }

    Ok(())
}
