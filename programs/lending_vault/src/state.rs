use anchor_lang::prelude::*;

#[account]
pub struct LendingVault {
    /// The authority that can manage this vault
    pub authority: Pubkey,
    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl LendingVault {
    pub const LEN: usize = 8 + 32 + 1;
}
