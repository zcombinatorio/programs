// https://github.com/coral-xyz/anchor/issues/3401#issuecomment-2513466441
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod cpi;
pub mod error;
pub mod instructions;
pub mod oracle;
pub mod state;
pub mod utils;

use instructions::*;
use state::PoolType;

declare_id!("LEND7YMJZSudGFhVmx1xJCAahk8Vv62RQ9p4QkyeBH8");

#[program]
pub mod lending_vault {
    use super::*;

    /// Initialize a new lending vault
    /// 
    /// # Arguments
    /// * `nonce` - Unique identifier for this vault (allows multiple vaults per mint pair)
    /// * `ltv_bps` - Loan-to-value ratio in basis points (e.g., 5000 = 50%)
    /// * `liquidation_threshold_bps` - Threshold for health-based liquidation (e.g., 8000 = 80%)
    /// * `loan_duration_seconds` - Time before position becomes liquidatable
    /// * `pool_type` - Type of AMM pool (DammV2 or Dlmm)
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        nonce: u16,
        ltv_bps: u16,
        liquidation_threshold_bps: u16,
        loan_duration_seconds: u64,
        pool_type: PoolType,
    ) -> Result<()> {
        initialize_vault::handler(ctx, nonce, ltv_bps, liquidation_threshold_bps, loan_duration_seconds, pool_type)
    }

    /// Add base token liquidity to the vault (admin only)
    /// 
    /// # Arguments
    /// * `amount` - Amount of base tokens to deposit
    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
        add_liquidity::handler(ctx, amount)
    }

    /// Remove base token liquidity from the vault (admin only)
    /// Can only remove liquidity that isn't currently borrowed
    /// 
    /// # Arguments
    /// * `amount` - Amount of base tokens to withdraw
    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, amount: u64) -> Result<()> {
        remove_liquidity::handler(ctx, amount)
    }

    /// Open a new borrowing position
    /// User deposits quote tokens as collateral and borrows base tokens
    /// 
    /// # Arguments
    /// * `collateral_amount` - Amount of quote tokens to deposit as collateral
    /// * `borrow_amount` - Amount of base tokens to borrow
    pub fn open_position(
        ctx: Context<OpenPosition>,
        collateral_amount: u64,
        borrow_amount: u64,
    ) -> Result<()> {
        open_position::handler(ctx, collateral_amount, borrow_amount)
    }

    /// Repay a borrowing position
    /// User returns borrowed base tokens and receives collateral back
    /// Position is closed and account rent is returned
    pub fn repay(ctx: Context<Repay>) -> Result<()> {
        repay::handler(ctx)
    }

    /// Liquidate an expired or undercollateralized position
    /// Permissionless - anyone can call this
    /// Collateral is swapped to base via the pool and returned to vault
    /// 
    /// Position is liquidatable if:
    /// - Time expired: current_time > opened_at + loan_duration
    /// - Undercollateralized: borrowed_value / collateral_value >= liquidation_threshold
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        liquidate::handler(ctx)
    }
}
