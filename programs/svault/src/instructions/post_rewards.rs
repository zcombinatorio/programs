use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::transfer_checked_ctx;

#[event]
pub struct RewardsPosted {
    pub config: Pubkey,
    pub merkle_root: [u8; 32],
    pub total_amount: u64,
}

#[derive(Accounts)]
pub struct PostRewards<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [STAKING_CONFIG_SEED, token_mint.key().as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        mut,
        seeds = [REWARD_VAULT_SEED, config.key().as_ref()],
        bump,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = admin,
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn post_rewards_handler(
    ctx: Context<PostRewards>,
    merkle_root: [u8; 32],
    total_amount: u64,
) -> Result<()> {
    require!(total_amount > 0, ErrorCode::InvalidAmount);

    // Transfer new rewards from admin to reward vault
    transfer_checked_ctx(
        ctx.accounts.admin_token_account.to_account_info(),
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.reward_vault.to_account_info(),
        ctx.accounts.admin.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        total_amount,
        ctx.accounts.token_mint.decimals,
    )?;

    // Update config with new merkle root
    let config = &mut ctx.accounts.config;
    config.current_merkle_root = merkle_root;
    config.last_updated_at = Clock::get()?.unix_timestamp;

    emit!(RewardsPosted {
        config: ctx.accounts.config.key(),
        merkle_root,
        total_amount,
    });

    Ok(())
}
