use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TransferChecked};

use crate::error::ErrorCode;

// ============================================================================
// Token Transfers
// ============================================================================

/// User-signed token transfer
pub fn transfer_checked<'info>(
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: from.clone(),
        mint: mint.clone(),
        to: to.clone(),
        authority: authority.clone(),
    };
    let cpi_ctx = CpiContext::new(token_program.clone(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, decimals)
}

/// PDA-signed token transfer
pub fn transfer_checked_signed<'info>(
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: from.clone(),
        mint: mint.clone(),
        to: to.clone(),
        authority: authority.clone(),
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program.clone(), cpi_accounts, signer_seeds);
    token_interface::transfer_checked(cpi_ctx, amount, decimals)
}

// ============================================================================
// Math Helpers
// ============================================================================

/// Calculate basis points of an amount
/// result = amount * bps / 10000
pub fn calculate_bps(amount: u64, bps: u16) -> Result<u64> {
    (amount as u128)
        .checked_mul(bps as u128)
        .and_then(|v| v.checked_div(10_000))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or_else(|| error!(ErrorCode::Overflow))
}

/// Calculate max borrow amount given collateral and LTV
/// max_borrow_value = collateral_value * ltv_bps / 10000
/// max_borrow_amount = max_borrow_value * price_scale / base_price
pub fn calculate_max_borrow(
    collateral_amount: u64,
    ltv_bps: u16,
    base_price: u64,    // price of 1 base in quote (scaled by price_scale)
    price_scale: u64,
) -> Result<u64> {
    // max_borrow_value_in_quote = collateral * ltv / 10000
    // max_borrow_in_base = max_borrow_value_in_quote * price_scale / base_price
    
    let max_value = (collateral_amount as u128)
        .checked_mul(ltv_bps as u128)
        .ok_or_else(|| error!(ErrorCode::Overflow))?
        .checked_div(10_000)
        .ok_or_else(|| error!(ErrorCode::Overflow))?;
    
    let max_borrow = max_value
        .checked_mul(price_scale as u128)
        .ok_or_else(|| error!(ErrorCode::Overflow))?
        .checked_div(base_price as u128)
        .ok_or_else(|| error!(ErrorCode::Overflow))?;
    
    u64::try_from(max_borrow).map_err(|_| error!(ErrorCode::Overflow))
}

/// Check if a borrow amount is within LTV limits
pub fn is_within_ltv(
    collateral_amount: u64,
    borrow_amount: u64,
    ltv_bps: u16,
    base_price: u64,
    price_scale: u64,
) -> Result<bool> {
    let max_borrow = calculate_max_borrow(collateral_amount, ltv_bps, base_price, price_scale)?;
    Ok(borrow_amount <= max_borrow)
}
