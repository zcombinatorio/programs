/*
 * Copyright (C) 2025 Spice Finance Inc.
 * Licensed under AGPL-3.0 — see LICENSE
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

    pub fn initialize(ctx: Context<Initialize>, price: u64, deposit: u64) -> Result<()> {
        initialize_handler(ctx, price, deposit)
    }

    pub fn withdraw(ctx: Context<Withdraw>, quote_amount: u64, base_amount: u64) -> Result<()> {
        withdraw_handler(ctx, quote_amount, base_amount)
    }

    pub fn redeem(ctx: Context<Redeem>, base_amount: u64) -> Result<()> {
        redeem_handler(ctx, base_amount)
    }
}
