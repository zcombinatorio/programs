use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PoolAccount {
    pub admin: Pubkey,

    // Mints
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,

    // Fee (basis points)
    pub fee: u16,

    pub bump: u8,
}