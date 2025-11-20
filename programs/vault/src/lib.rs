use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, Mint, TokenAccount};

declare_id!("4oiXvA71BdpWsdcmjMysn57W3FzB9uqbujtq7Vpzt7ag");

#[derive(
    Copy, 
    Clone, 
    InitSpace, 
    AnchorSerialize, 
    AnchorDeserialize
)]
pub enum VaultType {
    Base,  // 0
    Quote, // 1
}

#[derive(
    Copy, 
    Clone, 
    InitSpace, 
    AnchorSerialize, 
    AnchorDeserialize
)]
pub enum VaultStatus {
    Pending,
    Finalized,
}

#[derive(InitSpace)]
#[account]
pub struct VaultAccount {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub proposal_id: u8,
    pub vault_type: VaultType,
    pub status: VaultStatus,
    pub winning_cond_mint: Option<Pubkey>,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(vault_type: VaultType, proposal_id: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + VaultAccount::INIT_SPACE,
        seeds = [
            b"vault",
            signer.key().as_ref(),
            &[proposal_id],
            &[vault_type as u8]
        ],
        bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Conditional mint 0
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [b"cmint", vault.key().as_ref(), &[0]],
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
    pub vault_cond_token_0: Account<'info, TokenAccount>,

    // Conditional mint 1
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [b"cmint", vault.key().as_ref(), &[1]],
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
    pub vault_cond_token_1: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[error_code]
pub enum VaultError {
    #[msg("Vault already exists")]
    VaultAlreadyExists,
    #[msg("Invalid amount")]
    InvalidAmount,
}

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        vault_type: VaultType, 
        proposal_id: u8
    ) -> Result<()> {
        require_gte!(proposal_id, 0);

        let vault = &mut ctx.accounts.vault;

        vault.owner = ctx.accounts.signer.key();
        vault.mint = ctx.accounts.mint.key();
        vault.proposal_id = proposal_id;
        vault.vault_type = vault_type;
        vault.status = VaultStatus::Pending;  // New: Start as Pending
        vault.winning_cond_mint = None;       // New: No winner yet
        vault.bump = ctx.bumps.vault;
  
        msg!("Vault initialized!");
        msg!("Owner: {:?}", vault.owner);
        msg!("Status: Pending");

        Ok(())
    }
}
