use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::*;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct RedeemWinnings<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // User

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &[vault.proposal_id],
            &[vault.vault_type as u8]
        ],
        bump = vault.bump,
        constraint = vault.state == VaultState::Finalized @ VaultError::InvalidState,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Regular Mint
    #[account(
        address = vault.mint
    )]
    mint: Account<'info, Mint>,

    // Escrow ATA for regular mint
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    // User ATA for regular mint
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    // Programs
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    // Conditional mints passed via remaining_accounts
    // Expected order for each option i:
    // - remaining_accounts[i * 2 + 0]: cond_mint_i
    // - remaining_accounts[i * 2 + 1]: user_cond_ata_i (must exist)
}

pub fn redeem_winnings_handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, RedeemWinnings<'info>>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;

    let num_options = vault.num_options as usize;

    // Validate we have the right number of remaining accounts
    require!(
        ctx.remaining_accounts.len() == num_options * 2,
        VaultError::InvalidNumberOfAccounts
    );

    // Extract winning option
    let (winning_idx, winning_bump) = vault
        .winning_option
        .ok_or(error!(VaultError::NoWinningOption))?;

    // Reconstruct the winning mint PDA
    let winning_mint_pubkey = Pubkey::create_program_address(
        &[
            CONDITIONAL_MINT_SEED,
            vault.key().as_ref(),
            &[winning_idx],
            &[winning_bump],
        ],
        ctx.program_id,
    )
    .unwrap(); // Safe because bump was validated during finalization

    let mut winning_amount = 0u64;
    let mut found_winning_mint = false;

    for i in 0..num_options {
        let cond_mint_info = &ctx.remaining_accounts[i * 2];
        let user_cond_ata_info = &ctx.remaining_accounts[i * 2 + 1];

        // Validate the conditional mint PDA
        let (expected_mint, _bump) = Pubkey::find_program_address(
            &[CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[i as u8]],
            ctx.program_id,
        );
        require!(
            cond_mint_info.key() == expected_mint,
            VaultError::InvalidConditionalMint
        );

        // Validate user's ATA
        let expected_user_ata =
            get_associated_token_address(&ctx.accounts.signer.key(), &cond_mint_info.key());
        require!(
            user_cond_ata_info.key() == expected_user_ata,
            VaultError::InvalidUserAta
        );

        // Skip if ATA doesn't exist or is empty
        if user_cond_ata_info.data_is_empty() {
            continue;
        }

        require!(
            user_cond_ata_info.owner == &ctx.accounts.token_program.key(),
            VaultError::InvalidAccountOwner
        );

        let user_cond_ata = Account::<TokenAccount>::try_from(user_cond_ata_info)?;
        let balance = user_cond_ata.amount;

        // Check if THIS is the winning mint by comparing pubkeys
        if cond_mint_info.key() == winning_mint_pubkey {
            winning_amount = balance;
            found_winning_mint = true;
        }

        // Burn all tokens and close user ATA
        if balance > 0 {
            burn_tokens(
                cond_mint_info.clone(),
                user_cond_ata_info.clone(),
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                balance,
            )?;
        }

        close_token_account(
            user_cond_ata_info.clone(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        )?;
    }

    // Ensure winning mint was in remaining_accounts
    require!(found_winning_mint, VaultError::WinningMintNotProvided);

    // Transfer collateral based on winning amount
    require!(winning_amount > 0, VaultError::NoWinningTokens);

    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        vault.owner.as_ref(),
        &[vault.proposal_id],
        &[vault.vault_type as u8],
        &[vault.bump],
    ];

    // 2. Transfer regular tokens: vault -> user
    transfer_signed(
        ctx.accounts.vault_ata.to_account_info(),
        ctx.accounts.user_ata.to_account_info(),
        vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        winning_amount,
        &[vault_seeds],
    )?;

    Ok(())
}
