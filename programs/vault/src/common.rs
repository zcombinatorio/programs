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
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::VaultError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(vault_type: VaultType)]
pub struct UserVaultAction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // User

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &[vault.nonce],
            &[vault.proposal_id],
        ],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, VaultAccount>>,

    // Regular Mint (base or quote depending on vault_type)
    #[account(
        constraint = mint.key() == if vault_type == VaultType::Base {
            vault.base_mint
        } else {
            vault.quote_mint
        } @ VaultError::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    // Escrow ATA for regular mint
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    // User ATA for regular mint
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    // Programs
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // Conditional mints passed via remaining_accounts
    // Expected order for each option i:
    // - remaining_accounts[i * 2 + 0]: cond_mint_i
    // - remaining_accounts[i * 2 + 1]: user_cond_ata_i (may need init)
}
