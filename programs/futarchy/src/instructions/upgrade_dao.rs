use anchor_lang::prelude::*;

use crate::errors::FutarchyError;
use crate::state::moderator::*;
use crate::state::dao::*;
use anchor_spl::token;

#[event]
pub struct DAOUpgraded {
    pub dao: Pubkey,
    pub parent_dao: Pubkey,
    pub dao_type: DAOType,
    pub token_mint: Pubkey
}

#[derive(Accounts)]
pub struct UpgradeDAO<'info> {
    #[account(
        mut,
        address = dao.admin @ FutarchyError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        address = parent_dao.admin @ FutarchyError::Unauthorized
    )]
    pub parent_admin: Signer<'info>,

    #[account(
        seeds = [
            DAO_SEED,
            dao.name.as_bytes()
        ],
        constraint = dao.is_child_of(parent_dao.key())  @ FutarchyError::InvalidDAO,
        bump = dao.bump
    )]
    pub dao: Box<Account<'info, DAOAccount>>,

    #[account(
        seeds = [
            DAO_SEED,
            parent_dao.name.as_bytes()
        ],
        constraint = parent_dao.is_parent(),
        bump = parent_dao.bump
    )]
    pub parent_dao: Box<Account<'info, DAOAccount>>,

    #[account(
        init,
        payer = admin,
        space = 8 + ModeratorAccount::INIT_SPACE,
        seeds = [
            MODERATOR_SEED,
            dao.name.as_bytes()
        ],
        bump
    )]
    pub moderator: Box<Account<'info, ModeratorAccount>>,

    /// CHECK: checked via owner
    #[account(
        owner = token::ID @ FutarchyError::InvalidMint
    )]
    pub base_mint: UncheckedAccount<'info>,
    /// CHECK: checked via owner
    #[account(
        owner = token::ID @ FutarchyError::InvalidMint
    )]
    pub quote_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn upgrade_dao_handler(
    ctx: Context<UpgradeDAO>,
    pool: Pubkey,
    pool_type: PoolType
) -> Result<()> {
    let dao = &mut ctx.accounts.dao;

    // Initialize DAO & Moderator
    let moderator = &mut ctx.accounts.moderator;
    moderator.set_inner(ModeratorAccount {
        version: MODERATOR_VERSION,
        bump: ctx.bumps.moderator.clone(),
        name: dao.name.clone(),
        quote_mint: ctx.accounts.quote_mint.key(),
        base_mint: ctx.accounts.base_mint.key(),
        proposal_id_counter: 0,
        admin: ctx.accounts.admin.key()
    });
    dao.token_mint = moderator.base_mint;
    dao.dao_type = DAOType::Parent {
        moderator: moderator.key(),
        pool,
        pool_type
    };

    emit!(DAOUpgraded {
        dao: dao.key(),
        parent_dao: ctx.accounts.parent_dao.key(),
        dao_type: dao.dao_type,
        token_mint: dao.token_mint,
    });

    Ok(())
}
