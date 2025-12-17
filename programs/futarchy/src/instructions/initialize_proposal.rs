use amm::cpi::accounts::CreatePool;
use anchor_lang::prelude::*;
use vault::VAULT_VERSION;
use vault::cpi::accounts::InitializeVault;

use crate::constants::*;
use crate::errors::FutarchyError;
use crate::state::{ModeratorAccount, ProposalAccount, ProposalState, TWAPConfig};
use amm::program::Amm;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use vault::program::Vault;

#[event]
pub struct ProposalInitialized {
    pub version: u8,
    pub proposal_id: u16,
    pub proposal: Pubkey,
    pub moderator: Pubkey,
    pub length: u16,
    pub creator: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeProposal<'info> {
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
            &moderator.proposal_id_counter.to_le_bytes()
        ],
        bump
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    // Programs
    pub system_program: Program<'info, System>,
    pub vault_program: Program<'info, Vault>,
    pub amm_program: Program<'info, Amm>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    // Remaining accounts (in order):
    // 0: base_mint
    // 1: quote_mint
    // 2: vault
    // 3: base_token_acc
    // 4: quote_token_acc
    // 5: cond_base_mint_0
    // 6: cond_base_mint_1
    // 7: cond_quote_mint_0
    // 8: cond_quote_mint_1
    // 9: pool_0
    // 10: reserve_a_0
    // 11: reserve_b_0
    // 12: fee_authority
    // 13: fee_vault_0
    // 14: pool_1
    // 15: reserve_a_1
    // 16: reserve_b_1
    // 17: fee_vault_1
}

pub fn initialize_proposal_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, InitializeProposal<'info>>,
    length: u16,
    fee: u16, // AMM Fee
    twap_config: TWAPConfig,
) -> Result<u16> {
    require!(
        ctx.remaining_accounts.len() >= 18,
        FutarchyError::InvalidRemainingAccounts
    );

    // Validate mints match moderator
    let moderator = &mut ctx.accounts.moderator;
    require!(
        ctx.remaining_accounts[0].key() == moderator.base_mint,
        FutarchyError::InvalidMint
    );
    require!(
        ctx.remaining_accounts[1].key() == moderator.quote_mint,
        FutarchyError::InvalidMint
    );

    let proposal = &mut ctx.accounts.proposal;

    // Store state with checked counter increment
    let proposal_id = moderator.proposal_id_counter;
    moderator.proposal_id_counter = proposal_id
        .checked_add(1)
        .ok_or(FutarchyError::CounterOverflow)?;
    proposal.version = PROPOSAL_VERSION;
    proposal.id = proposal_id;
    proposal.creator = ctx.accounts.signer.key();
    proposal.moderator = moderator.key();
    proposal.base_mint = moderator.base_mint;
    proposal.quote_mint = moderator.quote_mint;
    proposal.length = length;
    proposal.bump = ctx.bumps.proposal;
    proposal.fee = fee;
    proposal.twap_config = twap_config;
    proposal.num_options = 2;
    proposal.state = ProposalState::Setup;
    proposal.pools[0] = ctx.remaining_accounts[9].key();
    proposal.pools[1] = ctx.remaining_accounts[14].key();
    // pools[2..] already default/zeroed
    proposal.vault = ctx.remaining_accounts[2].key();

    // Build proposal PDA signer seeds
    let proposal_seeds = &[
        PROPOSAL_SEED,
        proposal.moderator.as_ref(),
        &proposal_id.to_le_bytes(),
        &[ctx.bumps.proposal],
    ];
    let signer_seeds = &[&proposal_seeds[..]];

    // Initialize Vault with proposal PDA as owner, signer as payer
    let init_vault_ctx = CpiContext::new_with_signer(
        ctx.accounts.vault_program.to_account_info(),
        InitializeVault {
            payer: ctx.accounts.signer.to_account_info(),
            owner: proposal.to_account_info(),
            base_mint: ctx.remaining_accounts[0].to_account_info(),
            quote_mint: ctx.remaining_accounts[1].to_account_info(),
            vault: ctx.remaining_accounts[2].to_account_info(),
            base_token_acc: ctx.remaining_accounts[3].to_account_info(),
            quote_token_acc: ctx.remaining_accounts[4].to_account_info(),
            cond_base_mint_0: ctx.remaining_accounts[5].to_account_info(),
            cond_quote_mint_0: ctx.remaining_accounts[7].to_account_info(),
            cond_base_mint_1: ctx.remaining_accounts[6].to_account_info(),
            cond_quote_mint_1: ctx.remaining_accounts[8].to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        },
        signer_seeds,
    );

    vault::cpi::initialize(init_vault_ctx, proposal_id)?;

    // Create pool 0
    let create_pool_0_ctx = CpiContext::new(
        ctx.accounts.amm_program.to_account_info(),
        CreatePool {
            payer: ctx.accounts.signer.to_account_info(),
            admin: proposal.to_account_info(),
            mint_a: ctx.remaining_accounts[7].to_account_info(), // cond_quote_mint_0
            mint_b: ctx.remaining_accounts[5].to_account_info(), // cond_base_mint_0
            pool: ctx.remaining_accounts[9].to_account_info(),   // pool_0
            reserve_a: ctx.remaining_accounts[10].to_account_info(), // reserve_a_0
            reserve_b: ctx.remaining_accounts[11].to_account_info(), // reserve_b_0
            fee_authority: ctx.remaining_accounts[12].to_account_info(), // fee_authority
            fee_vault: ctx.remaining_accounts[13].to_account_info(), // fee_vault_0
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    );

    amm::cpi::create_pool(
        create_pool_0_ctx,
        fee,
        twap_config.starting_observation,
        twap_config.max_observation_delta,
        twap_config.warmup_duration,
        Some(ctx.accounts.signer.key())
    )?;

    // Create pool 1
    let create_pool_1_ctx = CpiContext::new(
        ctx.accounts.amm_program.to_account_info(),
        CreatePool {
            payer: ctx.accounts.signer.to_account_info(),
            admin: proposal.to_account_info(),
            mint_a: ctx.remaining_accounts[8].to_account_info(), // cond_quote_mint_1
            mint_b: ctx.remaining_accounts[6].to_account_info(), // cond_base_mint_1
            pool: ctx.remaining_accounts[14].to_account_info(),  // pool_1
            reserve_a: ctx.remaining_accounts[15].to_account_info(), // reserve_a_1
            reserve_b: ctx.remaining_accounts[16].to_account_info(), // reserve_b_1
            fee_authority: ctx.remaining_accounts[12].to_account_info(), // fee_authority
            fee_vault: ctx.remaining_accounts[17].to_account_info(), // fee_vault_1
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    );

    amm::cpi::create_pool(
        create_pool_1_ctx,
        fee,
        twap_config.starting_observation,
        twap_config.max_observation_delta,
        twap_config.warmup_duration,
        Some(ctx.accounts.signer.key())
    )?;

    emit!(ProposalInitialized {
        version: VAULT_VERSION,
        proposal_id,
        proposal: proposal.key(),
        moderator: moderator.key(),
        creator: proposal.creator,
        length
    });

    Ok(proposal_id)
}
