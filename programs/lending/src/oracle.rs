// Price oracle utilities for reading prices from Meteora pools

use anchor_lang::prelude::*;
use crate::cpi::{cp_amm, dlmm};
use crate::error::ErrorCode;

/// Price scale factor (1e12 for precision)
pub const PRICE_SCALE: u64 = 1_000_000_000_000; // 1e12

/// Get price from a CP-AMM (DAMM v2) pool
/// Returns: price of token B in terms of token A (scaled by PRICE_SCALE)
/// 
/// CP-AMM stores sqrt_price as Q64.64 fixed-point: sqrt(price_b_in_a) * 2^64
/// price = (sqrt_price / 2^64)^2 = sqrt_price^2 / 2^128
pub fn get_cp_amm_price(pool_account: &AccountInfo) -> Result<u64> {
    // Deserialize pool state
    let pool_data = pool_account.try_borrow_data()?;
    let pool = cp_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
    let sqrt_price = pool.sqrt_price;
    
    // Calculate price: (sqrt_price^2 * PRICE_SCALE) / 2^128
    let price = calculate_price_from_sqrt(sqrt_price)?;
    
    Ok(price)
}

/// Get price from a DLMM pool using active bin
/// Returns: price of token Y in terms of token X (scaled by PRICE_SCALE)
pub fn get_dlmm_price(lb_pair_account: &AccountInfo) -> Result<u64> {
    let pair_data = lb_pair_account.try_borrow_data()?;
    
    // Deserialize LbPair state
    let lb_pair = dlmm::accounts::LbPair::try_deserialize(&mut &pair_data[..])?;
    
    let active_id = lb_pair.active_id;
    let bin_step = lb_pair.bin_step;
    
    let price = calculate_dlmm_price(active_id, bin_step)?;
    
    Ok(price)
}

/// Calculate price from sqrt_price (u128, Q64.64 format)
/// price = (sqrt_price / 2^64)^2 * PRICE_SCALE
fn calculate_price_from_sqrt(sqrt_price: u128) -> Result<u64> {
    // sqrt_price is in Q64.64 format (64 integer bits, 64 fractional bits)
    // price = sqrt_price^2 / 2^128
    // 
    // To avoid overflow and maintain precision:
    // 1. Shift sqrt_price right to reduce magnitude
    // 2. Square
    // 3. Adjust for scale
    
    if sqrt_price == 0 {
        return Err(ErrorCode::InvalidOraclePrice.into());
    }
    
    // Split sqrt_price: keep top bits for precision
    // sqrt_price >> 32 gives us a u96 range
    let sqrt_shifted = sqrt_price >> 32;
    
    // Square it: (sqrt_price >> 32)^2 = sqrt_price^2 >> 64
    // This is still in u128 range
    let price_raw = sqrt_shifted
        .checked_mul(sqrt_shifted)
        .ok_or(ErrorCode::Overflow)?;
    
    // Now we have: price_raw = sqrt_price^2 >> 64
    // But we need: price = sqrt_price^2 / 2^128
    // So: price = price_raw >> 64
    // Then scale by PRICE_SCALE
    
    let price = (price_raw >> 64)
        .checked_mul(PRICE_SCALE as u128)
        .ok_or(ErrorCode::Overflow)?;
    
    // Handle case where price_raw >> 64 is 0 but we still want a non-zero result
    // for very small prices
    if price == 0 && sqrt_price > 0 {
        // Return minimum representable price
        return Ok(1);
    }
    
    Ok(price as u64)
}

/// Calculate DLMM price from active bin ID and bin step
/// price = (1 + bin_step/10000)^(active_id - 8388608)
/// where 8388608 = 2^23 (the zero point)
fn calculate_dlmm_price(active_id: i32, bin_step: u16) -> Result<u64> {
    const ZERO_POINT: i32 = 8388608; // 2^23
    
    let delta = active_id - ZERO_POINT;
    let bin_step_bps = bin_step as u64;
    
    // Base multiplier: (10000 + bin_step) / 10000
    let multiplier_num = 10000u64 + bin_step_bps;
    let multiplier_den = 10000u64;
    
    let mut price = PRICE_SCALE;
    let abs_delta = delta.unsigned_abs().min(200) as usize; // Cap iterations
    
    if delta >= 0 {
        for _ in 0..abs_delta {
            price = price
                .checked_mul(multiplier_num)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(multiplier_den)
                .ok_or(ErrorCode::Overflow)?;
        }
    } else {
        for _ in 0..abs_delta {
            price = price
                .checked_mul(multiplier_den)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(multiplier_num)
                .ok_or(ErrorCode::Overflow)?;
        }
    }
    
    Ok(price)
}

/// Validate that CP-AMM pool mints match vault mints
pub fn validate_cp_amm_pool_mints(
    pool_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let pool_data = pool_account.try_borrow_data()?;
    let pool = cp_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
    // Check if mints match - return which order (true = A is base, false = B is base)
    if pool.token_a_mint == *expected_base && pool.token_b_mint == *expected_quote {
        Ok(true) // A is base, B is quote
    } else if pool.token_a_mint == *expected_quote && pool.token_b_mint == *expected_base {
        Ok(false) // A is quote, B is base (need to invert price)
    } else {
        Err(ErrorCode::PoolMintMismatch.into())
    }
}

/// Validate that DLMM pool mints match vault mints
pub fn validate_dlmm_pool_mints(
    lb_pair_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let pair_data = lb_pair_account.try_borrow_data()?;
    let lb_pair = dlmm::accounts::LbPair::try_deserialize(&mut &pair_data[..])?;
    
    // Check if mints match - return which order (true = X is base, false = Y is base)
    if lb_pair.token_x_mint == *expected_base && lb_pair.token_y_mint == *expected_quote {
        Ok(true) // X is base, Y is quote
    } else if lb_pair.token_x_mint == *expected_quote && lb_pair.token_y_mint == *expected_base {
        Ok(false) // X is quote, Y is base (need to invert price)
    } else {
        Err(ErrorCode::PoolMintMismatch.into())
    }
}

/// Invert a price (for when pool order is opposite of vault order)
pub fn invert_price(price: u64) -> Result<u64> {
    if price == 0 {
        return Err(ErrorCode::InvalidOraclePrice.into());
    }
    
    // inverted = PRICE_SCALE^2 / price
    let inverted = (PRICE_SCALE as u128)
        .checked_mul(PRICE_SCALE as u128)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(price as u128)
        .ok_or(ErrorCode::Overflow)?;
    
    Ok(inverted as u64)
}
