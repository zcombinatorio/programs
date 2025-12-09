use anchor_lang::prelude::*;
use crate::twap::TwapOracle;

#[account]
#[derive(InitSpace)]
pub struct PoolAccount {
    pub admin: Pubkey,

    // Mints
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,

    // Fee (basis points)
    pub fee: u16,
    pub oracle: TwapOracle,

    pub bump: u8,
}