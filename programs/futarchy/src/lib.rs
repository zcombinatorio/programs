use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod squads;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("FUT2Nd1EdJGZLgKdNkNeyTGS3nX76PRTQa4Wx9YcDfZC");

#[program]
pub mod futarchy {
    use super::*;

    pub fn initialize_moderator(ctx: Context<InitializeModerator>, name: String) -> Result<()> {
        instructions::initialize_moderator::initialize_moderator_handler(ctx, name)
    }

    pub fn initialize_proposal<'info>(
        ctx: Context<'_, '_, 'info, 'info, InitializeProposal<'info>>,
        proposal_params: ProposalParams
    ) -> Result<u16> {
        instructions::initialize_proposal::initialize_proposal_handler(
            ctx,
            proposal_params
        )
    }

    pub fn add_option<'info>(ctx: Context<'_, '_, 'info, 'info, AddOption<'info>>) -> Result<()> {
        instructions::add_option::add_option_handler(ctx)
    }

    pub fn launch_proposal<'info>(
        ctx: Context<'_, '_, 'info, 'info, LaunchProposal<'info>>,
        base_amount: u64,
        quote_amount: u64,
    ) -> Result<()> {
        instructions::launch_proposal::launch_proposal_handler(ctx, base_amount, quote_amount)
    }

    pub fn finalize_proposal<'info>(
        ctx: Context<'_, '_, 'info, 'info, FinalizeProposal<'info>>,
    ) -> Result<()> {
        instructions::finalize_proposal::finalize_proposal_handler(ctx)
    }

    pub fn redeem_liquidity<'info>(
        ctx: Context<'_, '_, 'info, 'info, RedeemLiquidity<'info>>,
    ) -> Result<()> {
        instructions::redeem_liquidity::redeem_liquidity_handler(ctx)
    }

    pub fn add_historical_proposal<'info>(
        ctx: Context<'_, '_, 'info, 'info, AddHistoricalProposal<'info>>,
        num_options: u8,
        winning_idx: u8,
        length: u16,
        created_at: i64,
    ) -> Result<u16> {
        instructions::add_historical_proposal_handler(
            ctx,
            num_options,
            winning_idx,
            length,
            created_at,
        )
    }

    pub fn initialize_parent_dao(
        ctx: Context<InitializeParentDAO>,
        name: String,
        treasury_cosigner: Pubkey,
        pool: Pubkey,
        pool_type: PoolType,
    ) -> Result<()> {
        instructions::initialize_parent_dao::initialize_parent_dao_handler(
            ctx,
            name,
            treasury_cosigner,
            pool,
            pool_type,
        )
    }

    pub fn initialize_child_dao(
        ctx: Context<InitializeChildDAO>,
        name: String,
        treasury_cosigner: Pubkey,
    ) -> Result<()> {
        instructions::initialize_child_dao::initialize_child_dao_handler(
            ctx,
            name,
            treasury_cosigner,
        )
    }

    pub fn upgrade_dao(
        ctx: Context<UpgradeDAO>,
        pool: Pubkey,
        pool_type: PoolType,
    ) -> Result<()> {
        instructions::upgrade_dao::upgrade_dao_handler(ctx, pool, pool_type)
    }
}
