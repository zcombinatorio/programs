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

/// The redemption vault account that holds configuration and state
#[account]
#[derive(InitSpace)]
pub struct RedemptionVault {
    /// Version for future upgrades
    pub version: u8,
    /// Bump seed for PDA
    pub bump: u8,
    /// Admin who controls the vault
    pub admin: Pubkey,
    /// The token users send in (base mint)
    pub base_mint: Pubkey,
    /// The token users receive (quote mint)  
    pub quote_mint: Pubkey,
    /// Price: how many quote tokens per base token (scaled by base decimals)
    /// e.g., if price = 1_000_000 and base has 6 decimals, 1 base = 1 quote
    pub price: u64,
    /// Base mint decimals (cached for calculations)
    pub base_decimals: u8,
    /// Quote mint decimals (cached for calculations)
    pub quote_decimals: u8,
    /// Total base tokens redeemed (for tracking)
    pub total_redeemed: u64,
}
