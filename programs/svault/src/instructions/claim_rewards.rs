use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_program::hash::hashv;
use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::transfer_checked_signed;

#[event]
pub struct RewardsClaimed {
    pub config: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
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

    #[account(
        mut,
        seeds = [REWARD_VAULT_SEED, config.key().as_ref()],
        bump,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn claim_rewards_handler(
    ctx: Context<ClaimRewards>,
    cumulative_amount: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let user_stake = &ctx.accounts.user_stake;

    // Verify merkle proof
    let leaf = hashv(&[
        ctx.accounts.user.key().as_ref(),
        &cumulative_amount.to_le_bytes(),
    ]);
    require!(
        verify_proof(&proof, config.current_merkle_root, leaf.to_bytes()),
        ErrorCode::InvalidMerkleProof
    );

    // Calculate claimable amount
    let claimable = cumulative_amount
        .checked_sub(user_stake.total_claimed)
        .ok_or(ErrorCode::Overflow)?;
    require!(claimable > 0, ErrorCode::NothingToClaim);

    // Transfer rewards from vault to user (PDA-signed via config)
    let token_mint_key = ctx.accounts.token_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        STAKING_CONFIG_SEED,
        token_mint_key.as_ref(),
        &[config.bump],
    ]];

    transfer_checked_signed(
        ctx.accounts.reward_vault.to_account_info(),
        ctx.accounts.token_mint.to_account_info(),
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        claimable,
        ctx.accounts.token_mint.decimals,
        signer_seeds,
    )?;

    // Update total claimed
    let user_stake = &mut ctx.accounts.user_stake;
    user_stake.total_claimed = cumulative_amount;

    emit!(RewardsClaimed {
        config: ctx.accounts.config.key(),
        user: ctx.accounts.user.key(),
        amount: claimable,
        total_claimed: cumulative_amount,
    });

    Ok(())
}

fn verify_proof(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.iter() {
        computed_hash = if computed_hash <= *proof_element {
            hashv(&[&computed_hash, proof_element]).to_bytes()
        } else {
            hashv(&[proof_element, &computed_hash]).to_bytes()
        };
    }
    computed_hash == root
}
