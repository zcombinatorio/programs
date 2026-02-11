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
/// CP-AMM stores sqrt_price as Q64.64 fixed-point.
/// Formula from Meteora SDK:
///   price_per_token = sqrtPrice² × 10^(tokenADecimal - tokenBDecimal) / 2^128
/// 
/// We convert to lamport-denominated price for direct use in calculations.
/// 
/// Returns: quote lamports per base lamport, scaled by PRICE_SCALE
/// `is_a_base`: true if pool's token A is the base token
pub fn get_cp_amm_price(
    pool_account: &AccountInfo,
    base_decimals: u8,
    quote_decimals: u8,
    is_a_base: bool,
) -> Result<u64> {
    let pool_data = pool_account.try_borrow_data()?;
    let pool = cp_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
    let sqrt_price = pool.sqrt_price;
    if sqrt_price == 0 {
        return Err(ErrorCode::InvalidOraclePrice.into());
    }
    
    // Calculate price: sqrtPrice² / 2^128
    // Using u256 simulation with two u128s to avoid overflow
    let sqrt_u128 = sqrt_price;
    
    // Split sqrt_price to avoid overflow: sqrt_price = high * 2^64 + low
    // price = sqrt_price² / 2^128
    // We compute this as: (sqrt_price / 2^64)² = (sqrt_price >> 64)² when sqrt_price is large
    // For better precision, we do: (sqrt_price² >> 128) with careful handling
    
    // Method: multiply in parts
    // sqrt_price² = (sqrt_price * sqrt_price)
    // We need the result >> 128
    
    // Use 128-bit arithmetic carefully
    let price_raw = if sqrt_u128 <= u64::MAX as u128 {
        // Small enough to square directly, then shift
        let squared = sqrt_u128.checked_mul(sqrt_u128).ok_or(ErrorCode::Overflow)?;
        // squared / 2^128 will be very small, need to scale first
        // price = squared * PRICE_SCALE / 2^128
        // But squared < 2^128, so squared * PRICE_SCALE / 2^128 could be < PRICE_SCALE
        squared
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::Overflow)?
            >> 128
    } else {
        // Large sqrt_price: shift first to avoid overflow
        // price ≈ (sqrt_price >> 64)² / 2^0 = (sqrt_price >> 64)²
        let shifted = sqrt_u128 >> 64;
        let squared = shifted.checked_mul(shifted).ok_or(ErrorCode::Overflow)?;
        // This gives us price in native units, scale it
        squared
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::Overflow)?
    };
    
    // Apply decimal adjustment
    // If A is base, price is B/A (quote/base) - correct direction
    // If A is quote, price is B/A (base/quote) - need to invert later
    // 
    // Decimal adjustment: multiply by 10^(base_decimals - quote_decimals)
    // This converts from "per token" to "per lamport" basis
    let decimal_diff = base_decimals as i16 - quote_decimals as i16;
    
    let adjusted = if decimal_diff >= 0 {
        let multiplier = 10u128.pow(decimal_diff as u32);
        price_raw.checked_mul(multiplier).ok_or(ErrorCode::Overflow)?
    } else {
        let divisor = 10u128.pow((-decimal_diff) as u32);
        price_raw.checked_div(divisor).ok_or(ErrorCode::Overflow)?
    };
    
    // Invert if token order doesn't match
    let final_price = if is_a_base {
        adjusted
    } else {
        // Need to invert: price was B/A but we want quote/base = A/B
        // inverted = PRICE_SCALE² / price
        (PRICE_SCALE as u128)
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(adjusted)
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
///   pricePerLamport = (1 + binStep/10000)^activeId
///   pricePerToken = pricePerLamport × 10^(baseDecimal - quoteDecimal)
/// 
/// Note: activeId is a signed i32, can be negative (price < 1) or positive (price > 1)
/// 
/// Returns: quote lamports per base lamport, scaled by PRICE_SCALE
/// `is_x_base`: true if pool's token X is the base token
pub fn get_dlmm_price(
    lb_pair_account: &AccountInfo,
    base_decimals: u8,
    quote_decimals: u8,
    is_x_base: bool,
) -> Result<u64> {
    let pair_data = lb_pair_account.try_borrow_data()?;
    let lb_pair = dlmm::accounts::LbPair::try_deserialize(&mut &pair_data[..])?;
    
    let active_id = lb_pair.active_id;
    let bin_step = lb_pair.bin_step;
    
    // Calculate (1 + binStep/10000)^activeId
    // Use fixed-point arithmetic for precision
    let price_raw = calculate_dlmm_bin_price(active_id, bin_step)?;
    
    // Apply decimal adjustment
    let decimal_diff = base_decimals as i16 - quote_decimals as i16;
    
    let adjusted = if decimal_diff >= 0 {
        let multiplier = 10u128.pow(decimal_diff as u32);
        (price_raw as u128).checked_mul(multiplier).ok_or(ErrorCode::Overflow)?
    } else {
        let divisor = 10u128.pow((-decimal_diff) as u32);
        (price_raw as u128).checked_div(divisor).ok_or(ErrorCode::Overflow)?
    };
    
    // Invert if token order doesn't match
    let final_price = if is_x_base {
        adjusted
    } else {
        (PRICE_SCALE as u128)
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(adjusted)
            .ok_or(ErrorCode::InvalidOraclePrice)?
    };
    
    if final_price == 0 {
        return Ok(1);
    }
    
    Ok(final_price as u64)
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
    
    // Limit iterations for safety (|bin_id| > 500 would be extreme)
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
