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

declare_id!("VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC");

pub mod common;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

pub use common::*;
pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

#[program]
pub mod vault {
    use super::*;

    /*
     * Admin Actions
     */
    pub fn initialize(ctx: Context<InitializeVault>, nonce: u16) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, nonce)
    }

    pub fn add_option(ctx: Context<AddOption>) -> Result<()> {
        instructions::add_option::add_option_handler(ctx)
    }

    pub fn activate(ctx: Context<ActivateVault>) -> Result<()> {
        instructions::activate_vault::activate_vault_handler(ctx)
    }

    pub fn finalize(ctx: Context<FinalizeVault>, winning_idx: u8) -> Result<()> {
        instructions::finalize::finalize_vault_handler(ctx, winning_idx)
    }

    /*
     * User Vault Actions
     */
    pub fn deposit<'info>(
        ctx: Context<'_, '_, '_, 'info, UserVaultAction<'info>>,
        vault_type: VaultType,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit::deposit_handler(ctx, vault_type, amount)
    }

    pub fn withdraw<'info>(
        ctx: Context<'_, '_, '_, 'info, UserVaultAction<'info>>,
        vault_type: VaultType,
        amount: u64,
    ) -> Result<()> {
        instructions::withdrawal::withdrawal_handler(ctx, vault_type, amount)
    }

    pub fn redeem_winnings<'info>(
        ctx: Context<'_, '_, 'info, 'info, UserVaultAction<'info>>,
        vault_type: VaultType,
    ) -> Result<()> {
        instructions::redeem_winnings::redeem_winnings_handler(ctx, vault_type)
    }
}
