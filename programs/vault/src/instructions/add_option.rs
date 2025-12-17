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
use anchor_spl::token::{Mint, Token};

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[event]
pub struct OptionAdded {
    pub vault: Pubkey,
    pub option_index: u8,
    pub cond_base_mint: Pubkey,
    pub cond_quote_mint: Pubkey,
}

#[derive(Accounts)]
pub struct AddOption<'info> {
    /// Payer for account rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Owner of the vault — needs to sign
    #[account(address = vault.owner @ VaultError::Unauthorized)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &vault.nonce.to_le_bytes(),
        ],
        bump = vault.bump,
        constraint = vault.state == VaultState::Setup @ VaultError::InvalidState,
    )]
    pub vault: Box<Account<'info, VaultAccount>>,

    // Base mint
    #[account(address = vault.base_mint)]
    pub base_mint: Account<'info, Mint>,

    // Quote mint
    #[account(address = vault.quote_mint)]
    pub quote_mint: Account<'info, Mint>,

    // Conditional base mint
    #[account(
        init,
        payer = payer,
        mint::decimals = base_mint.decimals,
        mint::authority = vault,
        seeds = [
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[VaultType::Base as u8],
            &[vault.num_options]
        ],
        bump,
    )]
    pub cond_base_mint: Account<'info, Mint>,

    // Conditional quote mint
    #[account(
        init,
        payer = payer,
        mint::decimals = quote_mint.decimals,
        mint::authority = vault,
        seeds = [
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[VaultType::Quote as u8],
            &[vault.num_options]
        ],
        bump,
    )]
    pub cond_quote_mint: Account<'info, Mint>,

    // Programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn add_option_handler(ctx: Context<AddOption>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let curr_num_options = vault.num_options;

    require!(
        curr_num_options < MAX_OPTIONS,
        VaultError::OptionLimitReached
    );

    vault.cond_base_mints[curr_num_options as usize] = ctx.accounts.cond_base_mint.key();
    vault.cond_quote_mints[curr_num_options as usize] = ctx.accounts.cond_quote_mint.key();
    vault.num_options += 1;

    emit!(OptionAdded {
        vault: vault.key(),
        option_index: curr_num_options,
        cond_base_mint: ctx.accounts.cond_base_mint.key(),
        cond_quote_mint: ctx.accounts.cond_quote_mint.key(),
    });

    Ok(())
}
