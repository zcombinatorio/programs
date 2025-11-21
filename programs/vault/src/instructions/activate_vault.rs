use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct ActivateVault<'info> {
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
}

pub fn activate_vault_handler(ctx: Context<ActivateVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    require!(
        vault.num_options >= MIN_OPTIONS,
        VaultError::NotEnoughOptions
    );

    vault.state = VaultState::Active;

    msg!("Vault Activated with {:?} options", vault.num_options);

    Ok(())
}
