use crate::state::*;
use anchor_lang::prelude::*;

#[event]
pub struct DelegateRemoved {
    pub config: Pubkey,
    pub staker: Pubkey,
    pub delegate: Pubkey,
}

#[derive(Accounts)]
pub struct RemoveDelegate<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

    #[account(
        seeds = [STAKING_CONFIG_SEED, config.token_mint.as_ref(), &config.nonce.to_le_bytes()],
        bump = config.bumps.config,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        mut,
        close = staker,
        seeds = [USER_STAKE_SEED, config.key().as_ref(), delegate.delegate.as_ref()],
        bump,
        constraint = delegate.staker == staker.key(),
    )]
    pub delegate: Account<'info, Delegate>,
}

pub fn remove_delegate_handler(ctx: Context<RemoveDelegate>) -> Result<()> {
    emit!(DelegateRemoved {
        config: ctx.accounts.config.key(),
        staker: ctx.accounts.staker.key(),
        delegate: ctx.accounts.delegate.delegate,
    });

    Ok(())
}
