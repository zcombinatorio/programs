use amm::cpi::accounts::AddLiquidity;
use anchor_lang::prelude::*;
use vault::cpi::accounts::{ActivateVault, UserVaultAction};

use crate::constants::*;
use crate::errors::FutarchyError;
use crate::state::{ProposalAccount, ProposalState};
use amm::program::Amm;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use vault::program::Vault;
use vault::VaultType;

#[event]
pub struct ProposalLaunched {
    pub proposal_id: u16,
    pub proposal: Pubkey,
    pub num_options: u8,
    pub base_amount: u64,
    pub quote_amount: u64,
    pub created_at: i64,
}

#[derive(Accounts)]
pub struct LaunchProposal<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            PROPOSAL_SEED,
            proposal.moderator.as_ref(),
            &proposal.id.to_le_bytes()
        ],
        bump = proposal.bump,
        constraint = proposal.state == ProposalState::Setup @ FutarchyError::InvalidState,
        constraint = proposal.creator == signer.key() @ FutarchyError::Unauthorized,
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    /// CHECK: Validated via CPI to vault program
    #[account(
        mut,
        constraint = vault.key() == proposal.vault @ FutarchyError::InvalidVault
    )]
    pub vault: UncheckedAccount<'info>,

    // Programs
    pub system_program: Program<'info, System>,
    pub vault_program: Program<'info, Vault>,
    pub amm_program: Program<'info, Amm>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    // Remaining accounts (for N options):
    // 0: base_mint
    // 1: quote_mint
    // 2: vault_base_ata
    // 3: vault_quote_ata
    // 4: user_base_ata
    // 5: user_quote_ata
    // 6..6+N: cond_base_mints[0..N]
    // 6+N..6+2N: cond_quote_mints[0..N]
    // 6+2N..6+3N: user_cond_base_atas[0..N]
    // 6+3N..6+4N: user_cond_quote_atas[0..N]
    // 6+4N..6+5N: pools[0..N]
    // 6+5N..6+6N: reserves_a[0..N]
    // 6+6N..6+7N: reserves_b[0..N]
}

pub fn launch_proposal_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, LaunchProposal<'info>>,
    base_amount: u64,
    quote_amount: u64,
) -> Result<()> {
    let num_options = ctx.accounts.proposal.num_options as usize;

    // Validate remaining accounts length: 6 fixed + 7*N variable
    let expected_remaining = 6 + 7 * num_options;
    require!(
        ctx.remaining_accounts.len() >= expected_remaining,
        FutarchyError::InvalidRemainingAccounts
    );

    // Validate vault matches proposal
    require!(
        ctx.remaining_accounts[0].key() == ctx.accounts.proposal.base_mint, // base_mint
        FutarchyError::InvalidMint
    );
    require!(
        ctx.remaining_accounts[1].key() == ctx.accounts.proposal.quote_mint, // quote_mint
        FutarchyError::InvalidMint
    );

    // Build proposal PDA signer seeds
    let proposal_id = ctx.accounts.proposal.id;
    let proposal_bump = ctx.accounts.proposal.bump;
    let id_bytes = proposal_id.to_le_bytes();
    let proposal_seeds = &[
        PROPOSAL_SEED,
        ctx.accounts.proposal.moderator.as_ref(),
        &id_bytes[..],
        &[proposal_bump],
    ];
    let signer_seeds = &[&proposal_seeds[..]];

    // 1. Activate vault via CPI (proposal PDA as signer)
    let activate_ctx = CpiContext::new_with_signer(
        ctx.accounts.vault_program.to_account_info(),
        ActivateVault {
            payer: ctx.accounts.signer.to_account_info(),
            owner: ctx.accounts.proposal.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    vault::cpi::activate(activate_ctx)?;

    // 2. Deposit base tokens (splits into N conditional base tokens)
    // Build remaining_accounts for deposit: cond_base_mints + user_cond_base_atas (interleaved)
    let mut base_deposit_remaining: Vec<AccountInfo<'info>> = Vec::with_capacity(num_options * 2);
    for i in 0..num_options {
        base_deposit_remaining.push(ctx.remaining_accounts[6 + i].to_account_info()); // cond_base_mint[i]
        base_deposit_remaining.push(ctx.remaining_accounts[6 + 2 * num_options + i].to_account_info()); // user_cond_base_ata[i]
    }

    let deposit_base_ctx = CpiContext::new(
        ctx.accounts.vault_program.to_account_info(),
        UserVaultAction {
            signer: ctx.accounts.signer.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
            mint: ctx.remaining_accounts[0].to_account_info(), // base_mint
            vault_ata: ctx.remaining_accounts[2].to_account_info(), // vault_base_ata
            user_ata: ctx.remaining_accounts[4].to_account_info(), // user_base_ata
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    )
    .with_remaining_accounts(base_deposit_remaining);

    vault::cpi::deposit(deposit_base_ctx, VaultType::Base, base_amount)?;

    // 3. Deposit quote tokens (splits into N conditional quote tokens)
    // Build remaining_accounts for deposit: cond_quote_mints + user_cond_quote_atas (interleaved)
    let mut quote_deposit_remaining: Vec<AccountInfo<'info>> = Vec::with_capacity(num_options * 2);
    for i in 0..num_options {
        quote_deposit_remaining.push(ctx.remaining_accounts[6 + num_options + i].to_account_info()); // cond_quote_mint[i]
        quote_deposit_remaining.push(ctx.remaining_accounts[6 + 3 * num_options + i].to_account_info()); // user_cond_quote_ata[i]
    }

    let deposit_quote_ctx = CpiContext::new(
        ctx.accounts.vault_program.to_account_info(),
        UserVaultAction {
            signer: ctx.accounts.signer.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
            mint: ctx.remaining_accounts[1].to_account_info(), // quote_mint
            vault_ata: ctx.remaining_accounts[3].to_account_info(), // vault_quote_ata
            user_ata: ctx.remaining_accounts[5].to_account_info(), // user_quote_ata
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    )
    .with_remaining_accounts(quote_deposit_remaining);

    vault::cpi::deposit(deposit_quote_ctx, VaultType::Quote, quote_amount)?;

    // 4. For each pool: add_liquidity with conditional tokens
    // Pool mint_a = cond_quote, mint_b = cond_base (see initialize_proposal.rs)
    for i in 0..num_options {
        // Validate pool matches proposal
        let pool_key = ctx.remaining_accounts[6 + 4 * num_options + i].key();
        require!(
            pool_key == ctx.accounts.proposal.pools[i],
            FutarchyError::InvalidPools
        );

        let add_liq_ctx = CpiContext::new(
            ctx.accounts.amm_program.to_account_info(),
            AddLiquidity {
                depositor: ctx.accounts.signer.to_account_info(),
                pool: ctx.remaining_accounts[6 + 4 * num_options + i].to_account_info(), // pool[i]
                reserve_a: ctx.remaining_accounts[6 + 5 * num_options + i].to_account_info(), // reserve_a[i]
                reserve_b: ctx.remaining_accounts[6 + 6 * num_options + i].to_account_info(), // reserve_b[i]
                depositor_token_acc_a: ctx.remaining_accounts[6 + 3 * num_options + i].to_account_info(), // user_cond_quote_ata[i] (mint_a = cond_quote)
                depositor_token_acc_b: ctx.remaining_accounts[6 + 2 * num_options + i].to_account_info(), // user_cond_base_ata[i] (mint_b = cond_base)
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        );

        amm::cpi::add_liquidity(add_liq_ctx, quote_amount, base_amount)?;
    }

    // 5. Set proposal state to Pending
    let proposal = &mut ctx.accounts.proposal;
    proposal.state = ProposalState::Pending;
    proposal.created_at = Clock::get()?.unix_timestamp;

    emit!(ProposalLaunched {
        proposal_id: proposal.id,
        proposal: proposal.key(),
        num_options: proposal.num_options,
        base_amount,
        quote_amount,
        created_at: proposal.created_at,
    });

    Ok(())
}
