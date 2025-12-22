use anchor_lang::prelude::*;

#[error_code]
pub enum FutarchyError {
    #[msg("Vault account mismatch")]
    InvalidVault,

    #[msg("Pool account mismatch")]
    InvalidPools,

    #[msg("Mint mismatch")]
    InvalidMint,

    #[msg("Invalid Pool Program")]
    InvalidPoolProgram,

    #[msg("Minimum 2 options required")]
    NotEnoughOptions,

    #[msg("Too many options")]
    TooManyOptions,

    #[msg("Invalid remaining accounts")]
    InvalidRemainingAccounts,

    #[msg("Invalid proposal state")]
    InvalidState,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Proposal has not expired yet")]
    ProposalNotExpired,

    #[msg("TWAP not ready")]
    TwapNotReady,

    #[msg("Counter overflow")]
    CounterOverflow,

    #[msg("Winning index exceeds number of options")]
    InvalidWinningIndex,

    #[msg("Invalid account version")]
    InvalidVersion,

    #[msg("Name exceeds 32 bytes")]
    NameTooLong,

    #[msg("Invalid DAO account")]
    InvalidDAO,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid proposal parameters")]
    InvalidProposalParams,
}
