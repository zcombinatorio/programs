// Price oracle utilities for reading prices from Meteora pools
//
// Price convention: "quote lamports per base lamport" scaled by PRICE_SCALE
// This allows direct use in LTV calculations with lamport amounts.

use anchor_lang::prelude::*;
use crate::cpi::{cp_amm, dlmm};
use crate::error::ErrorCode;

/// Price scale factor (1e12 for precision)
pub const PRICE_SCALE: u64 = 1_000_000_000_000; // 1e12

/// Get price from a CP-AMM (DAMM v2) pool
/// 
/// CP-AMM stores sqrt_price in Q64.64 fixed-point format.
/// price = sqrtPrice² / 2^128
/// 
/// This gives lamport-denominated price directly (no decimal adjustment needed).
/// 
/// Returns: B lamports per A lamport, scaled by PRICE_SCALE
/// If is_a_base=true, this is quote/base (what we want)
/// If is_a_base=false, this is base/quote (need to invert)
pub fn get_cp_amm_price(
    pool_account: &AccountInfo,
    is_a_base: bool,
) -> Result<u64> {
    let pool_data = pool_account.try_borrow_data()?;
    let pool = cp_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
    let sqrt_price = pool.sqrt_price;
    if sqrt_price == 0 {
        return Err(ErrorCode::InvalidOraclePrice.into());
    }
    
    // Calculate price: sqrtPrice² / 2^128 * PRICE_SCALE
    // 
    // sqrtPrice is u128 in Q64.64 format
    // We need: (sqrtPrice² / 2^128) * PRICE_SCALE
    //
    // Key insight: multiply by PRICE_SCALE before final shift to preserve precision
    
    let price_scaled = if sqrt_price < (1u128 << 32) {
        // Very small: sqrt_price² * PRICE_SCALE fits easily
        let squared = sqrt_price * sqrt_price;
        (squared * (PRICE_SCALE as u128)) >> 128
    } else if sqrt_price < (1u128 << 64) {
        // Small-medium: sqrt_price² fits in u128
        let squared = sqrt_price.checked_mul(sqrt_price).ok_or(ErrorCode::Overflow)?;
        // (squared >> 96) * PRICE_SCALE >> 32 = squared * PRICE_SCALE >> 128
        // But we do: (squared >> 32) * PRICE_SCALE >> 96 for better precision
        let partial = squared >> 32;
        partial.checked_mul(PRICE_SCALE as u128).ok_or(ErrorCode::Overflow)? >> 96
    } else if sqrt_price < (1u128 << 80) {
        // Medium: (sqrt_price >> 32)² fits in u128
        let shifted = sqrt_price >> 32;
        let squared = shifted.checked_mul(shifted).ok_or(ErrorCode::Overflow)?;
        // squared = sqrt_price² >> 64, need >> 128 total = >> 64 more
        // (squared >> 32) * PRICE_SCALE >> 32 preserves precision
        let partial = squared >> 32;
        partial.checked_mul(PRICE_SCALE as u128).ok_or(ErrorCode::Overflow)? >> 32
    } else {
        // Large: (sqrt_price >> 64)² is the price
        let shifted = sqrt_price >> 64;
        shifted.checked_mul(shifted).ok_or(ErrorCode::Overflow)?
            .checked_mul(PRICE_SCALE as u128).ok_or(ErrorCode::Overflow)?
    };
    
    // Handle inversion based on token order
    let final_price = if is_a_base {
        // Pool gives B/A, we want quote/base = B/A if A is base. Correct.
        price_scaled
    } else {
        // Pool gives B/A, but A is quote, B is base
        // We want quote/base = A/B = 1/(B/A)
        // inverted = PRICE_SCALE² / price
        if price_scaled == 0 {
            return Err(ErrorCode::InvalidOraclePrice.into());
        }
        (PRICE_SCALE as u128)
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(price_scaled)
            .ok_or(ErrorCode::InvalidOraclePrice)?
    };
    
    if final_price == 0 {
        return Ok(1); // Minimum representable price
    }
    
    Ok(final_price as u64)
}

/// Get price from a DLMM pool using active bin
/// 
/// Formula from Meteora SDK:
///   price = (1 + binStep/10000)^activeId
/// 
/// activeId is signed i32: negative = price < 1, positive = price > 1
/// 
/// This gives the lamport-denominated price directly.
/// 
/// Returns: Y lamports per X lamport, scaled by PRICE_SCALE
pub fn get_dlmm_price(
    lb_pair_account: &AccountInfo,
    is_x_base: bool,
) -> Result<u64> {
    let pair_data = lb_pair_account.try_borrow_data()?;
    let lb_pair = dlmm::accounts::LbPair::try_deserialize(&mut &pair_data[..])?;
    
    let active_id = lb_pair.active_id;
    let bin_step = lb_pair.bin_step;
    
    // Calculate (1 + binStep/10000)^activeId * PRICE_SCALE
    let price_scaled = calculate_dlmm_bin_price(active_id, bin_step)?;
    
    // Handle inversion based on token order
    let final_price = if is_x_base {
        // Pool gives Y/X, we want quote/base = Y/X if X is base. Correct.
        price_scaled
    } else {
        // Pool gives Y/X, but X is quote, Y is base
        // We want quote/base = X/Y = 1/(Y/X)
        if price_scaled == 0 {
            return Err(ErrorCode::InvalidOraclePrice.into());
        }
        (PRICE_SCALE as u128)
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(price_scaled as u128)
            .ok_or(ErrorCode::InvalidOraclePrice)? as u64
    };
    
    if final_price == 0 {
        return Ok(1);
    }
    
    Ok(final_price)
}

/// Calculate DLMM price from bin ID and bin step
/// price = (1 + binStep/10000)^binId × PRICE_SCALE
/// 
/// binId is signed: negative = price < PRICE_SCALE, positive = price > PRICE_SCALE
fn calculate_dlmm_bin_price(bin_id: i32, bin_step: u16) -> Result<u64> {
    // Base = 1 + binStep/10000 = (10000 + binStep) / 10000
    let base_num = 10_000u64 + bin_step as u64;
    let base_den = 10_000u64;
    
    // Start with PRICE_SCALE (represents 1.0)
    let mut price = PRICE_SCALE as u128;
    
    // Limit iterations for safety (|bin_id| > 500 would be extreme prices)
    let abs_id = bin_id.unsigned_abs().min(500) as usize;
    
    if bin_id >= 0 {
        // Multiply by base for each step
        for _ in 0..abs_id {
            price = price
                .checked_mul(base_num as u128)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(base_den as u128)
                .ok_or(ErrorCode::Overflow)?;
        }
    } else {
        // Divide by base for each step (multiply by 10000/(10000+binStep))
        for _ in 0..abs_id {
            price = price
                .checked_mul(base_den as u128)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(base_num as u128)
                .ok_or(ErrorCode::Overflow)?;
        }
    }
    
    Ok(price as u64)
}

/// Validate that CP-AMM pool mints match vault mints
/// Returns: true if pool's token A is the base mint
pub fn validate_cp_amm_pool_mints(
    pool_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let pool_data = pool_account.try_borrow_data()?;
    let pool = cp_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
    if pool.token_a_mint == *expected_base && pool.token_b_mint == *expected_quote {
        Ok(true) // A is base, B is quote
    } else if pool.token_a_mint == *expected_quote && pool.token_b_mint == *expected_base {
        Ok(false) // A is quote, B is base
    } else {
        Err(ErrorCode::PoolMintMismatch.into())
    }
}

/// Validate that DLMM pool mints match vault mints
/// Returns: true if pool's token X is the base mint
pub fn validate_dlmm_pool_mints(
    lb_pair_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let pair_data = lb_pair_account.try_borrow_data()?;
    let lb_pair = dlmm::accounts::LbPair::try_deserialize(&mut &pair_data[..])?;
    
    if lb_pair.token_x_mint == *expected_base && lb_pair.token_y_mint == *expected_quote {
        Ok(true) // X is base, Y is quote
    } else if lb_pair.token_x_mint == *expected_quote && lb_pair.token_y_mint == *expected_base {
        Ok(false) // X is quote, Y is base
    } else {
        Err(ErrorCode::PoolMintMismatch.into())
    }
}
