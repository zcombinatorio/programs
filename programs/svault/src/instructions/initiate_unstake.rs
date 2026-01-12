use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use crate::error::ErrorCode;
use crate::state::*;

#[event]
pub struct UnstakeInitiated {
    pub config: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_pending: u64,
}

#[derive(Accounts)]
pub struct InitiateUnstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [STAKING_CONFIG_SEED, token_mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        mut,
        seeds = [USER_STAKE_SEED, config.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = user_stake.user == user.key(),
    )]
    pub user_stake: Account<'info, UserStake>,
}

pub fn initiate_unstake_handler(ctx: Context<InitiateUnstake>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let user_stake = &mut ctx.accounts.user_stake;
    require!(user_stake.staked_amount >= amount, ErrorCode::InsufficientStake);

    // Subtract from staked amount
    user_stake.staked_amount = user_stake
        .staked_amount
        .checked_sub(amount)
        .ok_or(ErrorCode::Overflow)?;

    // Add to pending unstake (stacking allowed)
    user_stake.pending_unstake = user_stake
        .pending_unstake
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;

    // Reset unstake timer
    user_stake.unstake_initiated_at = Clock::get()?.unix_timestamp;

    // Update total staked in config
    ctx.accounts.config.total_staked = ctx
        .accounts
        .config
        .total_staked
        .checked_sub(amount)
        .ok_or(ErrorCode::Overflow)?;

    emit!(UnstakeInitiated {
        config: ctx.accounts.config.key(),
        user: ctx.accounts.user.key(),
        amount,
        total_pending: user_stake.pending_unstake,
    });

    Ok(())
}
