use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Insufficient staked amount")]
    InsufficientStake,
    #[msg("No pending unstake to withdraw")]
    NoPendingUnstake,
    #[msg("Unstaking period has not elapsed")]
    UnstakingPeriodNotElapsed,
}
