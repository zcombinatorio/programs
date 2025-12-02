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

use crate::constants::MAX_OPTIONS;

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub enum VaultType {
    Base,  // 0
    Quote, // 1
}

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum VaultState {
    // Awaiting activation
    Setup,
    // Deposits / Withdrawals allowed
    Active,
    // Deposits / Withdrawals revoked
    // Redeem Winnings allowed
    Finalized,
}

#[derive(InitSpace)]
#[account]
pub struct VaultAccount {
    pub owner: Pubkey, // Vault creator
    pub mint: Pubkey,  // Regular mint
    pub nonce: u8,     // Unique identifier (e.g. protocol_id)
    pub proposal_id: u8,
    pub vault_type: VaultType,
    pub state: VaultState,

    // Number of markets (2 <= n <= MAX_OPTIONS)
    pub num_options: u8,
    pub cond_mints: [Pubkey; MAX_OPTIONS as usize], // allocate for max options

    // Set after finalization
    // index in cond_mints
    pub winning_idx: Option<u8>,

    pub bump: u8,
}
