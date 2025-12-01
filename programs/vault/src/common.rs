use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::state::*;

#[derive(Accounts)]
pub struct UserVaultAction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // User

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &[vault.nonce],
            &[vault.proposal_id],
            &[vault.vault_type as u8]
        ],
        bump = vault.bump,
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
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // Conditional mints passed via remaining_accounts
    // Expected order for each option i:
    // - remaining_accounts[i * 2 + 0]: cond_mint_i
    // - remaining_accounts[i * 2 + 1]: user_cond_ata_i (may need init)
}
