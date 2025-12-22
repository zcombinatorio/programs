use anchor_lang::prelude::*;

pub const MODERATOR_VERSION: u8 = 1;

#[constant]
pub const MODERATOR_SEED: &[u8] = b"moderator";

#[event]
pub struct ModeratorInitialized {
    pub version: u8,
    pub moderator: Pubkey,
    pub name: String,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub admin: Pubkey,
}

/// Seeds: [MODERATOR_SEED, &id.to_le_bytes()] 
#[account]
#[derive(InitSpace)]
pub struct ModeratorAccount {
    pub version: u8,
    pub bump: u8,
    
    #[max_len(32)]
    pub name: String,
    pub quote_mint: Pubkey,
    pub base_mint: Pubkey,
    pub proposal_id_counter: u16, // Next proposal id
    pub admin: Pubkey,
}