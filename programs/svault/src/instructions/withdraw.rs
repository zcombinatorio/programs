use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::transfer_checked_signed;

#[event]
pub struct Withdrawn {
    pub config: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [STAKING_CONFIG_SEED, token_mint.key().as_ref(), &config.nonce.to_le_bytes()],
        bump = config.bumps.config,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        mut,
        seeds = [USER_STAKE_SEED, config.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = user_stake.user == user.key(),
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [STAKE_VAULT_SEED, config.key().as_ref()],
        bump = config.bumps.stake_vault,
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw_handler(ctx: Context<Withdraw>) -> Result<()> {
    let user_stake = &ctx.accounts.user_stake;
    let config = &ctx.accounts.config;

    require!(user_stake.pending_unstake > 0, ErrorCode::NoPendingUnstake);

    // Check unstaking period has elapsed
    let now = Clock::get()?.unix_timestamp;
    let unstaking_period = (config.unstaking_period as i64)
        .checked_mul(86400) // 60 * 60 * 24 = seconds per day
        .ok_or(ErrorCode::Overflow)?;
    let unlock_time = user_stake
        .unstake_initiated_at
        .checked_add(unstaking_period)
        .ok_or(ErrorCode::Overflow)?;
    require!(now >= unlock_time, ErrorCode::UnstakingPeriodNotElapsed);

    let amount = user_stake.pending_unstake;

    // Transfer tokens from vault to user (PDA-signed by config)
    let token_mint_key = ctx.accounts.token_mint.key();
    let nonce_bytes = config.nonce.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        STAKING_CONFIG_SEED,
        token_mint_key.as_ref(),
        &nonce_bytes,
        &[config.bumps.config],
    ]];

    transfer_checked_signed(
        ctx.accounts.stake_vault.to_account_info(),
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount,
        ctx.accounts.token_mint.decimals,
        signer_seeds,
    )?;

    // Reset pending unstake state
    let user_stake = &mut ctx.accounts.user_stake;
    user_stake.pending_unstake = 0;
    user_stake.unstake_initiated_at = 0;

    emit!(Withdrawn {
        config: ctx.accounts.config.key(),
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}
