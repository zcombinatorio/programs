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
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Invalid basis points (must be 0-10000)")]
    InvalidBasisPoints,
    #[msg("Cannot initiate unstake while another unstake is pending")]
    UnstakePending,
}
