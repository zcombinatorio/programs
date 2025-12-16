use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::{ModeratorAccount, ProposalAccount, ProposalState};
use crate::errors::FutarchyError;

#[derive(Accounts)]
pub struct AddHistoricalProposal<'info> {
    #[account(
        mut,
        address = moderator.admin
    )]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            MODERATOR_SEED,
            &moderator.id.to_le_bytes()
        ],
        bump = moderator.bump
    )]
    pub moderator: Box<Account<'info, ModeratorAccount>>,

    #[account(
        init,
        payer = signer,
        space = 8 + ProposalAccount::INIT_SPACE,
        seeds = [
            PROPOSAL_SEED,
            moderator.key().as_ref(),
            &[moderator.proposal_id_counter]
        ],
        bump
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    // Programs
    pub system_program: Program<'info, System>,
}

pub fn add_historical_proposal_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, AddHistoricalProposal<'info>>,
    num_options: u8,
    winning_idx: u8,
    length: u16,
) -> Result<()> { 
    require!(winning_idx < num_options, FutarchyError::InvalidWinningIndex);
    let moderator = &mut ctx.accounts.moderator;
    let proposal = &mut ctx.accounts.proposal;

    // Store state
    let proposal_id = moderator.proposal_id_counter;
    moderator.proposal_id_counter += 1;
    proposal.version = 0;
    proposal.id = proposal_id;
    proposal.moderator = moderator.key();
    proposal.base_mint = moderator.base_mint;
    proposal.quote_mint = moderator.quote_mint;
    proposal.creator = ctx.accounts.signer.key();
    proposal.length = length;
    proposal.bump = ctx.bumps.proposal;
    proposal.num_options = num_options;
    proposal.state = ProposalState::Resolved(winning_idx);

    // pools, vaults, amm configs are zeroed

    Ok(())
}
