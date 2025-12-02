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
use crate::state::*;

#[derive(Accounts)]
#[instruction(vault_type: VaultType, nonce: u8, proposal_id: u8)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + VaultAccount::INIT_SPACE,
        seeds = [
            VAULT_SEED,
            signer.key().as_ref(),
            &[nonce],
            &[proposal_id],
            &[vault_type as u8]
        ],
        bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Regular mint
    pub mint: Account<'info, Mint>,

    // Escrow ATA for regular mint
    #[account(
        init,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_acc: Account<'info, TokenAccount>,

    // Create initial 2 conditional mints
    // Conditional mint 0
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[0]],
        bump,
    )]
    pub cond_mint_0: Account<'info, Mint>,

    // Conditional mint 1
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[1]],
        bump,
    )]
    pub cond_mint_1: Account<'info, Mint>,

    // Programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn initialize_handler(
    ctx: Context<InitializeVault>,
    vault_type: VaultType,
    nonce: u8,
    proposal_id: u8,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.owner = ctx.accounts.signer.key();
    vault.mint = ctx.accounts.mint.key();
    vault.nonce = nonce;
    vault.proposal_id = proposal_id;
    vault.vault_type = vault_type;
    vault.num_options = 2; // First 2 options generated atomically

    // Store conditional mints
    vault.cond_mints[0] = ctx.accounts.cond_mint_0.key();
    vault.cond_mints[1] = ctx.accounts.cond_mint_1.key();

    vault.state = VaultState::Setup;
    vault.winning_idx = None;
    vault.bump = ctx.bumps.vault;

    msg!("Vault initialized!");
    msg!("Owner: {:?}", vault.owner);
    msg!("State: Setup");

    Ok(())
}
