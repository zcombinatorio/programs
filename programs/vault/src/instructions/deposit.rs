use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;

use crate::common::UserVaultAction;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;
use crate::utils::*;

pub fn deposit_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, UserVaultAction<'info>>,
    expected_state: VaultState,
    amount: u64,
) -> Result<()> {
    let vault = &ctx.accounts.vault;

    let num_options = vault.num_options as usize;

    // Validate we have the right number of remaining accounts
    require!(
        ctx.remaining_accounts.len() == num_options * 2,
        VaultError::InvalidNumberOfAccounts
    );

    // Validate that amount is non-zero
    require!(amount > 0, VaultError::InvalidAmount);

    // 1. Transfer regular tokens: user -> vault
    transfer_tokens(
        ctx.accounts.user_ata.to_account_info(),
        ctx.accounts.vault_ata.to_account_info(),
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount,
    )?;

    // 2. For each conditional mint, mint tokens to user
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        vault.owner.as_ref(),
        &[vault.proposal_id],
        &[vault.vault_type as u8],
        &[vault.bump],
    ];

    for i in 0..num_options {
        let cond_mint_info = &ctx.remaining_accounts[i * 2];
        let user_cond_ata_info = &ctx.remaining_accounts[i * 2 + 1];

        // Validate the conditional mint PDA
        require!(
            cond_mint_info.key() == vault.cond_mints[i],
            VaultError::InvalidConditionalMint
        );

        let expected_user_ata =
            get_associated_token_address(&ctx.accounts.signer.key(), &cond_mint_info.key());
        require!(
            user_cond_ata_info.key() == expected_user_ata,
            VaultError::InvalidUserAta
        );

        // Create user's ATA if needed
        if user_cond_ata_info.data_is_empty() {
            create_associated_token_account(
                ctx.accounts.signer.to_account_info(),
                user_cond_ata_info.clone(),
                ctx.accounts.signer.to_account_info(),
                cond_mint_info.clone(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.associated_token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            )?;
        } else {
            // Validate it's owned by the Token program
            require!(
                user_cond_ata_info.owner == &ctx.accounts.token_program.key(),
                VaultError::InvalidAccountOwner
            );
        }

        // Mint conditional tokens directly to user's ATA
        mint_to_signed(
            cond_mint_info.clone(),
            user_cond_ata_info.clone(),
            vault.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            &[vault_seeds],
        )?;
    }

    Ok(())
}
