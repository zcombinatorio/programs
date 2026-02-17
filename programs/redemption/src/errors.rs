/*
 * Copyright (C) 2025 Spice Finance Inc.
 * Licensed under AGPL-3.0 — see LICENSE
 */
use anchor_lang::prelude::*;

#[error_code]
pub enum RedemptionError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient vault balance")]
    InsufficientBalance,
    #[msg("Overflow")]
    Overflow,
}
