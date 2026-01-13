use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct SetConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [STAKING_CONFIG_SEED, config.token_mint.as_ref(), &config.nonce.to_le_bytes()],
        bump = config.bumps.config,
    )]
    pub config: Account<'info, StakingConfig>,
}

pub fn set_config_handler(
    ctx: Context<SetConfig>,
    unstaking_period: Option<u64>,
    volume_window: Option<u64>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(period) = unstaking_period {
        config.unstaking_period = period;
    }
    if let Some(window) = volume_window {
        config.volume_window = window;
    }
    Ok(())
}
