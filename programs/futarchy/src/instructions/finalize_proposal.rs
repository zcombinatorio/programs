use amm::cpi::accounts::{CeaseTrading, CrankTwap};
use amm::program::Amm;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::get_return_data;
use vault::cpi::accounts::FinalizeVault;
use vault::program::Vault;

use crate::state::proposal::*;
use crate::errors::FutarchyError;
use crate::state::{ProposalAccount, ProposalState};

#[event]
pub struct ProposalFinalized {
    pub proposal_id: u16,
    pub proposal: Pubkey,
    pub winning_idx: u8,
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    // Permissionless
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            PROPOSAL_SEED,
            proposal.moderator.as_ref(),
            &proposal.id.to_le_bytes()
        ],
        has_one = vault @ FutarchyError::InvalidVault,
        bump = proposal.bump,
        constraint = proposal.state == ProposalState::Pending @ FutarchyError::InvalidState,
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    /// CHECK: Validated via constraint and CPI
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    pub vault_program: Program<'info, Vault>,
    pub amm_program: Program<'info, Amm>,

    // Remaining accounts (for N pools, 3 accounts per pool):
    // For each pool i:
    //   - pool[i * 3]      - Pool account (mutable)
    //   - reserve_a[i * 3 + 1] - Reserve A token account
    //   - reserve_b[i * 3 + 2] - Reserve B token account
}

pub fn finalize_proposal_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, FinalizeProposal<'info>>,
) -> Result<()> {
    let proposal = &ctx.accounts.proposal;
    let num_options = proposal.num_options as usize;

    // Validate remaining accounts length (3 accounts per pool: pool, reserve_a, reserve_b)
    require!(
        ctx.remaining_accounts.len() == num_options * 3,
        FutarchyError::InvalidRemainingAccounts
    );

    // Check that proposal time has elapsed
    let clock = Clock::get()?;
    let end_time = proposal.created_at + proposal.config.length as i64;
    require!(
        clock.unix_timestamp >= end_time,
        FutarchyError::ProposalNotExpired
    );

    // Crank TWAP and collect values from each pool
    let mut twaps: Vec<u128> = Vec::with_capacity(num_options);

    for i in 0..num_options {
        let pool_idx = i * 3;

        // Validate pool matches proposal
        let pool_key = ctx.remaining_accounts[pool_idx].key();
        require!(
            pool_key == proposal.pools[i],
            FutarchyError::InvalidPools
        );

        // Crank TWAP to ensure fresh data
        let crank_twap_ctx = CpiContext::new(
            ctx.accounts.amm_program.to_account_info(),
            CrankTwap {
                pool: ctx.remaining_accounts[pool_idx].to_account_info(),
                reserve_a: ctx.remaining_accounts[pool_idx + 1].to_account_info(),
                reserve_b: ctx.remaining_accounts[pool_idx + 2].to_account_info(),
            },
        );
        amm::cpi::crank_twap(crank_twap_ctx)?;

        // Get TWAP from CPI return data
        let (_, data) = get_return_data().ok_or(FutarchyError::TwapNotReady)?;
        let twap: u128 = AnchorDeserialize::deserialize(&mut &data[..])
            .map_err(|_| FutarchyError::TwapNotReady)?;
        twaps.push(twap);
    }

    // Find index with highest TWAP
    let max_twap_idx = twaps
        .iter()
        .enumerate()
        .max_by_key(|(_, &twap)| twap)
        .map(|(idx, _)| idx as u8)
        .unwrap_or(0);

    // Decide winning index based on market bias (in bips)
    // To win, max_twap * 10000 must be > twaps[0] * (10000 + market_bias)
    let basis_points: u128 = 10000;
    let threshold = twaps[0]
        .checked_mul(basis_points + proposal.config.market_bias as u128)
        .ok_or(FutarchyError::MathOverflow)?;
    let max_twap_scaled = twaps[max_twap_idx as usize]
        .checked_mul(basis_points)
        .ok_or(FutarchyError::MathOverflow)?;
    let winning_idx = if max_twap_scaled > threshold { max_twap_idx } else { 0 };

    // Build proposal PDA signer seeds
    let moderator_key = proposal.moderator;
    let proposal_id = proposal.id;
    let proposal_bump = proposal.bump;
    let proposal_seeds = &[
        PROPOSAL_SEED,
        moderator_key.as_ref(),
        &proposal_id.to_le_bytes(),
        &[proposal_bump],
    ];
    let signer_seeds = &[&proposal_seeds[..]];

    // Cease trading on each pool (proposal PDA as admin)
    for i in 0..num_options {
        let pool_idx = i * 3;
        let cease_trading_ctx = CpiContext::new_with_signer(
            ctx.accounts.amm_program.to_account_info(),
            CeaseTrading {
                admin: ctx.accounts.proposal.to_account_info(),
                pool: ctx.remaining_accounts[pool_idx].to_account_info(),
            },
            signer_seeds,
        );
        amm::cpi::cease_trading(cease_trading_ctx)?;
    }

    // Finalize vault with winning index (proposal PDA as owner)
    let finalize_vault_ctx = CpiContext::new_with_signer(
        ctx.accounts.vault_program.to_account_info(),
        FinalizeVault {
            payer: ctx.accounts.signer.to_account_info(),
            owner: ctx.accounts.proposal.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    vault::cpi::finalize(finalize_vault_ctx, winning_idx)?;

    // Update proposal state
    let proposal = &mut ctx.accounts.proposal;
    proposal.state = ProposalState::Resolved(winning_idx);

    emit!(ProposalFinalized {
        proposal_id: proposal.id,
        proposal: proposal.key(),
        winning_idx,
    });

    Ok(())
}
