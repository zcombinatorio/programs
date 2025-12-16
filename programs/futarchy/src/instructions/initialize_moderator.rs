use anchor_lang::prelude::*;

use crate::{MODERATOR_SEED, MODERATOR_VERSION};
use crate::constants::GLOBAL_CONFIG_SEED;
use crate::errors::FutarchyError;
use crate::state::{GlobalConfig, ModeratorAccount};
use anchor_spl::token::Mint;

#[event]
pub struct ModeratorInitialized {
    pub version: u8,
    pub id: u32,
    pub moderator: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub admin: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeModerator<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + ModeratorAccount::INIT_SPACE,
        seeds = [
            MODERATOR_SEED,
            &global_config.moderator_id_counter.to_le_bytes()
        ],
        bump
    )]
    pub moderator: Account<'info, ModeratorAccount>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_moderator_handler(ctx: Context<InitializeModerator>) -> Result<u32> {
    let global_config = &mut ctx.accounts.global_config;
    let moderator = &mut ctx.accounts.moderator;

    // Store current counter as this moderator's ID, then increment
    let id = global_config.moderator_id_counter;
    global_config.moderator_id_counter = id
        .checked_add(1)
        .ok_or(FutarchyError::CounterOverflow)?;

    // Initialize moderator
    moderator.set_inner(ModeratorAccount {
        version: MODERATOR_VERSION,
        id: id,
        admin: ctx.accounts.signer.key(),
        quote_mint: ctx.accounts.quote_mint.key(),
        base_mint: ctx.accounts.base_mint.key(),
        proposal_id_counter: 0,
        bump: ctx.bumps.moderator
    });

    emit!(ModeratorInitialized {
        version: MODERATOR_VERSION,
        id,
        moderator: moderator.key(),
        admin: moderator.admin,
        base_mint: moderator.base_mint,
        quote_mint: moderator.quote_mint
    });

    Ok(id)
}
