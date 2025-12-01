use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Vault already exists")]
    VaultAlreadyExists,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Invalid state")]
    InvalidState,

    #[msg("Minimum 2 options required")]
    NotEnoughOptions,

    #[msg("Too many options")]
    TooManyOptions,

    #[msg("Option limit reached")]
    OptionLimitReached,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Index out of bounds")]
    IndexOutOfBounds,

    #[msg("Invalid number of accounts")]
    InvalidNumberOfAccounts,

    #[msg("Invalid conditional mint")]
    InvalidConditionalMint,

    #[msg("Invalid user ATA")]
    InvalidUserAta,

    #[msg("Invalid account owner")]
    InvalidAccountOwner,

    #[msg("No winning option set")]
    NoWinningOption,

    #[msg("No conditional tokens")]
    NoConditionalTokens,
}
