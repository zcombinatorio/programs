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

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

#[program]
pub mod redemption {
    use super::*;

    /// Initialize a new redemption vault
    /// 
    /// # Arguments
    /// * `price` - Quote tokens per base token (scaled by base decimals)
    /// * `initial_deposit` - Amount of quote tokens to deposit initially
    pub fn initialize(ctx: Context<Initialize>, price: u64, initial_deposit: u64) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, price, initial_deposit)
    }

    /// Deposit additional quote tokens into the vault (admin only)
    /// 
    /// # Arguments
    /// * `amount` - Amount of quote tokens to deposit
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::deposit_handler(ctx, amount)
    }

    /// Withdraw tokens from the vault (admin only)
    /// Can withdraw both quote tokens and collected base tokens
    /// 
    /// # Arguments
    /// * `quote_amount` - Optional amount of quote tokens to withdraw
    /// * `base_amount` - Optional amount of base tokens to withdraw
    pub fn withdraw(
        ctx: Context<Withdraw>,
        quote_amount: Option<u64>,
        base_amount: Option<u64>,
    ) -> Result<()> {
        instructions::withdraw::withdraw_handler(ctx, quote_amount, base_amount)
    }

    /// Redeem base tokens for quote tokens at the set price
    /// 
    /// # Arguments
    /// * `base_amount` - Amount of base tokens to redeem
    pub fn redeem(ctx: Context<Redeem>, base_amount: u64) -> Result<()> {
        instructions::redeem::redeem_handler(ctx, base_amount)
    }
}
