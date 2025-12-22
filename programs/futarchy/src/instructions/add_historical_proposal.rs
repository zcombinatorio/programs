use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::proposal::*;
use crate::state::moderator::*;
use crate::errors::FutarchyError;

#[derive(Accounts)]
pub struct AddHistoricalProposal<'info> {
    #[account(
        mut,
        address = moderator.admin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [
            MODERATOR_SEED,
            moderator.name.as_bytes()
        ],
        bump = moderator.bump
    )]
    pub moderator: Box<Account<'info, ModeratorAccount>>,

    #[account(
        init,
        payer = admin,
        space = 8 + ProposalAccount::INIT_SPACE,
        seeds = [
            PROPOSAL_SEED,
            moderator.key().as_ref(),
            &moderator.proposal_id_counter.to_le_bytes()
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
    created_at: i64,
) -> Result<u16> {
    // Validate num_options bounds
    require!(num_options >= MIN_OPTIONS, FutarchyError::NotEnoughOptions);
    require!(num_options <= MAX_OPTIONS, FutarchyError::TooManyOptions);
    require!(winning_idx < num_options, FutarchyError::InvalidWinningIndex);

    let moderator = &mut ctx.accounts.moderator;
    let proposal = &mut ctx.accounts.proposal;

    // Store state with checked counter increment
    let proposal_id = moderator.proposal_id_counter;
    moderator.proposal_id_counter = proposal_id
        .checked_add(1)
        .ok_or(FutarchyError::CounterOverflow)?;

    proposal.version = 0; // Historical proposals marked as version 0
    proposal.id = proposal_id;
    proposal.moderator = moderator.key();
    proposal.base_mint = moderator.base_mint;
    proposal.quote_mint = moderator.quote_mint;
    proposal.creator = ctx.accounts.admin.key();
    proposal.config.length = length;
    proposal.created_at = created_at;
    proposal.bump = ctx.bumps.proposal;
    proposal.num_options = num_options;
    proposal.state = ProposalState::Resolved(winning_idx);

    // pools, vaults, amm configs are zeroed

    Ok(proposal_id)
}
