use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Loan-to-value ratio exceeded")]
    LtvExceeded,
    #[msg("Position is healthy and cannot be liquidated")]
    PositionHealthy,
    #[msg("Pool is not active")]
    PoolNotActive,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid basis points (must be 0-10000)")]
    InvalidBasisPoints,
    #[msg("Invalid oracle price")]
    InvalidOraclePrice,
    #[msg("Borrow cap exceeded")]
    BorrowCapExceeded,
}
