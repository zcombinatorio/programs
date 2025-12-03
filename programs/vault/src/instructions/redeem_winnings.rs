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
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::TokenAccount;

use crate::common::UserVaultAction;
use crate::constants::*;
use crate::errors::*;
use crate::state::VaultState;
use crate::utils::*;
use crate::VaultType;

pub fn redeem_winnings_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, UserVaultAction<'info>>,
    vault_type: VaultType,
) -> Result<()> {
    let vault = &ctx.accounts.vault;

    require!(
        vault.state == VaultState::Finalized,
        VaultError::InvalidState
    );

    let num_options = vault.num_options as usize;

    // Validate we have the right number of remaining accounts
    require!(
        ctx.remaining_accounts.len() == num_options * 2,
        VaultError::InvalidNumberOfAccounts
    );

    let vault_cond_mints = if vault_type == VaultType::Base {
        vault.cond_base_mints
    } else {
        vault.cond_quote_mints
    };    

    // Extract winning option
    let winning_idx = vault
        .winning_idx
        .ok_or(error!(VaultError::NoWinningOption))?;

    let mut winning_amount = 0u64;

    for i in 0..num_options {
        let cond_mint_info = &ctx.remaining_accounts[i * 2];
        let user_cond_ata_info = &ctx.remaining_accounts[i * 2 + 1];

        // Validate the conditional mint PDA
        require!(
            cond_mint_info.key() == vault_cond_mints[i],
            VaultError::InvalidConditionalMint
        );

        // Validate user's ATA
        let expected_user_ata =
            get_associated_token_address(&ctx.accounts.signer.key(), &cond_mint_info.key());
        require!(
            user_cond_ata_info.key() == expected_user_ata,
            VaultError::InvalidUserAta
        );

        // Skip if ATA doesn't exist or is empty
        if user_cond_ata_info.data_is_empty() {
            continue;
        }

        require!(
            user_cond_ata_info.owner == &ctx.accounts.token_program.key(),
            VaultError::InvalidAccountOwner
        );

        let user_cond_ata = Account::<TokenAccount>::try_from(user_cond_ata_info)?;
        let balance = user_cond_ata.amount;

        // Save balance for winning optio
        if i == winning_idx as usize {
            winning_amount = balance;
        }

        // Burn all tokens and close user ATA
        if balance > 0 {
            burn_tokens(
                cond_mint_info.clone(),
                user_cond_ata_info.clone(),
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                balance,
            )?;
        }

        close_token_account(
            user_cond_ata_info.clone(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;
    }

    // Exit if no winnings
    if winning_amount == 0 {
        return Ok(());
    }

    // 2. Transfer winning amount of regular tokens: vault -> user
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        vault.owner.as_ref(),
        &[vault.nonce],
        &[vault.proposal_id],
        &[vault.bump],
    ];
    transfer_signed(
        ctx.accounts.vault_ata.to_account_info(),
        ctx.accounts.user_ata.to_account_info(),
        vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        winning_amount,
        &[vault_seeds],
    )?;

    Ok(())
}
