use anchor_lang::prelude::*;

// ============================================================================
// PDA Seeds
// ============================================================================

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const VAULT_BASE_ATA_SEED: &[u8] = b"vault_base";
#[constant]
pub const VAULT_QUOTE_ATA_SEED: &[u8] = b"vault_quote";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";

// ============================================================================
// Vault State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct LendingVault {
    /// Bump for PDA derivation
    pub bump: u8,
    /// Nonce for multiple vaults
    pub nonce: u16,
    /// Admin who can manage the vault
    pub admin: Pubkey,
    
    // === Token Configuration ===
    /// Base mint (what users borrow)
    pub base_mint: Pubkey,
    /// Quote mint (what users deposit as collateral)
    pub quote_mint: Pubkey,
    /// Vault-owned ATA for base tokens (liquidity pool)
    pub base_vault: Pubkey,
    /// Vault-owned ATA for quote tokens (collateral storage)
    pub quote_vault: Pubkey,
    
    // === Pool Configuration (for price + liquidation swaps) ===
    /// AMM pool address (DAMM v2 or DLMM) - must be base/quote pair
    pub pool: Pubkey,
    /// Pool type for CPI routing
    pub pool_type: PoolType,
    /// True if pool's token A/X is the vault's base mint (false = need to invert price)
    pub is_pool_base_token_a: bool,
    
    // === Risk Parameters ===
    /// Loan-to-Value ratio in basis points (max borrow ratio at entry)
    /// e.g., 5000 = 50% = can borrow up to 50% of collateral value
    pub ltv_bps: u16,
    /// Liquidation threshold in basis points
    /// e.g., 8000 = 80% = liquidatable when loan/collateral >= 80%
    pub liquidation_threshold_bps: u16,
    /// Loan duration in seconds (time-based liquidation)
    pub loan_duration_seconds: u64,
    
    // === Accounting ===
    /// Total base tokens available for borrowing
    pub total_base_liquidity: u64,
    /// Total base tokens currently borrowed
    pub total_base_borrowed: u64,
    /// Total quote tokens held as collateral
    pub total_quote_collateral: u64,
    /// Number of open positions
    pub open_positions: u32,
    
    // === Timestamps ===
    pub created_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PoolType {
    CpAmm,  // CP-AMM (DAMM v2) - uses sqrtPrice
    Dlmm,   // DLMM - concentrated liquidity bins
}

// ============================================================================
// Position State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Bump for PDA derivation
    pub bump: u8,
    /// The vault this position belongs to
    pub vault: Pubkey,
    /// The user who owns this position
    pub user: Pubkey,
    
    // === Position Data ===
    /// Amount of quote tokens deposited as collateral
    pub collateral_amount: u64,
    /// Amount of base tokens borrowed
    pub borrowed_amount: u64,
    
    // === Timestamps ===
    /// When the position was opened
    pub opened_at: i64,
    
    // === Status ===
    pub is_active: bool,
}

impl Position {
    /// Check if position is expired (time-based liquidation)
    pub fn is_expired(&self, current_time: i64, loan_duration: u64) -> bool {
        current_time > self.opened_at.saturating_add(loan_duration as i64)
    }
    
    /// Calculate health factor in basis points
    /// health = (collateral_value / borrowed_value) * 10000
    /// Lower health = more risky, liquidatable when health < (10000 * 10000 / liquidation_threshold)
    pub fn calculate_health_bps(
        &self,
        base_price: u64,  // price of 1 base in quote (scaled)
        price_scale: u64, // scaling factor for price
    ) -> Option<u64> {
        if self.borrowed_amount == 0 {
            return Some(u64::MAX); // No debt = infinite health
        }
        
        // borrowed_value = borrowed_amount * base_price / price_scale
        // health_bps = (collateral_amount * price_scale * 10000) / (borrowed_amount * base_price)
        let numerator = (self.collateral_amount as u128)
            .checked_mul(price_scale as u128)?
            .checked_mul(10_000)?;
        let denominator = (self.borrowed_amount as u128)
            .checked_mul(base_price as u128)?;
        
        if denominator == 0 {
            return Some(u64::MAX);
        }
        
        Some((numerator / denominator) as u64)
    }
    
    /// Check if position is liquidatable due to health
    /// Liquidatable when: borrowed_value / collateral_value >= liquidation_threshold
    /// Or equivalently: health_bps <= 10000 * 10000 / liquidation_threshold_bps
    pub fn is_undercollateralized(
        &self,
        base_price: u64,
        price_scale: u64,
        liquidation_threshold_bps: u16,
    ) -> bool {
        if let Some(health_bps) = self.calculate_health_bps(base_price, price_scale) {
            // liquidation_threshold_bps = 8000 means liquidate at 80% utilization
            // health threshold = 10000 * 10000 / 8000 = 12500 bps (125% collateralization)
            let health_threshold = 10_000u64
                .saturating_mul(10_000)
                .checked_div(liquidation_threshold_bps as u64)
                .unwrap_or(0);
            health_bps <= health_threshold
        } else {
            true // Overflow = assume liquidatable
        }
    }
}
