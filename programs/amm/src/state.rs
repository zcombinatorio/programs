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
use crate::twap::TwapOracle;
use anchor_lang::prelude::*;

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum PoolState {
    Trading,
    Finalized,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PoolBumps {
    pub pool: u8,
    pub reserve_a: u8,
    pub reserve_b: u8,
    pub fee_vault: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PoolAccount {
    pub version: u8,
    pub bumps: PoolBumps,

    pub state: PoolState,

    // Mints
    // Fees are collected in mint_a
    pub mint_a: Pubkey, // In prod, cond. quote
    pub mint_b: Pubkey, // In prod, cond. base

    // Fee (basis points)
    pub fee: u16,

    // Given full state-change
    // In prod, given to the proposal PDA
    pub admin: Pubkey,

    // Sole liquidity provider
    pub liquidity_provider: Pubkey,

    pub oracle: TwapOracle,
}
