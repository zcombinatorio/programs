/*
 * Copyright (C) 2025 Spice Finance Inc.
 * Licensed under AGPL-3.0 — see LICENSE
 */
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RedemptionVault {
    pub bump: u8,
    pub admin: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    /// Quote tokens per base token (scaled by 10^base_decimals)
    pub price: u64,
    pub base_decimals: u8,
}
