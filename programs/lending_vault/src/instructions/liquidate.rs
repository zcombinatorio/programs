use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::state::*;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PositionLiquidated {
    pub vault: Pubkey,
    pub position: Pubkey,
    pub user: Pubkey,
    pub liquidator: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub base_recovered: u64,
    pub liquidation_reason: LiquidationReason,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum LiquidationReason {
    Expired,
    Undercollateralized,
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
pub struct Liquidate<'info> {
    /// Anyone can liquidate (permissionless)
    #[account(mut)]
    pub liquidator: Signer<'info>,

    /// The user who owns the position (receives rent refund)
    /// CHECK: Validated via position.user
    #[account(mut, address = position.user)]
    pub user: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = base_mint,
        has_one = quote_mint,
        has_one = base_vault,
        has_one = quote_vault,
        has_one = pool,
    )]
    pub vault: Account<'info, LendingVault>,

    #[account(
        mut,
        has_one = vault,
        constraint = position.is_active @ ErrorCode::PositionNotActive,
        seeds = [POSITION_SEED, vault.key().as_ref(), position.user.as_ref()],
        bump = position.bump,
        close = user,
    )]
    pub position: Account<'info, Position>,

    pub base_mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    /// Pool for price check and swap
    /// CHECK: Validated against vault.pool
    pub pool: UncheckedAccount<'info>,

    // === Additional accounts for swap CPI will be added here ===
    // These will be needed for Meteora integration:
    // pub pool_base_vault: ...
    // pub pool_quote_vault: ...
    // pub pool_program: ...

    pub token_program: Interface<'info, TokenInterface>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn handler(ctx: Context<Liquidate>) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &ctx.accounts.vault;
    let position = &ctx.accounts.position;

    // Check if position is liquidatable
    let is_expired = position.is_expired(clock.unix_timestamp, vault.loan_duration_seconds);
    
    // TODO: Get price from pool via CPI for health check
    // For now, placeholder - will be implemented with Meteora integration
    let base_price: u64 = 1_000_000; // Placeholder: 1 base = 1 quote (6 decimals)
    let price_scale: u64 = 1_000_000;
    
    let is_undercollateralized = position.is_undercollateralized(
        base_price,
        price_scale,
        vault.liquidation_threshold_bps,
    );

    require!(
        is_expired || is_undercollateralized,
        ErrorCode::NotLiquidatable
    );

    let liquidation_reason = if is_expired {
        LiquidationReason::Expired
    } else {
        LiquidationReason::Undercollateralized
    };

    let collateral_amount = position.collateral_amount;
    let borrowed_amount = position.borrowed_amount;

    // TODO: Swap collateral (quote) to base via pool CPI
    // For now, we just account for the collateral as "recovered base"
    // The actual swap will be implemented with Meteora integration
    //
    // The flow will be:
    // 1. CPI to pool.swap(quote -> base)
    // 2. Base goes back to base_vault
    // 3. Track how much base was recovered (may be less than borrowed if price moved)
    
    // Placeholder: assume 1:1 swap for now
    let base_recovered = collateral_amount; // Will be actual swap output

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.total_base_borrowed = vault
        .total_base_borrowed
        .checked_sub(borrowed_amount)
        .ok_or(ErrorCode::Overflow)?;
    vault.total_quote_collateral = vault
        .total_quote_collateral
        .checked_sub(collateral_amount)
        .ok_or(ErrorCode::Overflow)?;
    vault.open_positions = vault
        .open_positions
        .checked_sub(1)
        .ok_or(ErrorCode::Overflow)?;
    
    // Note: total_base_liquidity may increase or decrease depending on swap result
    // If base_recovered > borrowed_amount: profit
    // If base_recovered < borrowed_amount: loss (bad debt)
    // For now, we accept the loss - the difference is the protocol's loss
    
    // Adjust liquidity based on recovery
    // total_liquidity was reduced by borrowed_amount when position opened
    // now we "return" base_recovered to the pool
    if base_recovered >= borrowed_amount {
        // Profit scenario: keep the profit in the vault
        vault.total_base_liquidity = vault
            .total_base_liquidity
            .checked_add(base_recovered.saturating_sub(borrowed_amount))
            .ok_or(ErrorCode::Overflow)?;
    } else {
        // Loss scenario: reduce liquidity by the loss
        vault.total_base_liquidity = vault
            .total_base_liquidity
            .checked_sub(borrowed_amount.saturating_sub(base_recovered))
            .unwrap_or(0); // Floor at 0 if loss exceeds liquidity
    }

    emit!(PositionLiquidated {
        vault: vault.key(),
        position: ctx.accounts.position.key(),
        user: ctx.accounts.position.user,
        liquidator: ctx.accounts.liquidator.key(),
        collateral_amount,
        borrowed_amount,
        base_recovered,
        liquidation_reason,
    });

    // Position account is closed via `close = user` constraint

    Ok(())
}
