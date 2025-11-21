use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(vault_type: VaultType, proposal_id: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // Regular mint
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + VaultAccount::INIT_SPACE,
        seeds = [
            VAULT_SEED,
            signer.key().as_ref(),
            &[proposal_id],
            &[vault_type as u8]
        ],
        bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Create initial 2 conditional mints & vault ATAs
    // Conditional mint 0
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[0]],
        bump,
    )]
    pub cond_mint_0: Account<'info, Mint>,

    // Escrow ATA for conditional mint 0
    #[account(
        init,
        payer = signer,
        associated_token::mint = cond_mint_0,
        associated_token::authority = vault,
    )]
    pub vault_cond_token_acc_0: Account<'info, TokenAccount>,

    // Conditional mint 1
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[1]],
        bump,
    )]
    pub cond_mint_1: Account<'info, Mint>,

    // Escrow ATA for conditional mint 1
    #[account(
        init,
        payer = signer,
        associated_token::mint = cond_mint_1,
        associated_token::authority = vault,
    )]
    pub vault_cond_token_acc_1: Account<'info, TokenAccount>,

    // Programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    vault_type: VaultType,
    proposal_id: u8,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.owner = ctx.accounts.signer.key();
    vault.mint = ctx.accounts.mint.key();
    vault.proposal_id = proposal_id;
    vault.vault_type = vault_type;
    vault.num_options = MIN_OPTIONS; // First 2 options generated atomically
    vault.state = VaultState::Setup;
    vault.winning_cond_mint = None;
    vault.bump = ctx.bumps.vault;

    msg!("Vault initialized!");
    msg!("Owner: {:?}", vault.owner);
    msg!("State: Setup");

    Ok(())
}
