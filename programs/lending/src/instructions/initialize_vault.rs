use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::oracle;
use crate::state::*;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub pool: Pubkey,
    pub ltv_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub loan_duration_seconds: u64,
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
#[instruction(
    nonce: u16,
    ltv_bps: u16,
    liquidation_threshold_bps: u16,
    loan_duration_seconds: u64,
    pool_type: PoolType,
)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Base mint (what users borrow)
    pub base_mint: InterfaceAccount<'info, Mint>,

    /// Quote mint (what users deposit as collateral)
    pub quote_mint: InterfaceAccount<'info, Mint>,

    /// AMM pool for price oracle and liquidation swaps
    /// CHECK: Validated in handler based on pool_type
    pub pool: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + LendingVault::INIT_SPACE,
        seeds = [VAULT_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, LendingVault>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_BASE_ATA_SEED, vault.key().as_ref()],
        bump,
        token::mint = base_mint,
        token::authority = vault,
    )]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_QUOTE_ATA_SEED, vault.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = vault,
    )]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn handler(
    ctx: Context<InitializeVault>,
    nonce: u16,
    ltv_bps: u16,
    liquidation_threshold_bps: u16,
    loan_duration_seconds: u64,
    pool_type: PoolType,
) -> Result<()> {
    // Validate parameters
    require!(ltv_bps <= 10_000, ErrorCode::InvalidBasisPoints);
    require!(liquidation_threshold_bps <= 10_000, ErrorCode::InvalidLiquidationThreshold);
    require!(ltv_bps < liquidation_threshold_bps, ErrorCode::InvalidLtvConfiguration);
    require!(loan_duration_seconds > 0, ErrorCode::InvalidAmount);

    // Validate pool matches base/quote mints and get token order
    let is_pool_base_token_a = match pool_type {
        PoolType::CpAmm => {
            oracle::validate_cp_amm_pool_mints(
                &ctx.accounts.pool.to_account_info(),
                &ctx.accounts.base_mint.key(),
                &ctx.accounts.quote_mint.key(),
            )?
        }
        PoolType::Dlmm => {
            oracle::validate_dlmm_pool_mints(
                &ctx.accounts.pool.to_account_info(),
                &ctx.accounts.base_mint.key(),
                &ctx.accounts.quote_mint.key(),
            )?
        }
    };

    let clock = Clock::get()?;

    ctx.accounts.vault.set_inner(LendingVault {
        bump: ctx.bumps.vault,
        nonce,
        admin: ctx.accounts.admin.key(),
        base_mint: ctx.accounts.base_mint.key(),
        quote_mint: ctx.accounts.quote_mint.key(),
        base_decimals: ctx.accounts.base_mint.decimals,
        quote_decimals: ctx.accounts.quote_mint.decimals,
        base_vault: ctx.accounts.base_vault.key(),
        quote_vault: ctx.accounts.quote_vault.key(),
        pool: ctx.accounts.pool.key(),
        pool_type,
        is_pool_base_token_a,
        ltv_bps,
        liquidation_threshold_bps,
        loan_duration_seconds,
        total_base_liquidity: 0,
        total_base_borrowed: 0,
        total_quote_collateral: 0,
        open_positions: 0,
        created_at: clock.unix_timestamp,
    });

    emit!(VaultInitialized {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
        base_mint: ctx.accounts.base_mint.key(),
        quote_mint: ctx.accounts.quote_mint.key(),
        pool: ctx.accounts.pool.key(),
        ltv_bps,
        liquidation_threshold_bps,
        loan_duration_seconds,
    });

    Ok(())
}
