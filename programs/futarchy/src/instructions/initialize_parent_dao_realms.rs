use anchor_lang::prelude::*;

use crate::constants::SPL_GOVERNANCE_PROGRAM_ID;
use crate::errors::FutarchyError;
use crate::state::moderator::*;
use crate::state::dao::*;
use anchor_spl::token;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeParentDAORealms<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub parent_admin: Signer<'info>,

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

    /// CHECK: validated by owner constraint — must be an SPL Governance account
    #[account(
        owner = SPL_GOVERNANCE_PROGRAM_ID @ FutarchyError::InvalidGovernanceAccount
    )]
    pub treasury_multisig: UncheckedAccount<'info>,
    /// CHECK: validated by owner constraint — must be an SPL Governance account
    #[account(
        owner = SPL_GOVERNANCE_PROGRAM_ID @ FutarchyError::InvalidGovernanceAccount
    )]
    pub mint_multisig: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_parent_dao_realms_handler(
    ctx: Context<InitializeParentDAORealms>,
    name: String,
    treasury_cosigner: Pubkey,
    pool: Pubkey,
    pool_type: PoolType
) -> Result<()> {
    require!(name.len() <= 32, FutarchyError::NameTooLong);

    // Initialize Moderator
    let moderator = &mut ctx.accounts.moderator;
    moderator.set_inner(ModeratorAccount {
        version: MODERATOR_VERSION,
        bump: ctx.bumps.moderator.clone(),
        name: name.clone(),
        quote_mint: ctx.accounts.quote_mint.key(),
        base_mint: ctx.accounts.base_mint.key(),
        proposal_id_counter: 0,
        admin: ctx.accounts.admin.key()
    });

    // Initialize DAO
    let dao_type = DAOType::Parent {
        moderator: moderator.key(),
        pool,
        pool_type
    };
    let dao = &mut ctx.accounts.dao;
    dao.set_inner(DAOAccount {
        version: DAO_VERSION,
        bump: ctx.bumps.dao,
        name: name.clone(),
        admin: ctx.accounts.admin.key(),
        token_mint: moderator.base_mint,
        cosigner: treasury_cosigner,
        treasury_multisig: ctx.accounts.treasury_multisig.key(),
        mint_auth_multisig: ctx.accounts.mint_multisig.key(),
        dao_type
    });

    emit!(ModeratorInitialized {
        version: MODERATOR_VERSION,
        name: name.clone(),
        moderator: moderator.key(),
        admin: moderator.admin,
        base_mint: moderator.base_mint,
        quote_mint: moderator.quote_mint
    });

    emit!(DAOInitialized {
        version: DAO_VERSION,
        name: name,
        admin: ctx.accounts.admin.key(),
        treasury_multisig: ctx.accounts.treasury_multisig.key(),
        mint_multisig: ctx.accounts.mint_multisig.key(),
        dao_type: dao_type,
    });

    Ok(())
}
