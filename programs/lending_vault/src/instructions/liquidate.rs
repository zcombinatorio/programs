use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::state::*;
use crate::oracle::{self, PRICE_SCALE};
// use crate::cpi::dynamic_amm; // TODO: uncomment when swap CPI is implemented

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
    pub base_price: u64,
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

    /// Pool for price oracle and swap
    /// CHECK: Validated against vault.pool
    pub pool: UncheckedAccount<'info>,

    // === Dynamic AMM specific accounts (for price reading) ===
    /// Pool's A vault LP token account
    /// CHECK: Validated in handler if pool_type is DammV2
    pub pool_a_vault_lp: Option<UncheckedAccount<'info>>,
    
    /// Pool's B vault LP token account
    /// CHECK: Validated in handler if pool_type is DammV2
    pub pool_b_vault_lp: Option<UncheckedAccount<'info>>,

    // === Swap accounts (for liquidation) ===
    // These will be needed when we implement the actual swap CPI
    // For now, we just update accounting without the swap
    
    /// Pool's A vault
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub pool_a_vault: Option<UncheckedAccount<'info>>,
    
    /// Pool's B vault
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub pool_b_vault: Option<UncheckedAccount<'info>>,
    
    /// Pool's A token vault
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub pool_a_token_vault: Option<UncheckedAccount<'info>>,
    
    /// Pool's B token vault
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub pool_b_token_vault: Option<UncheckedAccount<'info>>,
    
    /// Pool's A vault LP mint
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub pool_a_vault_lp_mint: Option<UncheckedAccount<'info>>,
    
    /// Pool's B vault LP mint
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub pool_b_vault_lp_mint: Option<UncheckedAccount<'info>>,
    
    /// Protocol fee token account
    /// CHECK: Required for Dynamic AMM swap
    #[account(mut)]
    pub protocol_token_fee: Option<UncheckedAccount<'info>>,
    
    /// Vault program (for Dynamic AMM)
    /// CHECK: Required for Dynamic AMM swap
    pub vault_program: Option<UncheckedAccount<'info>>,
    
    /// Dynamic AMM program
    /// CHECK: Required for Dynamic AMM swap
    pub dynamic_amm_program: Option<UncheckedAccount<'info>>,

    pub token_program: Interface<'info, TokenInterface>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn handler(ctx: Context<Liquidate>) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &ctx.accounts.vault;
    let position = &ctx.accounts.position;

    // Get price from pool based on pool type
    let (base_price, is_base_token_a) = match vault.pool_type {
        PoolType::DammV2 => {
            let a_vault_lp = ctx.accounts.pool_a_vault_lp.as_ref()
                .ok_or(ErrorCode::InvalidPool)?;
            let b_vault_lp = ctx.accounts.pool_b_vault_lp.as_ref()
                .ok_or(ErrorCode::InvalidPool)?;
            
            let is_a_base = oracle::validate_dynamic_amm_pool_mints(
                &ctx.accounts.pool.to_account_info(),
                &vault.base_mint,
                &vault.quote_mint,
            )?;
            
            let price = oracle::get_dynamic_amm_price(
                &ctx.accounts.pool.to_account_info(),
                &a_vault_lp.to_account_info(),
                &b_vault_lp.to_account_info(),
            )?;
            
            (price, is_a_base)
        }
        PoolType::Dlmm => {
            let is_x_base = oracle::validate_dlmm_pool_mints(
                &ctx.accounts.pool.to_account_info(),
                &vault.base_mint,
                &vault.quote_mint,
            )?;
            
            let price = oracle::get_dlmm_price(&ctx.accounts.pool.to_account_info())?;
            
            (price, is_x_base)
        }
    };
    
    // Adjust price if needed
    let base_price = if is_base_token_a {
        base_price
    } else {
        oracle::invert_price(base_price)?
    };

    // Check if position is liquidatable
    let is_expired = position.is_expired(clock.unix_timestamp, vault.loan_duration_seconds);
    let is_undercollateralized = position.is_undercollateralized(
        base_price,
        PRICE_SCALE,
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

    // TODO: Execute swap via pool CPI
    // For now, we calculate expected recovery based on current price
    // Actual swap implementation will be added next
    
    // Expected base recovered = collateral_amount * PRICE_SCALE / base_price
    // (collateral is in quote, we're buying base)
    let base_recovered = (collateral_amount as u128)
        .checked_mul(PRICE_SCALE as u128)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(base_price as u128)
        .ok_or(ErrorCode::Overflow)? as u64;

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
    
    // Adjust liquidity based on recovery vs borrowed
    if base_recovered >= borrowed_amount {
        // Profit: add excess to liquidity
        vault.total_base_liquidity = vault
            .total_base_liquidity
            .checked_add(base_recovered.saturating_sub(borrowed_amount))
            .ok_or(ErrorCode::Overflow)?;
    } else {
        // Loss (bad debt): reduce liquidity
        vault.total_base_liquidity = vault
            .total_base_liquidity
            .saturating_sub(borrowed_amount.saturating_sub(base_recovered));
    }

    emit!(PositionLiquidated {
        vault: vault.key(),
        position: ctx.accounts.position.key(),
        user: ctx.accounts.position.user,
        liquidator: ctx.accounts.liquidator.key(),
        collateral_amount,
        borrowed_amount,
        base_recovered,
        base_price,
        liquidation_reason,
    });

    // Position account is closed via `close = user` constraint

    Ok(())
}
