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

#[derive(Accounts)]
pub struct AddOption<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &[vault.nonce],
            &[vault.proposal_id],
            &[vault.vault_type as u8]
        ],
        bump = vault.bump,
        constraint = vault.owner == signer.key() @ VaultError::Unauthorized,
        constraint = vault.state == VaultState::Setup @ VaultError::InvalidState,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Regular mint
    #[account(address = vault.mint)]
    pub mint: Account<'info, Mint>,

    // Conditional mint
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[vault.num_options]],
        bump,
    )]
    pub cond_mint: Account<'info, Mint>,

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

    vault.cond_mints[curr_num_options as usize] = ctx.accounts.cond_mint.key();
    vault.num_options += 1;

    msg!("Added option {:?}", vault.num_options);

    Ok(())
}
