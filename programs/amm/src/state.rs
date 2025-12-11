use crate::twap::TwapOracle;
use anchor_lang::prelude::*;

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum PoolState {
    Trading,
    Finalized,
}

#[account]
#[derive(InitSpace)]
pub struct PoolAccount {
    // Given full state-change
    // In prod, given to the proposal PDA
    pub admin: Pubkey,

    // Sole liquidity provider
    pub liquidity_provider: Pubkey,

    // Mints
    // Fees are collected in mint_a
    pub mint_a: Pubkey, // In prod, cond. quote
    pub mint_b: Pubkey, // In prod, cond. base

    // Fee (basis points)
    pub fee: u16,
    pub oracle: TwapOracle,
    pub state: PoolState,

    pub bump: u8,
}
