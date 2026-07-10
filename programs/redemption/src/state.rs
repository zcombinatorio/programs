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

pub const VAULT_SEED: &[u8] = b"redemption";

/// Redemption vault that holds quote tokens for users to redeem with base tokens
#[account]
#[derive(InitSpace)]
pub struct RedemptionVault {
    pub bump: u8,
    pub nonce: u16,
    pub admin: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    /// Quote tokens per base token (scaled by 10^base_decimals)
    pub price: u64,
    pub base_decimals: u8,
    pub quote_decimals: u8,
}
