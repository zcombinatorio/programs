use anchor_lang::prelude::*;

use crate::errors::FutarchyError;
use crate::state::moderator::*;
use crate::state::dao::*;

#[event]
pub struct AdminTransferred {
    pub dao: Pubkey,
    pub moderator: Pubkey,
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        address = dao.admin @ FutarchyError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [
            DAO_SEED,
            dao.name.as_bytes()
        ],
        bump = dao.bump
    )]
    pub dao: Box<Account<'info, DAOAccount>>,

    #[account(
        mut,
        seeds = [
            MODERATOR_SEED,
            moderator.name.as_bytes()
        ],
        constraint = dao.name == moderator.name @ FutarchyError::InvalidDAO,
        bump = moderator.bump
    )]
    pub moderator: Box<Account<'info, ModeratorAccount>>,
}

pub fn transfer_admin_handler(
    ctx: Context<TransferAdmin>,
    new_admin: Pubkey,
) -> Result<()> {
    let old_admin = ctx.accounts.dao.admin;

    // Update admin on both accounts
    ctx.accounts.dao.admin = new_admin;
    ctx.accounts.moderator.admin = new_admin;

    emit!(AdminTransferred {
        dao: ctx.accounts.dao.key(),
        moderator: ctx.accounts.moderator.key(),
        old_admin,
        new_admin,
    });

    Ok(())
}
