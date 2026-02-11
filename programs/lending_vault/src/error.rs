use anchor_lang::prelude::*;

#[error_code]
pub enum LendingVaultError {
    #[msg("Unauthorized access")]
    Unauthorized,
}
