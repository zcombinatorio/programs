use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("4oiXvA71BdpWsdcmjMysn57W3FzB9uqbujtq7Vpzt7ag");

const MAX_OPTIONS: u8 = 4;

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub enum VaultType {
    Base,  // 0
    Quote, // 1
}

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum VaultState {
    // Awaiting activation
    Setup,
    // Deposits / Withdrawals allowed
    Active,
    // Deposits / Withdrawals revoked
    // Redeem Winnings allowed 
    Finalized,
}

#[derive(InitSpace)]
#[account]
pub struct VaultAccount {
    pub owner: Pubkey, // Vault creator
    pub mint: Pubkey,  // Regular mint
    pub proposal_id: u8,
    pub vault_type: VaultType,
    pub state: VaultState,

    // Number of markets
    // (2 <= n <= MAX_OPTIONS)
    pub num_options: u8,

    // Set after finalization
    pub winning_cond_mint: Option<Pubkey>,
    pub bump: u8,
}

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
            b"vault",
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
    pub vault_cond_token_acc_0: Account<'info, TokenAccount>,

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
    pub vault_cond_token_acc_1: Account<'info, TokenAccount>,

    // Programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct AddOption<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            b"vault",
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
    #[account(
        address = vault.mint
    )]
    pub mint: Account<'info, Mint>,

    // Conditional mint
    #[account(
        init,
        payer = signer,
        mint::decimals = mint.decimals,
        mint::authority = vault,
        seeds = [b"cmint", vault.key().as_ref(), &[vault.num_options]],
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

#[derive(Accounts)]
pub struct ActivateVault<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"vault",
            vault.owner.as_ref(),
            &[vault.proposal_id],
            &[vault.vault_type as u8]
        ],
        bump = vault.bump,
        constraint = vault.owner == signer.key() @ VaultError::Unauthorized,
        constraint = vault.state == VaultState::Setup @ VaultError::InvalidState,
    )]
    pub vault: Account<'info, VaultAccount>,
}

#[error_code]
pub enum VaultError {
    #[msg("Vault already exists")]
    VaultAlreadyExists,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Minimum 2 options required")]
    NotEnoughOptions,
    #[msg("Option limit reached")]
    OptionLimitReached,
    #[msg("Unauthorized")]
    Unauthorized
}

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        vault_type: VaultType,
        proposal_id: u8,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        vault.owner = ctx.accounts.signer.key();
        vault.mint = ctx.accounts.mint.key();
        vault.proposal_id = proposal_id;
        vault.vault_type = vault_type;
        vault.num_options = 2; // First 2 options generated atomically

        // First 2 options 
        vault.state = VaultState::Setup;
        vault.winning_cond_mint = None; // New: No winner yet
        vault.bump = ctx.bumps.vault;

        msg!("Vault initialized!");
        msg!("Owner: {:?}", vault.owner);
        msg!("State: Setup");

        Ok(())
    }

    pub fn add_option(ctx: Context<AddOption>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(
            vault.num_options < MAX_OPTIONS,
            VaultError::OptionLimitReached
        );
        vault.num_options += 1;

        msg!("Added Option {:?}", vault.num_options);

        Ok(())
    }

    pub fn activate_vault(ctx: Context<ActivateVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(
            vault.num_options >= 2,
            VaultError::NotEnoughOptions
        );
        vault.state = VaultState::Active; // Open the vault

        msg!("Vault Activated {:?}", vault.num_options);

        Ok(())
    }
}
