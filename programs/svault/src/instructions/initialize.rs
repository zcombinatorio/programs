use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::state::*;

#[event]
pub struct StakingVaultInitialized {
    pub config: Pubkey,
    pub admin: Pubkey,
    pub token_mint: Pubkey,
}

#[derive(Accounts)]
#[instruction(unstaking_period: u64, volume_window: u64)]
pub struct InitializeStakingVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + StakingConfig::INIT_SPACE,
        seeds = [
            STAKING_CONFIG_SEED,
            token_mint.key().as_ref(),
        ],
        bump,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        init,
        payer = admin,
        seeds = [STAKE_VAULT_SEED, config.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = config,
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        seeds = [REWARD_VAULT_SEED, config.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = config,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<InitializeStakingVault>,
    unstaking_period: u64,
    volume_window: u64,
) -> Result<()> {
    ctx.accounts.config.set_inner(StakingConfig {
        bump: ctx.bumps.config,
        admin: ctx.accounts.admin.key(),
        token_mint: ctx.accounts.token_mint.key(),
        unstaking_period,
        volume_window,
        reward_vault: ctx.accounts.reward_vault.key(),
        stake_vault: ctx.accounts.stake_vault.key(),
        total_staked: 0,
    });

    emit!(StakingVaultInitialized {
        config: ctx.accounts.config.key(),
        admin: ctx.accounts.admin.key(),
        token_mint: ctx.accounts.token_mint.key(),
    });

    Ok(())
}
