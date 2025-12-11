use anchor_lang::prelude::*;

use crate::state::ModeratorAccount;
use anchor_spl::token::Mint;

#[event]
pub struct ModeratorInitialized {
    pub id: u8,
    pub moderator: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
}

#[derive(Accounts)]
#[instruction(id: u8)]
pub struct InitializeModerator<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + ModeratorAccount::INIT_SPACE,
        seeds = [
            b"moderator",
            base_mint.key().as_ref(),
            quote_mint.key().as_ref(),
            &[id]
        ],
        bump
    )]
    pub moderator: Account<'info, ModeratorAccount>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_moderator_handler(ctx: Context<InitializeModerator>, id: u8) -> Result<()> {
    let moderator = &mut ctx.accounts.moderator;

    moderator.id = id;
    moderator.base_mint = ctx.accounts.base_mint.key();
    moderator.quote_mint = ctx.accounts.quote_mint.key();
    moderator.proposal_id_counter = 0;
    moderator.bump = ctx.bumps.moderator;

    emit!(ModeratorInitialized {
        id,
        moderator: moderator.key(),
        base_mint: moderator.base_mint,
        quote_mint: moderator.quote_mint
    });

    Ok(())
}
