use anchor_lang::prelude::*;

use crate::errors::FutarchyError;
use crate::state::moderator::*;
use crate::state::dao::*;
use crate::squads::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeParentDAO<'info> {
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

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    // Squads
    /// CHECK: checked by squads CPI
    pub program_config: UncheckedAccount<'info>,
    /// CHECK: checked by squads CPI
    #[account(mut)]
    pub program_config_treasury: UncheckedAccount<'info>,
    /// CHECK: checked by squads CPI
    #[account(mut)]
    pub treasury_multisig: UncheckedAccount<'info>,
    /// CHECK: checked by squads CPI
    #[account(mut)]
    pub mint_multisig: UncheckedAccount<'info>,


    /// CHECK: checked by squads CPI
    pub squads_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_parent_dao_handler(
    ctx: Context<InitializeParentDAO>,
    name: String,
    treasury_cosigner: Pubkey,
    pool: Pubkey,
    pool_type: PoolType
) -> Result<()> {
    require!(name.len() <= 32, FutarchyError::NameTooLong);

    let dao = &mut ctx.accounts.dao;

    // Create treasury multisig
    SquadsMultisig::create_squads_multisig(
        ctx.accounts.program_config.to_account_info(),     // program_config
        ctx.accounts.program_config_treasury.to_account_info(),  // treasury
        ctx.accounts.treasury_multisig.to_account_info(),        // multisig (being created)
        dao.to_account_info(),                                 // create_key (PDA seed)
        ctx.accounts.admin.to_account_info(),                     // creator (payer)
        ctx.accounts.system_program.to_account_info(),     // system_program
        ctx.accounts.squads_program.to_account_info(),     // squads_program
        SquadsMultisig::treasury_multisig_create_args(
            treasury_cosigner,
            Some(ctx.accounts.treasury_multisig.key())
        ),
    )?;

    // Create mint multisig
    SquadsMultisig::create_squads_multisig(
        ctx.accounts.program_config.to_account_info(),     // program_config
        ctx.accounts.program_config_treasury.to_account_info(),  // treasury
        ctx.accounts.mint_multisig.to_account_info(),            // multisig (being created)
        dao.to_account_info(),                                 // create_key (PDA seed)
        ctx.accounts.admin.to_account_info(),                     // creator (payer)
        ctx.accounts.system_program.to_account_info(),     // system_program
        ctx.accounts.squads_program.to_account_info(),     // squads_program
        SquadsMultisig::mint_multisig_create_args(
            Some(ctx.accounts.mint_multisig.key())
        ),
    )?;

    // Initialize DAO & Moderator
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
    let dao_type = DAOType::Parent {
        moderator: moderator.key(),
        token_mint: moderator.base_mint,
        pool,
        pool_type
    };
    dao.set_inner(DAOAccount {
        version: DAO_VERSION,
        bump: ctx.bumps.dao,
        name: name.clone(),
        admin: ctx.accounts.admin.key(),
        cosigner: treasury_cosigner,
        treasury_multisig: ctx.accounts.treasury_multisig.key(),
        mint_auth_multisig: ctx.accounts.mint_multisig.key(),
        dao_type,
        white_list: vec![ctx.accounts.admin.key()]
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
