use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::transfer_checked;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct LiquidityAdded {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub amount: u64,
    pub total_liquidity: u64,
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin @ ErrorCode::Unauthorized,
        has_one = base_mint,
        has_one = base_vault,
    )]
    pub vault: Account<'info, LendingVault>,

    pub base_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,

    /// Admin's base token account to transfer from
    #[account(
        mut,
        token::mint = base_mint,
        token::authority = admin,
    )]
    pub admin_base_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn handler(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    // Transfer base tokens from admin to vault
    transfer_checked(
        &ctx.accounts.admin_base_ata.to_account_info(),
        &ctx.accounts.base_mint.to_account_info(),
        &ctx.accounts.base_vault.to_account_info(),
        &ctx.accounts.admin.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        amount,
        ctx.accounts.base_mint.decimals,
    )?;

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.total_base_liquidity = vault
        .total_base_liquidity
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;

    emit!(LiquidityAdded {
        vault: vault.key(),
        admin: ctx.accounts.admin.key(),
        amount,
        total_liquidity: vault.total_base_liquidity,
    });

    Ok(())
}
