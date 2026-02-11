use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("LEND7YMJZSudGFhVmx1xJCAahk8Vv62RQ9p4QkyeBH8");

#[program]
pub mod lending_vault {
    use super::*;

    /// Initialize the global lending configuration
    pub fn initialize(
        ctx: Context<InitializeConfig>,
        nonce: u16,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        initialize::initialize_handler(ctx, nonce, protocol_fee_bps)
    }

    // Future instructions:
    // pub fn create_pool(...) -> Result<()>
    // pub fn deposit(...) -> Result<()>
    // pub fn withdraw(...) -> Result<()>
    // pub fn borrow(...) -> Result<()>
    // pub fn repay(...) -> Result<()>
    // pub fn liquidate(...) -> Result<()>
    // pub fn set_config(...) -> Result<()>
}
