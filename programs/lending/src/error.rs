use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // === Validation Errors ===
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    
    #[msg("Invalid basis points (must be 0-10000)")]
    InvalidBasisPoints,
    
    #[msg("LTV must be less than liquidation threshold")]
    InvalidLtvConfiguration,
    
    #[msg("Liquidation threshold must be less than or equal to 100%")]
    InvalidLiquidationThreshold,
    
    // === Liquidity Errors ===
    #[msg("Insufficient base liquidity in vault")]
    InsufficientLiquidity,
    
    #[msg("Cannot remove liquidity while positions are open")]
    PositionsStillOpen,
    
    #[msg("Cannot remove more liquidity than available")]
    InsufficientAvailableLiquidity,
    
    // === Position Errors ===
    #[msg("Position is not active")]
    PositionNotActive,
    
    #[msg("Position already exists for this user")]
    PositionAlreadyExists,
    
    #[msg("Borrow amount exceeds LTV limit")]
    LtvExceeded,
    
    #[msg("Repay amount exceeds borrowed amount")]
    RepayExceedsBorrowed,
    
    // === Liquidation Errors ===
    #[msg("Position is not liquidatable")]
    NotLiquidatable,
    
    #[msg("Position is healthy and not expired")]
    PositionHealthy,
    
    // === Authorization Errors ===
    #[msg("Unauthorized - admin only")]
    Unauthorized,
    
    // === Math Errors ===
    #[msg("Arithmetic overflow")]
    Overflow,
    
    // === Pool Errors ===
    #[msg("Invalid pool configuration")]
    InvalidPool,
    
    #[msg("Pool mints do not match vault mints")]
    PoolMintMismatch,
    
    #[msg("Invalid oracle price (zero or overflow)")]
    InvalidOraclePrice,
}
