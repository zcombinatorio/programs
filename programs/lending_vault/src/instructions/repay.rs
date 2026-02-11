use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::{transfer_checked, transfer_checked_signed};

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PositionClosed {
    pub vault: Pubkey,
    pub position: Pubkey,
    pub user: Pubkey,
    pub collateral_returned: u64,
    pub base_repaid: u64,
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        has_one = base_mint,
        has_one = quote_mint,
        has_one = base_vault,
        has_one = quote_vault,
    )]
    pub vault: Account<'info, LendingVault>,

    #[account(
        mut,
        has_one = vault,
        has_one = user,
        constraint = position.is_active @ ErrorCode::PositionNotActive,
        seeds = [POSITION_SEED, vault.key().as_ref(), user.key().as_ref()],
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

    /// User's base token account (repayment source)
    #[account(
        mut,
        token::mint = base_mint,
        token::authority = user,
    )]
    pub user_base_ata: InterfaceAccount<'info, TokenAccount>,

    /// User's quote token account (collateral destination)
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = user,
    )]
    pub user_quote_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn handler(ctx: Context<Repay>) -> Result<()> {
    let position = &ctx.accounts.position;
    let vault = &ctx.accounts.vault;

    let borrowed_amount = position.borrowed_amount;
    let collateral_amount = position.collateral_amount;

    // Transfer repayment (base) from user to vault
    transfer_checked(
        &ctx.accounts.user_base_ata.to_account_info(),
        &ctx.accounts.base_mint.to_account_info(),
        &ctx.accounts.base_vault.to_account_info(),
        &ctx.accounts.user.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        borrowed_amount,
        ctx.accounts.base_mint.decimals,
    )?;

    // Build signer seeds for vault PDA
    let vault_seeds = &[
        VAULT_SEED,
        vault.base_mint.as_ref(),
        vault.quote_mint.as_ref(),
        &vault.nonce.to_le_bytes(),
        &[vault.bump],
    ];

    // Return collateral (quote) to user
    transfer_checked_signed(
        &ctx.accounts.quote_vault.to_account_info(),
        &ctx.accounts.quote_mint.to_account_info(),
        &ctx.accounts.user_quote_ata.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        collateral_amount,
        ctx.accounts.quote_mint.decimals,
        &[vault_seeds],
    )?;

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

    emit!(PositionClosed {
        vault: vault.key(),
        position: ctx.accounts.position.key(),
        user: ctx.accounts.user.key(),
        collateral_returned: collateral_amount,
        base_repaid: borrowed_amount,
    });

    // Position account is closed via `close = user` constraint

    Ok(())
}
