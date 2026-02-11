use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::state::*;
use crate::oracle::{self, PRICE_SCALE};
use crate::utils::{transfer_checked, transfer_checked_signed};

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PositionOpened {
    pub vault: Pubkey,
    pub position: Pubkey,
    pub user: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub base_price: u64,
    pub opened_at: i64,
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

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
        init,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, vault.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub base_mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,

    /// User's quote token account (collateral source)
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = user,
    )]
    pub user_quote_ata: InterfaceAccount<'info, TokenAccount>,

    /// User's base token account (borrow destination)
    #[account(
        mut,
        token::mint = base_mint,
        token::authority = user,
    )]
    pub user_base_ata: InterfaceAccount<'info, TokenAccount>,

    /// Pool for price oracle (CP-AMM or DLMM)
    /// CHECK: Validated against vault.pool
    pub pool: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn handler(
    ctx: Context<OpenPosition>,
    collateral_amount: u64,
    borrow_amount: u64,
) -> Result<()> {
    require!(collateral_amount > 0, ErrorCode::InvalidAmount);
    require!(borrow_amount > 0, ErrorCode::InvalidAmount);

    let vault = &ctx.accounts.vault;

    // Check sufficient liquidity
    let available = vault
        .total_base_liquidity
        .checked_sub(vault.total_base_borrowed)
        .ok_or(ErrorCode::Overflow)?;
    require!(borrow_amount <= available, ErrorCode::InsufficientLiquidity);

    // Get price from pool (quote lamports per base lamport, scaled by PRICE_SCALE)
    let base_price = match vault.pool_type {
        PoolType::CpAmm => oracle::get_cp_amm_price(
            &ctx.accounts.pool.to_account_info(),
            vault.base_decimals,
            vault.quote_decimals,
            vault.is_pool_base_token_a,
        )?,
        PoolType::Dlmm => oracle::get_dlmm_price(
            &ctx.accounts.pool.to_account_info(),
            vault.base_decimals,
            vault.quote_decimals,
            vault.is_pool_base_token_a,
        )?,
    };

    // Check LTV
    require!(
        Position::is_within_ltv(collateral_amount, borrow_amount, vault.ltv_bps, base_price, PRICE_SCALE),
        ErrorCode::LtvExceeded
    );

    // Transfer collateral from user to vault
    transfer_checked(
        &ctx.accounts.user_quote_ata.to_account_info(),
        &ctx.accounts.quote_mint.to_account_info(),
        &ctx.accounts.quote_vault.to_account_info(),
        &ctx.accounts.user.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        collateral_amount,
        ctx.accounts.quote_mint.decimals,
    )?;

    // Build signer seeds for vault PDA
    let vault_seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &vault.nonce.to_le_bytes(),
        &[vault.bump],
    ];

    // Transfer borrowed base from vault to user
    transfer_checked_signed(
        &ctx.accounts.base_vault.to_account_info(),
        &ctx.accounts.base_mint.to_account_info(),
        &ctx.accounts.user_base_ata.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        borrow_amount,
        ctx.accounts.base_mint.decimals,
        &[vault_seeds],
    )?;

    let clock = Clock::get()?;

    // Initialize position
    ctx.accounts.position.set_inner(Position {
        bump: ctx.bumps.position,
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        collateral_amount,
        borrowed_amount: borrow_amount,
        opened_at: clock.unix_timestamp,
        is_active: true,
    });

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.total_base_borrowed = vault
        .total_base_borrowed
        .checked_add(borrow_amount)
        .ok_or(ErrorCode::Overflow)?;
    vault.total_quote_collateral = vault
        .total_quote_collateral
        .checked_add(collateral_amount)
        .ok_or(ErrorCode::Overflow)?;
    vault.open_positions = vault
        .open_positions
        .checked_add(1)
        .ok_or(ErrorCode::Overflow)?;

    emit!(PositionOpened {
        vault: vault.key(),
        position: ctx.accounts.position.key(),
        user: ctx.accounts.user.key(),
        collateral_amount,
        borrowed_amount: borrow_amount,
        base_price,
        opened_at: clock.unix_timestamp,
    });

    Ok(())
}
