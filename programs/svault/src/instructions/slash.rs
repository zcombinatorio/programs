use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::transfer_checked_signed;

// Fee wallet authority (same as AMM)
pub const FEE_AUTHORITY: Pubkey = pubkey!("FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC");

#[event]
pub struct Slashed {
    pub config: Pubkey,
    pub user: Pubkey,
    pub staked_slash: u64,
    pub pending_slash: u64,
    pub basis_points: u16,
}

#[derive(Accounts)]
pub struct Slash<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        has_one = admin,
        seeds = [STAKING_CONFIG_SEED, token_mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        mut,
        seeds = [USER_STAKE_SEED, config.key().as_ref(), user_stake.user.as_ref()],
        bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [STAKE_VAULT_SEED, config.key().as_ref()],
        bump,
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    /// Fee vault - owned by FEE_AUTHORITY
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = FEE_AUTHORITY,
    )]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn slash_handler(ctx: Context<Slash>, basis_points: u16) -> Result<()> {
    require!(basis_points <= 10000, ErrorCode::InvalidBasisPoints);

    let user_stake = &mut ctx.accounts.user_stake;

    // Calculate slash amounts
    let staked_slash = (user_stake.staked_amount as u128)
        .checked_mul(basis_points as u128)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::Overflow)? as u64;

    let pending_slash = (user_stake.pending_unstake as u128)
        .checked_mul(basis_points as u128)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::Overflow)? as u64;

    let total_slash = staked_slash
        .checked_add(pending_slash)
        .ok_or(ErrorCode::Overflow)?;

    // Update user balances
    user_stake.staked_amount = user_stake
        .staked_amount
        .checked_sub(staked_slash)
        .ok_or(ErrorCode::Overflow)?;

    user_stake.pending_unstake = user_stake
        .pending_unstake
        .checked_sub(pending_slash)
        .ok_or(ErrorCode::Overflow)?;

    // Update total staked in config (only staked_slash, not pending)
    let config = &ctx.accounts.config;

    // Transfer slashed tokens from vault to fee vault
    let token_mint_key = ctx.accounts.token_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        STAKING_CONFIG_SEED,
        token_mint_key.as_ref(),
        &[config.bump],
    ]];

    transfer_checked_signed(
        ctx.accounts.stake_vault.to_account_info(),
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.fee_vault.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        total_slash,
        ctx.accounts.token_mint.decimals,
        signer_seeds,
    )?;

    emit!(Slashed {
        config: ctx.accounts.config.key(),
        user: user_stake.user,
        staked_slash,
        pending_slash,
        basis_points,
    });

    Ok(())
}
