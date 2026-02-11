use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("LEND7YMJZSudGFhVmx1xJCAahk8Vv62RQ9p4QkyeBH8");

#[program]
pub mod lending_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::initialize_handler(ctx)
    }
}
