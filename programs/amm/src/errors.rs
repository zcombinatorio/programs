use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Invalid admin")]
    InvalidAdmin,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Slippage exceeded")]
    SlippageExceeded,

    #[msg("Invariant violated")]
    InvariantViolated,

    #[msg("Pool is empty")]
    EmptyPool,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Output too small")]
    OutputTooSmall,

    #[msg("Insufficient reserve balance")]
    InsufficientReserve,

    #[msg("Fee exceeds maximum")]
    InvalidFee,
}
