// Price oracle utilities for reading prices from Meteora pools
//
// Price convention: "quote lamports per base lamport" scaled by PRICE_SCALE
// This allows direct use in LTV calculations with lamport amounts.

use anchor_lang::prelude::*;
use ethnum::U256;
use crate::error::ErrorCode;

/// Price scale factor (1e12 for precision)
pub const PRICE_SCALE: u64 = 1_000_000_000_000; // 1e12

// =============================================================================
// CP-AMM Pool byte offsets (avoids bytemuck alignment issues)
// Layout verified on-chain: USDC at 168, SOL at 200 in USDC/SOL pool
// =============================================================================
const CP_AMM_TOKEN_A_MINT_OFFSET: usize = 168;  // Pubkey (32 bytes)
const CP_AMM_TOKEN_B_MINT_OFFSET: usize = 200;  // Pubkey (32 bytes)
const CP_AMM_SQRT_PRICE_OFFSET: usize = 456;    // u128 (16 bytes)

// =============================================================================
// DLMM LbPair byte offsets (avoids full deserialization to prevent stack overflow)
// Layout: 8 disc + 32 StaticParams + 32 VarParams + 1 bump + 2 bin_step_seed + 1 pair_type
// =============================================================================
const DLMM_ACTIVE_ID_OFFSET: usize = 76;      // i32
const DLMM_BIN_STEP_OFFSET: usize = 80;       // u16
const DLMM_TOKEN_X_MINT_OFFSET: usize = 88;   // Pubkey (32 bytes)
const DLMM_TOKEN_Y_MINT_OFFSET: usize = 120;  // Pubkey (32 bytes)

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
/// 
/// Note: Uses direct byte reads to avoid bytemuck alignment issues with CP-AMM Pool struct
pub fn get_cp_amm_price(
    pool_account: &AccountInfo,
    is_a_base: bool,
) -> Result<u64> {
    let data = pool_account.try_borrow_data()?;
    
    // Read sqrt_price directly from verified byte offset (u128 little-endian)
    let sqrt_price_bytes: [u8; 16] = data[CP_AMM_SQRT_PRICE_OFFSET..CP_AMM_SQRT_PRICE_OFFSET + 16]
        .try_into()
        .map_err(|_| ErrorCode::InvalidOraclePrice)?;
    let sqrt_price = u128::from_le_bytes(sqrt_price_bytes);
    
    if sqrt_price == 0 {
        return Err(ErrorCode::InvalidOraclePrice.into());
    }
    
    // Calculate price: sqrtPrice² / 2^128 * PRICE_SCALE
    // Using U256 for clean, overflow-safe math
    let sqrt = U256::from(sqrt_price);
    let squared = sqrt * sqrt;                                // u256: no overflow possible
    let price = squared >> 128;                               // divide by 2^128
    let price_scaled: U256 = price * U256::from(PRICE_SCALE); // scale for precision
    
    // Handle inversion based on token order
    let final_price: U256 = if is_a_base {
        price_scaled
    } else {
        // Invert: PRICE_SCALE² / price
        let scale_squared = U256::from(PRICE_SCALE) * U256::from(PRICE_SCALE);
        if price_scaled == U256::ZERO {
            return Err(ErrorCode::InvalidOraclePrice.into());
        }
        scale_squared / price_scaled
    };
    
    if final_price == U256::ZERO {
        return Ok(1); // Minimum representable price
    }
    
    Ok(final_price.as_u64())
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
/// 
/// Note: Uses direct byte reads to avoid stack overflow from full LbPair deserialization
pub fn get_dlmm_price(
    lb_pair_account: &AccountInfo,
    is_x_base: bool,
) -> Result<u64> {
    let data = lb_pair_account.try_borrow_data()?;
    
    // Read active_id (i32) and bin_step (u16) directly from byte offsets
    let active_id = i32::from_le_bytes(
        data[DLMM_ACTIVE_ID_OFFSET..DLMM_ACTIVE_ID_OFFSET + 4]
            .try_into()
            .map_err(|_| ErrorCode::InvalidOraclePrice)?
    );
    let bin_step = u16::from_le_bytes(
        data[DLMM_BIN_STEP_OFFSET..DLMM_BIN_STEP_OFFSET + 2]
            .try_into()
            .map_err(|_| ErrorCode::InvalidOraclePrice)?
    );
    
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
/// 
/// Note: Uses direct byte reads to avoid bytemuck alignment issues with CP-AMM Pool struct
pub fn validate_cp_amm_pool_mints(
    pool_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let data = pool_account.try_borrow_data()?;
    
    // Read token_a_mint and token_b_mint directly from verified byte offsets
    let token_a_mint = Pubkey::try_from(
        &data[CP_AMM_TOKEN_A_MINT_OFFSET..CP_AMM_TOKEN_A_MINT_OFFSET + 32]
    ).map_err(|_| ErrorCode::InvalidOraclePrice)?;
    let token_b_mint = Pubkey::try_from(
        &data[CP_AMM_TOKEN_B_MINT_OFFSET..CP_AMM_TOKEN_B_MINT_OFFSET + 32]
    ).map_err(|_| ErrorCode::InvalidOraclePrice)?;
    
    if token_a_mint == *expected_base && token_b_mint == *expected_quote {
        Ok(true) // A is base, B is quote
    } else if token_a_mint == *expected_quote && token_b_mint == *expected_base {
        Ok(false) // A is quote, B is base
    } else {
        Err(ErrorCode::PoolMintMismatch.into())
    }
}

/// Validate that DLMM pool mints match vault mints
/// Returns: true if pool's token X is the base mint
/// 
/// Note: Uses direct byte reads to avoid stack overflow from full LbPair deserialization
pub fn validate_dlmm_pool_mints(
    lb_pair_account: &AccountInfo,
    expected_base: &Pubkey,
    expected_quote: &Pubkey,
) -> Result<bool> {
    let data = lb_pair_account.try_borrow_data()?;
    
    // Read token_x_mint and token_y_mint directly from byte offsets
    let token_x_mint = Pubkey::try_from(
        &data[DLMM_TOKEN_X_MINT_OFFSET..DLMM_TOKEN_X_MINT_OFFSET + 32]
    ).map_err(|_| ErrorCode::InvalidOraclePrice)?;
    let token_y_mint = Pubkey::try_from(
        &data[DLMM_TOKEN_Y_MINT_OFFSET..DLMM_TOKEN_Y_MINT_OFFSET + 32]
    ).map_err(|_| ErrorCode::InvalidOraclePrice)?;
    
    if token_x_mint == *expected_base && token_y_mint == *expected_quote {
        Ok(true) // X is base, Y is quote
    } else if token_x_mint == *expected_quote && token_y_mint == *expected_base {
        Ok(false) // X is quote, Y is base
    } else {
        Err(ErrorCode::PoolMintMismatch.into())
    }
}
