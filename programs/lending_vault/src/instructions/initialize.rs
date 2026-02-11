use anchor_lang::prelude::*;

use crate::state::*;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct LendingConfigInitialized {
    pub config: Pubkey,
    pub admin: Pubkey,
    pub nonce: u16,
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
#[instruction(nonce: u16, protocol_fee_bps: u16)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + LendingConfig::INIT_SPACE,
        seeds = [LENDING_CONFIG_SEED, &nonce.to_le_bytes()],
        bump,
    )]
    pub config: Account<'info, LendingConfig>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// Handler
// ============================================================================

pub fn initialize_handler(
    ctx: Context<InitializeConfig>,
    nonce: u16,
    protocol_fee_bps: u16,
) -> Result<()> {
    require!(
        protocol_fee_bps <= 10_000,
        crate::error::ErrorCode::InvalidBasisPoints
    );

    let clock = Clock::get()?;

    ctx.accounts.config.set_inner(LendingConfig {
        bumps: ConfigBumps {
            config: ctx.bumps.config,
        },
        nonce,
        admin: ctx.accounts.admin.key(),
        fee_authority: ctx.accounts.admin.key(),
        protocol_fee_bps,
        created_at: clock.unix_timestamp,
    });

    emit!(LendingConfigInitialized {
        config: ctx.accounts.config.key(),
        admin: ctx.accounts.admin.key(),
        nonce,
    });

    Ok(())
}
