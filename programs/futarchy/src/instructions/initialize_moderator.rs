use anchor_lang::prelude::*;

use crate::errors::FutarchyError;
use crate::state::moderator::{MODERATOR_SEED, MODERATOR_VERSION};
use crate::state::{ModeratorAccount, ModeratorInitialized};
use anchor_spl::token::Mint;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeModerator<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + ModeratorAccount::INIT_SPACE,
        seeds = [
            MODERATOR_SEED,
            name.as_bytes()
        ],
        bump
    )]
    pub moderator: Account<'info, ModeratorAccount>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_moderator_handler(
    ctx: Context<InitializeModerator>,
    name: String
) -> Result<()> {
    require!(name.len() <= 32, FutarchyError::NameTooLong);

    let moderator = &mut ctx.accounts.moderator;

    // Initialize moderator
    moderator.set_inner(ModeratorAccount {
        version: MODERATOR_VERSION,
        name: name.clone(),
        admin: ctx.accounts.admin.key(),
        quote_mint: ctx.accounts.quote_mint.key(),
        base_mint: ctx.accounts.base_mint.key(),
        proposal_id_counter: 0,
        bump: ctx.bumps.moderator,
    });

    emit!(ModeratorInitialized {
        version: MODERATOR_VERSION,
        name: name,
        moderator: moderator.key(),
        admin: moderator.admin,
        base_mint: moderator.base_mint,
        quote_mint: moderator.quote_mint
    });

    Ok(())
}
