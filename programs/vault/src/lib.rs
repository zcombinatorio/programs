use anchor_lang::prelude::*;

declare_id!("4oiXvA71BdpWsdcmjMysn57W3FzB9uqbujtq7Vpzt7ag");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        vault_type: VaultType,
        proposal_id: u8,
    ) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, vault_type, proposal_id)
    }

    pub fn add_option(ctx: Context<AddOption>) -> Result<()> {
        instructions::add_option::add_option_handler(ctx)
    }

    pub fn activate(ctx: Context<ActivateVault>) -> Result<()> {
        instructions::activate_vault::activate_vault_handler(ctx)
    }

    pub fn finalize(ctx: Context<FinalizeVault>, winning_idx: u8) -> Result<()> {
        instructions::finalize::finalize_vault_handler(ctx, winning_idx)
    }
}
