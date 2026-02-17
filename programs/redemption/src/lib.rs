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

declare_id!("rdm5xmgfjVn2WXCNrdEuBDoj3JJHt7K6M82jBnXf1Ef");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

#[program]
pub mod redemption {
    use super::*;

    /// Initialize a new redemption vault
    pub fn initialize(ctx: Context<Initialize>, nonce: u16, price: u64, deposit: u64) -> Result<()> {
        initialize_handler(ctx, nonce, price, deposit)
    }

    /// Admin withdraws tokens from the vault
    pub fn withdraw(ctx: Context<Withdraw>, quote_amount: u64, base_amount: u64) -> Result<()> {
        withdraw_handler(ctx, quote_amount, base_amount)
    }

    /// User redeems base tokens for quote tokens
    pub fn redeem(ctx: Context<Redeem>, base_amount: u64) -> Result<()> {
        redeem_handler(ctx, base_amount)
    }
}
