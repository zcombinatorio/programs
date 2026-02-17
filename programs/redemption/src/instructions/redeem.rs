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
pub struct TokensRedeemed {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    /// User redeeming tokens
    #[account(mut)]
    pub user: Signer<'info>,

    /// The redemption vault
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.base_mint.as_ref(), vault.quote_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    /// Vault's quote token account (source)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
    )]
    pub vault_quote_ata: Account<'info, TokenAccount>,

    /// Vault's base token account (receives user's base tokens)
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
    )]
    pub vault_base_ata: Account<'info, TokenAccount>,

    /// User's base token account (source - tokens being redeemed)
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = user,
    )]
    pub user_base_ata: Account<'info, TokenAccount>,

    /// User's quote token account (destination - tokens being received)
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

/// Calculate quote amount from base amount
/// Formula: quote_amount = (base_amount * price) / 10^base_decimals
/// This normalizes for different decimal places between tokens
fn calculate_quote_amount(
    base_amount: u64,
    price: u64,
    base_decimals: u8,
) -> Result<u64> {
    // Use u128 for intermediate calculation to prevent overflow
    let base_amount_u128 = base_amount as u128;
    let price_u128 = price as u128;
    let divisor = 10u128.pow(base_decimals as u32);

    let quote_amount_u128 = base_amount_u128
        .checked_mul(price_u128)
        .ok_or(RedemptionError::Overflow)?
        .checked_div(divisor)
        .ok_or(RedemptionError::Overflow)?;

    // Ensure result fits in u64
    if quote_amount_u128 > u64::MAX as u128 {
        return Err(RedemptionError::Overflow.into());
    }

    Ok(quote_amount_u128 as u64)
}

pub fn redeem_handler(ctx: Context<Redeem>, base_amount: u64) -> Result<()> {
    require!(base_amount > 0, RedemptionError::InvalidAmount);

    let vault = &ctx.accounts.vault;

    // Calculate how much quote the user should receive
    let quote_amount = calculate_quote_amount(
        base_amount,
        vault.price,
        vault.base_decimals,
    )?;

    // Ensure the redemption yields a non-zero amount
    require!(quote_amount > 0, RedemptionError::QuoteAmountTooSmall);

    // Check vault has sufficient quote tokens BEFORE any transfers
    require!(
        ctx.accounts.vault_quote_ata.amount >= quote_amount,
        RedemptionError::InsufficientVaultBalance
    );

    // Check user has sufficient base tokens
    require!(
        ctx.accounts.user_base_ata.amount >= base_amount,
        RedemptionError::InvalidAmount
    );

    // Transfer base tokens from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_base_ata.to_account_info(),
        to: ctx.accounts.vault_base_ata.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, base_amount)?;

    // Transfer quote tokens from vault to user (PDA signed)
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

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_quote_ata.to_account_info(),
        to: ctx.accounts.user_quote_ata.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, quote_amount)?;

    // Update stats
    let vault = &mut ctx.accounts.vault;
    vault.total_redeemed = vault
        .total_redeemed
        .checked_add(base_amount)
        .ok_or(RedemptionError::Overflow)?;

    emit!(TokensRedeemed {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        base_amount,
        quote_amount,
    });

    Ok(())
}
