use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[event]
pub struct VaultFinalizedWithLock {
    pub vault: Pubkey,
    pub winning_idx: u8,
    pub claims_available_at: i64,
    pub winning_base_mint: Pubkey,
    pub winning_quote_mint: Pubkey,
}

#[derive(Accounts)]
#[instruction(winning_idx: u8)]
pub struct FinalizeVaultWithLock<'info> {
    /// Payer for account rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Owner of the vault — needs to sign
    #[account(address = vault.owner @ VaultError::Unauthorized)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.owner.as_ref(),
            &vault.nonce.to_le_bytes(),
        ],
        bump = vault.bump,
        constraint = vault.state == VaultState::Active @ VaultError::InvalidState,
    )]
    pub vault: Box<Account<'info, VaultAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + ClaimLockAccount::INIT_SPACE,
        seeds = [CLAIM_LOCK_SEED, vault.key().as_ref()],
        bump
    )]
    pub claim_lock: Box<Account<'info, ClaimLockAccount>>,

    pub system_program: Program<'info, System>,
}

pub fn finalize_vault_with_lock_handler(
    ctx: Context<FinalizeVaultWithLock>,
    winning_idx: u8,
    claim_lock_seconds: u32,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(
        winning_idx < vault.num_options,
        VaultError::IndexOutOfBounds
    );

    let clock = Clock::get()?;
    let claims_available_at = clock
        .unix_timestamp
        .checked_add(claim_lock_seconds as i64)
        .ok_or(VaultError::MathOverflow)?;

    let claim_lock = &mut ctx.accounts.claim_lock;
    claim_lock.vault = vault.key();
    claim_lock.claims_available_at = claims_available_at;
    claim_lock.bump = ctx.bumps.claim_lock;

    // Finalize state
    vault.state = VaultState::Finalized(winning_idx);

    emit!(VaultFinalizedWithLock {
        vault: vault.key(),
        winning_idx,
        claims_available_at,
        winning_base_mint: vault.cond_base_mints[winning_idx as usize],
        winning_quote_mint: vault.cond_quote_mints[winning_idx as usize],
    });

    Ok(())
}
