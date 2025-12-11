use amm::cpi::accounts::CreatePool;
use anchor_lang::prelude::*;
use vault::cpi::accounts::AddOption as AddVaultOption;

use crate::constants::*;
use crate::errors::FutarchyError;
use crate::state::{ModeratorAccount, ProposalAccount, ProposalState};
use amm::program::Amm;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use vault::program::Vault;

#[derive(Accounts)]
pub struct AddOption<'info> {
    #[account(
        mut,
        address = proposal.creator @ FutarchyError::Unauthorized
    )]
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
        constraint = proposal.state == ProposalState::Setup @ FutarchyError::InvalidState,
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    // Programs
    pub system_program: Program<'info, System>,
    pub vault_program: Program<'info, Vault>,
    pub amm_program: Program<'info, Amm>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    // Remaining accounts (in order):
    // 0: vault
    // 1: base_mint
    // 2: quote_mint
    // 3: cond_base_mint
    // 4: cond_quote_mint
    // 5: pool
    // 6: reserve_a
    // 7: reserve_b
    // 8: fee_authority
    // 9: fee_vault
}

pub fn add_option<'info>(
    ctx: Context<'_, '_, 'info, 'info, AddOption<'info>>
) -> Result<()> {
    require!(
        ctx.remaining_accounts.len() >= 10,
        FutarchyError::InvalidRemainingAccounts
    );

    // Validate mints match moderator
    let moderator = &ctx.accounts.moderator;
    require!(
        ctx.remaining_accounts[1].key() == moderator.base_mint,
        FutarchyError::InvalidMint
    );
    require!(
        ctx.remaining_accounts[2].key() == moderator.quote_mint,
        FutarchyError::InvalidMint
    );

    let proposal = &mut ctx.accounts.proposal;
    let curr_options = proposal.num_options;

    require!(
        curr_options < MAX_OPTIONS,
        FutarchyError::TooManyOptions
    );

    // Update state
    proposal.pools[curr_options as usize] = ctx.remaining_accounts[5].key(); // pool
    proposal.num_options += 1;

    // Build proposal PDA signer seeds
    let moderator_key = ctx.accounts.moderator.key();
    let proposal_seeds = &[
        PROPOSAL_SEED,
        moderator_key.as_ref(),
        &[proposal.id],
        &[proposal.bump],
    ];
    let signer_seeds = &[&proposal_seeds[..]];

    // Add Option CPI with proposal PDA as signer
    let add_option_ctx = CpiContext::new_with_signer(
        ctx.accounts.vault_program.to_account_info(),
        AddVaultOption {
            signer: proposal.to_account_info(),
            base_mint: ctx.remaining_accounts[1].to_account_info(),
            quote_mint: ctx.remaining_accounts[2].to_account_info(),
            vault: ctx.remaining_accounts[0].to_account_info(),
            cond_base_mint: ctx.remaining_accounts[3].to_account_info(),
            cond_quote_mint: ctx.remaining_accounts[4].to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        },
        signer_seeds,
    );

    vault::cpi::add_option(add_option_ctx)?;

    // Create pool
    let create_pool_ctx = CpiContext::new(
        ctx.accounts.amm_program.to_account_info(),
        CreatePool {
            signer: ctx.accounts.signer.to_account_info(),
            mint_a: ctx.remaining_accounts[4].to_account_info(), // cond_quote_mint
            mint_b: ctx.remaining_accounts[3].to_account_info(), // cond_base_mint
            pool: ctx.remaining_accounts[5].to_account_info(),   // pool
            reserve_a: ctx.remaining_accounts[6].to_account_info(), // reserve_a
            reserve_b: ctx.remaining_accounts[7].to_account_info(), // reserve_b
            fee_authority: ctx.remaining_accounts[8].to_account_info(), // fee_authority
            fee_vault: ctx.remaining_accounts[9].to_account_info(), // fee_vault
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    );

    amm::cpi::create_pool(
        create_pool_ctx,
        proposal.fee,
        proposal.twap_config.starting_observation,
        proposal.twap_config.max_observation_delta,
        proposal.twap_config.warmup_duration,
        Some(ctx.accounts.signer.key())
    )?;

    Ok(())
}
