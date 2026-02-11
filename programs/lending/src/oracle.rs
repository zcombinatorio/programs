// Price oracle utilities for reading prices from Meteora pools

use anchor_lang::prelude::*;
use crate::cpi::{dynamic_amm, dlmm};
use crate::error::ErrorCode;

/// Price scale factor (1e12 for precision)
pub const PRICE_SCALE: u64 = 1_000_000_000_000; // 1e12

/// Get price from a Dynamic AMM pool
/// Returns: price of token B in terms of token A (scaled by PRICE_SCALE)
/// 
/// For constant product AMM: price = reserve_a / reserve_b
/// We read the vault LP token amounts which represent the pool's share of reserves
pub fn get_dynamic_amm_price(
    pool_account: &AccountInfo,
    a_vault_lp_account: &AccountInfo,
    b_vault_lp_account: &AccountInfo,
) -> Result<u64> {
    // Deserialize pool state
    let pool_data = pool_account.try_borrow_data()?;
    let _pool = dynamic_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
    // Get vault LP amounts (these represent the pool's reserves)
    // For a constant product AMM, price = reserve_a / reserve_b
    
    // Read LP token account amounts
    let a_vault_lp_data = a_vault_lp_account.try_borrow_data()?;
    let b_vault_lp_data = b_vault_lp_account.try_borrow_data()?;
    
    // Token account amount is at offset 64 (after 32 bytes mint + 32 bytes owner)
    let a_amount = u64::from_le_bytes(
        a_vault_lp_data[64..72].try_into().map_err(|_| ErrorCode::InvalidPool)?
    );
    let b_amount = u64::from_le_bytes(
        b_vault_lp_data[64..72].try_into().map_err(|_| ErrorCode::InvalidPool)?
    );
    
    if b_amount == 0 {
        return Err(ErrorCode::InvalidPool.into());
    }
    
    // price = a_amount / b_amount * PRICE_SCALE
    let price = (a_amount as u128)
        .checked_mul(PRICE_SCALE as u128)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(b_amount as u128)
        .ok_or(ErrorCode::Overflow)?;
    
    Ok(price as u64)
}

/// Get price from a DLMM pool using active bin
/// Returns: price of token Y in terms of token X (scaled by PRICE_SCALE)
pub fn get_dlmm_price(lb_pair_account: &AccountInfo) -> Result<u64> {
    let pair_data = lb_pair_account.try_borrow_data()?;
    
    // Deserialize LbPair state
    let lb_pair = dlmm::accounts::LbPair::try_deserialize(&mut &pair_data[..])?;
    
    // DLMM price is derived from active bin ID
    // price = (1 + bin_step/10000)^(active_id - 2^23)
    let active_id = lb_pair.active_id;
    let bin_step = lb_pair.bin_step;
    
    let price = calculate_dlmm_price(active_id, bin_step)?;
    
    Ok(price)
}

/// Calculate DLMM price from active bin ID and bin step
/// price = (1 + bin_step/10000)^(active_id - 8388608)
/// where 8388608 = 2^23 (the zero point)
fn calculate_dlmm_price(active_id: i32, bin_step: u16) -> Result<u64> {
    const ZERO_POINT: i32 = 8388608; // 2^23
    
    let delta = active_id - ZERO_POINT;
    let bin_step_bps = bin_step as u64;
    
    // For small deltas, use iterative multiplication
    // price = PRICE_SCALE * (1 + bin_step/10000)^delta
    
    // Base multiplier: (10000 + bin_step) / 10000
    let multiplier_num = 10000u64 + bin_step_bps;
    let multiplier_den = 10000u64;
    
    let mut price = PRICE_SCALE;
    let abs_delta = delta.unsigned_abs().min(200) as usize; // Cap iterations
    
    if delta >= 0 {
        // price > 1: multiply by (1 + bin_step/10000) for each step
        for _ in 0..abs_delta {
            price = price
                .checked_mul(multiplier_num)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(multiplier_den)
                .ok_or(ErrorCode::Overflow)?;
        }
    } else {
        // price < 1: divide by (1 + bin_step/10000) for each step
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

/// Validate that pool mints match vault mints
pub fn validate_dynamic_amm_pool_mints(
    pool_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let pool_data = pool_account.try_borrow_data()?;
    let pool = dynamic_amm::accounts::Pool::try_deserialize(&mut &pool_data[..])?;
    
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
