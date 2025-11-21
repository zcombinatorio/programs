use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct AddOption<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &[vault.proposal_id],
            &[vault.vault_type as u8]
        ],
        bump = vault.bump,
        constraint = vault.owner == signer.key() @ VaultError::Unauthorized,
        constraint = vault.state == VaultState::Setup @ VaultError::InvalidState,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Regular mint
    #[account(address = vault.mint)]
    pub mint: Account<'info, Mint>,

    // Conditional mint
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[vault.num_options]],
        bump,
    )]
    pub cond_mint: Account<'info, Mint>,

    // Escrow ATA for conditional mint
    #[account(
        init,
        payer = signer,
        associated_token::mint = cond_mint,
        associated_token::authority = vault,
    )]
    pub vault_cond_token_acc: Account<'info, TokenAccount>,

    // Programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn add_option_handler(ctx: Context<AddOption>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    require!(
        vault.num_options < MAX_OPTIONS,
        VaultError::OptionLimitReached
    );

    vault.num_options += 1;

    msg!("Added Option {:?}", vault.num_options);

    Ok(())
}
