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
pub struct VaultActivated {
    pub vault: Pubkey,
    pub num_options: u8,
}

#[derive(Accounts)]
pub struct ActivateVault<'info> {
    /// Payer for account rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Owner of the vault - used for PDA derivation. Can be a PDA or signer.
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
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        constraint = vault.state == VaultState::Setup @ VaultError::InvalidState,
    )]
    pub vault: Box<Account<'info, VaultAccount>>,
}

pub fn activate_vault_handler(ctx: Context<ActivateVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    // Never should be flagged, just a sanity check
    require!(
        vault.num_options >= MIN_OPTIONS,
        VaultError::NotEnoughOptions
    );
    require!(vault.num_options <= MAX_OPTIONS, VaultError::TooManyOptions);

    vault.state = VaultState::Active;

    emit!(VaultActivated {
        vault: vault.key(),
        num_options: vault.num_options,
    });

    Ok(())
}
