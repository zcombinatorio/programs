use anchor_lang::prelude::*;

use crate::state::LendingVault;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = LendingVault::LEN,
        seeds = [b"lending_vault"],
        bump
    )]
    pub vault: Account<'info, LendingVault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.bump = ctx.bumps.vault;
    Ok(())
}
