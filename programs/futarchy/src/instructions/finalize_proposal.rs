use amm::cpi::accounts::CeaseTrading;
use amm::program::Amm;
use amm::PoolAccount;
use anchor_lang::prelude::*;
use vault::cpi::accounts::FinalizeVault;
use vault::program::Vault;

use crate::constants::*;
use crate::errors::FutarchyError;
use crate::state::{ModeratorAccount, ProposalAccount, ProposalState};

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [
            MODERATOR_SEED,
            moderator.base_mint.as_ref(),
            moderator.quote_mint.as_ref(),
            &[moderator.id]
        ],
        bump = moderator.bump
    )]
    pub moderator: Box<Account<'info, ModeratorAccount>>,

    #[account(
        mut,
        seeds = [
            PROPOSAL_SEED,
            moderator.key().as_ref(),
            &[proposal.id]
        ],
        bump = proposal.bump,
        constraint = proposal.state == ProposalState::Pending @ FutarchyError::InvalidState,
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    /// CHECK: Validated via constraint and CPI
    #[account(
        mut,
        constraint = vault.key() == proposal.vault @ FutarchyError::InvalidVault
    )]
    pub vault: UncheckedAccount<'info>,

    pub vault_program: Program<'info, Vault>,
    pub amm_program: Program<'info, Amm>,

    // Remaining accounts (for N pools):
    // pools[0..N] - Pool accounts (mutable)
}

pub fn finalize_proposal_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, FinalizeProposal<'info>>,
) -> Result<()> {
    let proposal = &ctx.accounts.proposal;
    let num_options = proposal.num_options as usize;

    // Validate remaining accounts length
    require!(
        ctx.remaining_accounts.len() >= num_options,
        FutarchyError::InvalidRemainingAccounts
    );

    // Check that proposal time has elapsed
    let clock = Clock::get()?;
    let end_time = proposal.created_at + proposal.length as i64;
    require!(
        clock.unix_timestamp >= end_time,
        FutarchyError::ProposalNotExpired
    );

    // Get TWAP from each pool and find the winning index
    let mut twaps: Vec<u128> = Vec::with_capacity(num_options);

    for i in 0..num_options {
        // Validate pool matches proposal
        let pool_key = ctx.remaining_accounts[i].key();
        require!(
            pool_key == proposal.pools[i],
            FutarchyError::InvalidPools
        );

        // Deserialize pool account to read TWAP
        let pool_data = ctx.remaining_accounts[i].try_borrow_data()?;
        let pool = PoolAccount::try_deserialize(&mut &pool_data[..])?;

        let twap = pool.oracle.fetch_twap()?;
        twaps.push(twap);
    }

    // Find index with highest TWAP
    let winning_idx = twaps
        .iter()
        .enumerate()
        .max_by_key(|(_, &twap)| twap)
        .map(|(idx, _)| idx as u8)
        .unwrap_or(0);

    // Build proposal PDA signer seeds
    let moderator_key = ctx.accounts.moderator.key();
    let proposal_id = proposal.id;
    let proposal_bump = proposal.bump;
    let proposal_seeds = &[
        PROPOSAL_SEED,
        moderator_key.as_ref(),
        &[proposal_id],
        &[proposal_bump],
    ];
    let signer_seeds = &[&proposal_seeds[..]];

    // Cease trading on each pool (proposal PDA as admin)
    for i in 0..num_options {
        let cease_trading_ctx = CpiContext::new_with_signer(
            ctx.accounts.amm_program.to_account_info(),
            CeaseTrading {
                admin: ctx.accounts.proposal.to_account_info(),
                pool: ctx.remaining_accounts[i].to_account_info(),
            },
            signer_seeds,
        );
        amm::cpi::cease_trading(cease_trading_ctx)?;
    }

    // Finalize vault with winning index (proposal PDA as owner)
    let finalize_vault_ctx = CpiContext::new_with_signer(
        ctx.accounts.vault_program.to_account_info(),
        FinalizeVault {
            signer: ctx.accounts.proposal.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    vault::cpi::finalize(finalize_vault_ctx, winning_idx)?;

    // Update proposal state
    let proposal = &mut ctx.accounts.proposal;
    proposal.state = ProposalState::Resolved(winning_idx);

    Ok(())
}
