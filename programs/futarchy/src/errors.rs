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
}
