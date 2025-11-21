use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(winning_idx: u8)]
pub struct FinalizeVault<'info> {
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
        constraint = vault.state == VaultState::Active @ VaultError::InvalidState,
    )]
    pub vault: Account<'info, VaultAccount>,

    // Conditional mint corresponding to the winning index
    #[account(
        seeds = [CONDITIONAL_MINT_SEED, vault.key().as_ref(), &[winning_idx]],
        bump,
    )]
    pub winning_mint: Account<'info, Mint>,
}

pub fn finalize_vault_handler(ctx: Context<FinalizeVault>, winning_idx: u8) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(
        winning_idx < vault.num_options,
        VaultError::IndexOutOfBounds
    );

    // Finalize state
    vault.state = VaultState::Finalized;
    vault.winning_option = Some((winning_idx, ctx.bumps.winning_mint));

    msg!("Vault finalized");
    msg!("Winning idx {:?}", winning_idx);
    msg!("Winning mint {:?}", ctx.accounts.winning_mint.key());

    Ok(())
}
