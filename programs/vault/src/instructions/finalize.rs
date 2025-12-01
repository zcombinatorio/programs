use anchor_lang::prelude::*;

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
}

pub fn finalize_vault_handler(ctx: Context<FinalizeVault>, winning_idx: u8) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(
        winning_idx < vault.num_options,
        VaultError::IndexOutOfBounds
    );

    // Finalize state
    vault.state = VaultState::Finalized;
    vault.winning_idx = Some(winning_idx);

    msg!("Vault finalized");
    msg!("Winning idx {:?}", winning_idx);
    msg!("Winning mint {:?}", vault.cond_mints[winning_idx as usize]);

    Ok(())
}
