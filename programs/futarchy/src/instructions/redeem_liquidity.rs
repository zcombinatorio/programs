use amm::cpi::accounts::RemoveLiquidity;
use amm::program::Amm;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};
use vault::cpi::accounts::UserVaultAction;
use vault::program::Vault;
use vault::VaultType;

use crate::constants::*;
use crate::errors::FutarchyError;
use crate::state::{ProposalAccount, ProposalState};

#[event]
pub struct LiquidityRedeemed {
    pub proposal_id: u8,
    pub proposal: Pubkey,
    pub redeemer: Pubkey,
    pub winning_idx: u8,
}

#[derive(Accounts)]
pub struct RedeemLiquidity<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [
            PROPOSAL_SEED,
            proposal.moderator.as_ref(),
            &[proposal.id]
        ],
        bump = proposal.bump,
        constraint = proposal.creator == signer.key() @ FutarchyError::Unauthorized,
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    /// CHECK: Validated via constraint and CPI
    #[account(
        mut,
        constraint = vault.key() == proposal.vault @ FutarchyError::InvalidVault
    )]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: Winning pool - validated in handler against proposal.pools[winning_idx]
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    pub vault_program: Program<'info, Vault>,
    pub amm_program: Program<'info, Amm>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    // Remaining accounts layout (for N options):
    // remove_liquidity (4 accounts):
    //   0: reserve_a (pool's cond_quote reserve)
    //   1: reserve_b (pool's cond_base reserve)
    //   2: signer_cond_quote_ata
    //   3: signer_cond_base_ata
    //
    // redeem_winnings base (3 + 2N accounts):
    //   4: base_mint
    //   5: vault_base_ata
    //   6: user_base_ata
    //   7..7+2N: [cond_base_mint_i, user_cond_base_ata_i] for i in 0..N
    //
    // redeem_winnings quote (3 + 2N accounts):
    //   7+2N: quote_mint
    //   7+2N+1: vault_quote_ata
    //   7+2N+2: user_quote_ata
    //   7+2N+3..7+4N+3: [cond_quote_mint_i, user_cond_quote_ata_i] for i in 0..N
}

pub fn redeem_liquidity_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, RedeemLiquidity<'info>>,
) -> Result<()> {
    let proposal = &ctx.accounts.proposal;
    let num_options = proposal.num_options as usize;

    // Extract winning_idx from proposal state
    let winning_idx = if let ProposalState::Resolved(idx) = proposal.state {
        idx
    } else {
        return err!(FutarchyError::InvalidState);
    };

    // Validate pool matches winning pool
    require!(
        ctx.accounts.pool.key() == proposal.pools[winning_idx as usize],
        FutarchyError::InvalidPools
    );

    // Validate remaining accounts length: 4 + 3 + 2N + 3 + 2N = 10 + 4N
    let expected_remaining = 10 + 4 * num_options;
    require!(
        ctx.remaining_accounts.len() >= expected_remaining,
        FutarchyError::InvalidRemainingAccounts
    );

    // Read reserve amounts to determine how much to withdraw
    let reserve_a_data = ctx.remaining_accounts[0].try_borrow_data()?;
    let reserve_a = TokenAccount::try_deserialize(&mut &reserve_a_data[..])?;
    let amount_a = reserve_a.amount;
    drop(reserve_a_data);

    let reserve_b_data = ctx.remaining_accounts[1].try_borrow_data()?;
    let reserve_b = TokenAccount::try_deserialize(&mut &reserve_b_data[..])?;
    let amount_b = reserve_b.amount;
    drop(reserve_b_data);

    // 1. CPI to amm::remove_liquidity
    let remove_liq_ctx = CpiContext::new(
        ctx.accounts.amm_program.to_account_info(),
        RemoveLiquidity {
            depositor: ctx.accounts.signer.to_account_info(),
            pool: ctx.accounts.pool.to_account_info(),
            reserve_a: ctx.remaining_accounts[0].to_account_info(),
            reserve_b: ctx.remaining_accounts[1].to_account_info(),
            depositor_token_acc_a: ctx.remaining_accounts[2].to_account_info(),
            depositor_token_acc_b: ctx.remaining_accounts[3].to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    );
    amm::cpi::remove_liquidity(remove_liq_ctx, amount_a, amount_b)?;

    // Build remaining accounts for redeem_winnings base
    // Indices: 7..7+2N
    let base_remaining_start = 7;
    let base_remaining_end = 7 + 2 * num_options;
    let base_remaining: Vec<AccountInfo<'info>> = ctx.remaining_accounts
        [base_remaining_start..base_remaining_end]
        .iter()
        .map(|a| a.to_account_info())
        .collect();

    // 2. CPI to vault::redeem_winnings for base tokens
    let redeem_base_ctx = CpiContext::new(
        ctx.accounts.vault_program.to_account_info(),
        UserVaultAction {
            signer: ctx.accounts.signer.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
            mint: ctx.remaining_accounts[4].to_account_info(),     // base_mint
            vault_ata: ctx.remaining_accounts[5].to_account_info(), // vault_base_ata
            user_ata: ctx.remaining_accounts[6].to_account_info(),  // user_base_ata
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    )
    .with_remaining_accounts(base_remaining);

    vault::cpi::redeem_winnings(redeem_base_ctx, VaultType::Base)?;

    // Build remaining accounts for redeem_winnings quote
    // Indices: 7+2N+3..7+4N+3
    let quote_remaining_start = 7 + 2 * num_options + 3;
    let quote_remaining_end = 7 + 4 * num_options + 3;
    let quote_remaining: Vec<AccountInfo<'info>> = ctx.remaining_accounts
        [quote_remaining_start..quote_remaining_end]
        .iter()
        .map(|a| a.to_account_info())
        .collect();

    // 3. CPI to vault::redeem_winnings for quote tokens
    let quote_fixed_start = 7 + 2 * num_options;
    let redeem_quote_ctx = CpiContext::new(
        ctx.accounts.vault_program.to_account_info(),
        UserVaultAction {
            signer: ctx.accounts.signer.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
            mint: ctx.remaining_accounts[quote_fixed_start].to_account_info(),     // quote_mint
            vault_ata: ctx.remaining_accounts[quote_fixed_start + 1].to_account_info(), // vault_quote_ata
            user_ata: ctx.remaining_accounts[quote_fixed_start + 2].to_account_info(),  // user_quote_ata
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    )
    .with_remaining_accounts(quote_remaining);

    vault::cpi::redeem_winnings(redeem_quote_ctx, VaultType::Quote)?;

    emit!(LiquidityRedeemed {
        proposal_id: proposal.id,
        proposal: proposal.key(),
        redeemer: ctx.accounts.signer.key(),
        winning_idx,
    });

    Ok(())
}
