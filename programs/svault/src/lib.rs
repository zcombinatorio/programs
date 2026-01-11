use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("2DM31xJgZUPRP8bSwHgFv9S7iWhdiGVAndCjtkqeiRyJ");

#[program]
pub mod svault {
    use super::*;

    pub fn initialize_staking_vault(
        ctx: Context<InitializeStakingVault>,
        unstaking_period: u64,
        volume_window: u64,
    ) -> Result<()> {
        initialize::initialize_handler(ctx, unstaking_period, volume_window)
    }
}
