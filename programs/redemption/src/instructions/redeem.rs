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
pub struct Redeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref(), &vault.nonce.to_le_bytes()],
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

/// User redeems base tokens for quote tokens at the vault's price
pub fn redeem_handler(ctx: Context<Redeem>, base_amount: u64) -> Result<()> {
    require!(base_amount > 0, RedemptionError::InvalidAmount);

    let vault = &ctx.accounts.vault;

    // Calculate quote amount: quote = base * price / 10^decimals
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

    // User sends base tokens to vault
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

    // Vault sends quote tokens to user
    let seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &vault.nonce.to_le_bytes(),
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
