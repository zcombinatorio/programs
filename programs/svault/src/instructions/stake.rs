use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::transfer_checked_ctx;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[event]
pub struct Staked {
    pub config: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
}

#[derive(Accounts)]
pub struct Stake<'info> {
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
        init_if_needed,
        payer = user,
        space = 8 + UserStake::INIT_SPACE,
        seeds = [USER_STAKE_SEED, config.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        seeds = [STAKE_VAULT_SEED, config.key().as_ref()],
        bump,
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn stake_handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    // Initialize user_stake if this is a new account
    let user_stake = &mut ctx.accounts.user_stake;
    if user_stake.user == Pubkey::default() {
        user_stake.set_inner(UserStake {
            staking_config: ctx.accounts.config.key(),
            user: ctx.accounts.user.key(),
            staked_amount: 0,
            pending_unstake: 0,
            unstake_initiated_at: 0,
            total_claimed: 0,
        });
    }

    // Transfer tokens from user to stake vault
    transfer_checked_ctx(
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.stake_vault.to_account_info(),
        ctx.accounts.user.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount,
        ctx.accounts.token_mint.decimals,
    )?;

    // Update user stake
    user_stake.staked_amount = user_stake
        .staked_amount
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;

    // Update total staked in config
    ctx.accounts.config.total_staked = ctx
        .accounts
        .config
        .total_staked
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;

    emit!(Staked {
        config: ctx.accounts.config.key(),
        user: ctx.accounts.user.key(),
        amount,
        total_staked: user_stake.staked_amount,
    });

    Ok(())
}
