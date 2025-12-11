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

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub nonce: u8,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
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
            &[nonce]
        ],
        bump,
    )]
    pub vault: Box<Account<'info, VaultAccount>>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    // Escrow ATA for base mint
    #[account(
        init,
        payer = signer,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub base_token_acc: Account<'info, TokenAccount>,

    // Escrow ATA for quote mint
    #[account(
        init,
        payer = signer,
        associated_token::mint = quote_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub quote_token_acc: Account<'info, TokenAccount>,

    // Create initial 2 base conditional mints
    // Conditional mint 0
    #[account(
        init,
        payer = signer,
        mint::decimals = base_mint.decimals,
        mint::authority = vault,
        seeds = [
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[VaultType::Base as u8],
            &[0]
        ],
        bump,
    )]
    pub cond_base_mint_0: Account<'info, Mint>,

    // Conditional mint 1
    #[account(
        init,
        payer = signer,
        mint::decimals = base_mint.decimals,
        mint::authority = vault,
        seeds = [
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[VaultType::Base as u8],
            &[1]
        ],
        bump,
    )]
    pub cond_base_mint_1: Account<'info, Mint>,

    // Create initial 2 quote conditional mints
    // Conditional quote mint 0
    #[account(
        init,
        payer = signer,
        mint::decimals = quote_mint.decimals,
        mint::authority = vault,
        seeds = [
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[VaultType::Quote as u8],
            &[0]
        ],
        bump,
    )]
    pub cond_quote_mint_0: Account<'info, Mint>,

    // Conditional quote mint 1
    #[account(
        init,
        payer = signer,
        mint::decimals = quote_mint.decimals,
        mint::authority = vault,
        seeds = [
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[VaultType::Quote as u8],
            &[1]
        ],
        bump,
    )]
    pub cond_quote_mint_1: Account<'info, Mint>,

    // Programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn initialize_handler(ctx: Context<InitializeVault>, nonce: u8) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.owner = ctx.accounts.signer.key();
    vault.base_mint = ctx.accounts.base_mint.key();
    vault.quote_mint = ctx.accounts.quote_mint.key();
    vault.nonce = nonce;
    vault.num_options = 2; // First 2 options generated atomically

    // Store conditional mints
    vault.cond_base_mints[0] = ctx.accounts.cond_base_mint_0.key();
    vault.cond_base_mints[1] = ctx.accounts.cond_base_mint_1.key();

    vault.cond_quote_mints[0] = ctx.accounts.cond_quote_mint_0.key();
    vault.cond_quote_mints[1] = ctx.accounts.cond_quote_mint_1.key();

    vault.state = VaultState::Setup;
    vault.bump = ctx.bumps.vault;

    emit!(VaultInitialized {
        vault: vault.key(),
        owner: vault.owner,
        base_mint: vault.base_mint,
        quote_mint: vault.quote_mint,
        nonce,
    });

    Ok(())
}
