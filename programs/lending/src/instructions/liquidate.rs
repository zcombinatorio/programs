use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::state::*;
use crate::oracle::{self, PRICE_SCALE};
use crate::cpi::{cp_amm, dlmm};

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
// Accounts - CP-AMM Liquidation
// ============================================================================

#[derive(Accounts)]
pub struct LiquidateCpAmm<'info> {
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
        constraint = vault.pool_type == PoolType::CpAmm @ ErrorCode::InvalidPool,
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

    /// Vault's base token account (receives swapped base)
    #[account(mut)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,

    /// Vault's quote token account (source of collateral for swap)
    #[account(mut)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    // === CP-AMM Pool Accounts ===
    
    /// CHECK: Pool authority (constant address)
    #[account(address = cp_amm::CP_AMM_POOL_AUTHORITY)]
    pub pool_authority: UncheckedAccount<'info>,
    
    /// CHECK: Pool account (validated against vault.pool)
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    
    /// CHECK: Pool's token A vault
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,
    
    /// CHECK: Pool's token B vault
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,
    
    /// CHECK: Token A mint (validated against pool)
    pub token_a_mint: UncheckedAccount<'info>,
    
    /// CHECK: Token B mint (validated against pool)
    pub token_b_mint: UncheckedAccount<'info>,
    
    /// CHECK: Token A program
    pub token_a_program: UncheckedAccount<'info>,
    
    /// CHECK: Token B program
    pub token_b_program: UncheckedAccount<'info>,
    
    /// CHECK: Referral token account (optional)
    #[account(mut)]
    pub referral_token_account: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Event authority
    pub event_authority: UncheckedAccount<'info>,
    
    /// CHECK: CP-AMM program
    #[account(address = cp_amm::ID)]
    pub cp_amm_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

// ============================================================================
// Accounts - DLMM Liquidation
// ============================================================================

#[derive(Accounts)]
pub struct LiquidateDlmm<'info> {
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
        constraint = vault.pool == lb_pair.key() @ ErrorCode::InvalidPool,
        constraint = vault.pool_type == PoolType::Dlmm @ ErrorCode::InvalidPool,
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

    /// Vault's base token account (receives swapped base)
    #[account(mut)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,

    /// Vault's quote token account (source of collateral for swap)
    #[account(mut)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    // === DLMM Pool Accounts ===
    
    /// CHECK: LB Pair account (validated against vault.pool)
    #[account(mut)]
    pub lb_pair: UncheckedAccount<'info>,
    
    /// CHECK: Bin array bitmap extension (optional)
    pub bin_array_bitmap_extension: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Reserve X token account
    #[account(mut)]
    pub reserve_x: UncheckedAccount<'info>,
    
    /// CHECK: Reserve Y token account
    #[account(mut)]
    pub reserve_y: UncheckedAccount<'info>,
    
    /// CHECK: Token X mint
    pub token_x_mint: UncheckedAccount<'info>,
    
    /// CHECK: Token Y mint
    pub token_y_mint: UncheckedAccount<'info>,
    
    /// CHECK: Oracle account
    #[account(mut)]
    pub oracle: UncheckedAccount<'info>,
    
    /// CHECK: Host fee account (optional)
    #[account(mut)]
    pub host_fee_in: Option<UncheckedAccount<'info>>,
    
    /// CHECK: DLMM program
    #[account(address = dlmm::ID)]
    pub dlmm_program: UncheckedAccount<'info>,
    
    /// CHECK: Event authority
    pub event_authority: UncheckedAccount<'info>,
    
    /// CHECK: Token X program
    pub token_x_program: UncheckedAccount<'info>,
    
    /// CHECK: Token Y program
    pub token_y_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    // Bin arrays passed as remaining accounts
}

// ============================================================================
// Handlers
// ============================================================================

/// Liquidate a position using CP-AMM swap
pub fn handler_cp_amm(ctx: Context<LiquidateCpAmm>, min_amount_out: u64) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &ctx.accounts.vault;
    let position = &ctx.accounts.position;

    // Get price for health check (quote lamports per base lamport, scaled)
    let base_price = oracle::get_cp_amm_price(
        &ctx.accounts.pool.to_account_info(),
        vault.is_pool_base_token_a,
    )?;

    // Check liquidation conditions
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

    // Build vault signer seeds
    let vault_seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &vault.nonce.to_le_bytes(),
        &[vault.bump],
    ];
    let signer_seeds = &[&vault_seeds[..]];

    // Determine input/output based on pool token order
    // We're swapping quote (collateral) -> base
    let (input_token_account, output_token_account) = (
        ctx.accounts.quote_vault.to_account_info(),
        ctx.accounts.base_vault.to_account_info(),
    );

    // Execute swap via CP-AMM CPI
    let swap_accounts = cp_amm::cpi::accounts::Swap {
        pool_authority: ctx.accounts.pool_authority.to_account_info(),
        pool: ctx.accounts.pool.to_account_info(),
        input_token_account,
        output_token_account,
        token_a_vault: ctx.accounts.token_a_vault.to_account_info(),
        token_b_vault: ctx.accounts.token_b_vault.to_account_info(),
        token_a_mint: ctx.accounts.token_a_mint.to_account_info(),
        token_b_mint: ctx.accounts.token_b_mint.to_account_info(),
        payer: ctx.accounts.vault.to_account_info(),
        token_a_program: ctx.accounts.token_a_program.to_account_info(),
        token_b_program: ctx.accounts.token_b_program.to_account_info(),
        referral_token_account: ctx.accounts.referral_token_account
            .as_ref()
            .map(|a| a.to_account_info()),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        program: ctx.accounts.cp_amm_program.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.cp_amm_program.to_account_info(),
        swap_accounts,
        signer_seeds,
    );

    // Get base_vault balance before swap
    let base_before = ctx.accounts.base_vault.amount;
    
    // CP-AMM swap takes SwapParameters struct
    let swap_params = cp_amm::types::SwapParameters {
        amount_in: collateral_amount,
        minimum_amount_out: min_amount_out,
    };
    cp_amm::cpi::swap(cpi_ctx, swap_params)?;

    // Reload to get new balance
    ctx.accounts.base_vault.reload()?;
    let base_after = ctx.accounts.base_vault.amount;
    let base_recovered = base_after.saturating_sub(base_before);

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
    
    // Adjust liquidity based on profit/loss
    if base_recovered >= borrowed_amount {
        vault.total_base_liquidity = vault
            .total_base_liquidity
            .checked_add(base_recovered.saturating_sub(borrowed_amount))
            .ok_or(ErrorCode::Overflow)?;
    } else {
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

    Ok(())
}

/// Liquidate a position using DLMM swap
pub fn handler_dlmm<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, LiquidateDlmm<'info>>,
    min_amount_out: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let vault = &ctx.accounts.vault;
    let position = &ctx.accounts.position;

    // Get price for health check (quote lamports per base lamport, scaled)
    let base_price = oracle::get_dlmm_price(
        &ctx.accounts.lb_pair.to_account_info(),
        vault.is_pool_base_token_a,
    )?;

    // Check liquidation conditions
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

    // Build vault signer seeds
    let vault_seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &vault.nonce.to_le_bytes(),
        &[vault.bump],
    ];
    let signer_seeds = &[&vault_seeds[..]];

    // Determine token in/out based on pool token order
    // We're swapping quote -> base
    let (user_token_in, user_token_out) = (
        ctx.accounts.quote_vault.to_account_info(),
        ctx.accounts.base_vault.to_account_info(),
    );

    // Execute swap via DLMM CPI
    let swap_accounts = dlmm::cpi::accounts::Swap {
        lb_pair: ctx.accounts.lb_pair.to_account_info(),
        bin_array_bitmap_extension: ctx.accounts.bin_array_bitmap_extension
            .as_ref()
            .map(|a| a.to_account_info()),
        reserve_x: ctx.accounts.reserve_x.to_account_info(),
        reserve_y: ctx.accounts.reserve_y.to_account_info(),
        user_token_in,
        user_token_out,
        token_x_mint: ctx.accounts.token_x_mint.to_account_info(),
        token_y_mint: ctx.accounts.token_y_mint.to_account_info(),
        oracle: ctx.accounts.oracle.to_account_info(),
        host_fee_in: ctx.accounts.host_fee_in
            .as_ref()
            .map(|a| a.to_account_info()),
        user: ctx.accounts.vault.to_account_info(),
        token_x_program: ctx.accounts.token_x_program.to_account_info(),
        token_y_program: ctx.accounts.token_y_program.to_account_info(),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        program: ctx.accounts.dlmm_program.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.dlmm_program.to_account_info(),
        swap_accounts,
        signer_seeds,
    ).with_remaining_accounts(ctx.remaining_accounts.to_vec());

    // Get base_vault balance before swap
    let base_before = ctx.accounts.base_vault.amount;
    
    dlmm::cpi::swap(cpi_ctx, collateral_amount, min_amount_out)?;

    // Reload to get new balance
    ctx.accounts.base_vault.reload()?;
    let base_after = ctx.accounts.base_vault.amount;
    let base_recovered = base_after.saturating_sub(base_before);

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
    
    // Adjust liquidity based on profit/loss
    if base_recovered >= borrowed_amount {
        vault.total_base_liquidity = vault
            .total_base_liquidity
            .checked_add(base_recovered.saturating_sub(borrowed_amount))
            .ok_or(ErrorCode::Overflow)?;
    } else {
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

    Ok(())
}
