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

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[event]
pub struct VaultFinalized {
    pub vault: Pubkey,
    pub winning_idx: u8,
    pub winning_base_mint: Pubkey,
    pub winning_quote_mint: Pubkey,
}

#[derive(Accounts)]
#[instruction(winning_idx: u8)]
pub struct FinalizeVault<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &[vault.nonce],
        ],
        bump = vault.bump,
        constraint = vault.owner == signer.key() @ VaultError::Unauthorized,
        constraint = vault.state == VaultState::Active @ VaultError::InvalidState,
    )]
    pub vault: Box<Account<'info, VaultAccount>>,
}

pub fn finalize_vault_handler(ctx: Context<FinalizeVault>, winning_idx: u8) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(
        winning_idx < vault.num_options,
        VaultError::IndexOutOfBounds
    );

    // Finalize state
    vault.state = VaultState::Finalized(winning_idx);

    emit!(VaultFinalized {
        vault: vault.key(),
        winning_idx,
        winning_base_mint: vault.cond_base_mints[winning_idx as usize],
        winning_quote_mint: vault.cond_quote_mints[winning_idx as usize],
    });

    Ok(())
}
