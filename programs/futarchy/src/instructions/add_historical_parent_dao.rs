use anchor_lang::prelude::*;

use crate::errors::FutarchyError;
use crate::state::moderator::*;
use crate::state::dao::*;
use crate::squads::SquadsMultisig;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct AddHistoricalParentDAO<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + DAOAccount::INIT_SPACE,
        seeds = [
            DAO_SEED,
            name.as_bytes()
        ],
        bump
    )]
    pub dao: Box<Account<'info, DAOAccount>>,

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
    pub moderator: Box<Account<'info, ModeratorAccount>>,

    /// CHECK: validated by squads program owner
    #[account(
        owner = SquadsMultisig::id() @ FutarchyError::InvalidMultisig
    )]
    pub treasury_multisig: UncheckedAccount<'info>,

    /// CHECK: validated by squads program owner
    #[account(
        owner = SquadsMultisig::id() @ FutarchyError::InvalidMultisig
    )]
    pub mint_auth_multisig: UncheckedAccount<'info>,

    /// CHECK: validated by token program owner
    #[account(
        owner = anchor_spl::token::ID @ FutarchyError::InvalidMint
    )]
    pub base_mint: UncheckedAccount<'info>,

    /// CHECK: validated by token program owner
    #[account(
        owner = anchor_spl::token::ID @ FutarchyError::InvalidMint
    )]
    pub quote_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_historical_parent_dao_handler(
    ctx: Context<AddHistoricalParentDAO>,
    name: String,
    cosigner: Pubkey,
    pool: Pubkey,
    pool_type: PoolType,
    proposal_id_counter: u16,
) -> Result<()> {
    require!(name.len() <= 32, FutarchyError::NameTooLong);

    let moderator = &mut ctx.accounts.moderator;
    moderator.set_inner(ModeratorAccount {
        version: 0, // Historical marker
        bump: ctx.bumps.moderator,
        name: name.clone(),
        quote_mint: ctx.accounts.quote_mint.key(),
        base_mint: ctx.accounts.base_mint.key(),
        proposal_id_counter,
        admin: ctx.accounts.admin.key(),
    });

    let dao_type = DAOType::Parent {
        moderator: moderator.key(),
        pool,
        pool_type,
    };

    let dao = &mut ctx.accounts.dao;
    dao.set_inner(DAOAccount {
        version: 0, // Historical marker
        bump: ctx.bumps.dao,
        name: name.clone(),
        admin: ctx.accounts.admin.key(),
        token_mint: ctx.accounts.base_mint.key(),
        cosigner,
        treasury_multisig: ctx.accounts.treasury_multisig.key(),
        mint_auth_multisig: ctx.accounts.mint_auth_multisig.key(),
        dao_type,
    });

    emit!(ModeratorInitialized {
        version: 0,
        name: name.clone(),
        moderator: moderator.key(),
        admin: moderator.admin,
        base_mint: moderator.base_mint,
        quote_mint: moderator.quote_mint,
    });

    emit!(DAOInitialized {
        version: 0,
        name,
        admin: ctx.accounts.admin.key(),
        treasury_multisig: ctx.accounts.treasury_multisig.key(),
        mint_multisig: ctx.accounts.mint_auth_multisig.key(),
        dao_type,
    });

    Ok(())
}
