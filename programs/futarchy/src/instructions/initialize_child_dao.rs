use anchor_lang::prelude::*;
use anchor_spl::token_interface;

use crate::errors::FutarchyError;
use crate::state::dao::*;
use crate::squads::*;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeChildDAO<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        address = parent_dao.admin @ FutarchyError::Unauthorized
    )]
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
        seeds = [
            DAO_SEED,
            parent_dao.name.as_bytes()
        ],
        constraint = parent_dao.is_parent(),
        bump = parent_dao.bump
    )]
    pub parent_dao: Box<Account<'info, DAOAccount>>,

    /// CHECK: checked via owner
    #[account(
        owner = token_interface::ID @ FutarchyError::InvalidMint
    )]
    pub token_mint: UncheckedAccount<'info>,

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
    /// CHECK: PDA used as create_key for mint_multisig, validated by seeds
    #[account(
        seeds = [
            dao.key().as_ref(), 
            MINT_CREATE_KEY_SEED, 
            name.as_bytes()
        ],
        bump
    )]
    pub mint_create_key: UncheckedAccount<'info>,

    /// CHECK: checked by squads CPI
    pub squads_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_child_dao_handler(
    ctx: Context<InitializeChildDAO>,
    name: String,
    treasury_cosigner: Pubkey,
) -> Result<()> {
    require!(name.len() <= 32, FutarchyError::NameTooLong);

    let dao = &mut ctx.accounts.dao;

    // Signer seeds for dao PDA (used as create_key for treasury multisig)
    let dao_seeds: &[&[u8]] = &[DAO_SEED, name.as_bytes(), &[ctx.bumps.dao]];

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
        dao_seeds,
    )?;

    // Signer seeds for mint_create_key PDA (used as create_key for mint multisig)
    let dao_key = dao.key();
    let mint_create_key_seeds: &[&[u8]] = &[
        dao_key.as_ref(),
        MINT_CREATE_KEY_SEED,
        name.as_bytes(),
        &[ctx.bumps.mint_create_key],
    ];

    // Create mint multisig (uses mint_create_key PDA to differentiate from treasury multisig)
    SquadsMultisig::create_squads_multisig(
        ctx.accounts.program_config.to_account_info(),     // program_config
        ctx.accounts.program_config_treasury.to_account_info(),  // treasury
        ctx.accounts.mint_multisig.to_account_info(),            // multisig (being created)
        ctx.accounts.mint_create_key.to_account_info(),          // create_key (different from treasury)
        ctx.accounts.admin.to_account_info(),                     // creator (payer)
        ctx.accounts.system_program.to_account_info(),     // system_program
        ctx.accounts.squads_program.to_account_info(),     // squads_program
        SquadsMultisig::mint_multisig_create_args(
            Some(ctx.accounts.mint_multisig.key())
        ),
        mint_create_key_seeds,
    )?;

    // Initialize DAO
    let dao_type = DAOType::Child { parent_dao: ctx.accounts.parent_dao.key() };
    dao.set_inner(DAOAccount {
        version: DAO_VERSION,
        bump: ctx.bumps.dao,
        name: name.clone(),
        admin: ctx.accounts.admin.key(),
        token_mint: ctx.accounts.token_mint.key(),
        cosigner: treasury_cosigner,
        treasury_multisig: ctx.accounts.treasury_multisig.key(),
        mint_auth_multisig: ctx.accounts.mint_multisig.key(),
        dao_type
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
