use crate::constants::MAX_OPTIONS;
use anchor_lang::prelude::*;

pub const PROPOSAL_VERSION: u8 = 1;

#[constant]
pub const PROPOSAL_SEED: &[u8] = b"proposal";

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum ProposalState {
    Setup,        // Options being added
    Pending,      // Betting active
    Resolved(u8), // Index of the winning option
}

#[derive(InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct TWAPConfig {
    pub starting_observation: u128,  // Initial TWAP value
    pub max_observation_delta: u128, // Max change per update
    pub warmup_duration: u32,        // Seconds before TWAP is valid
}

#[account]
#[derive(InitSpace)]
/// Seeds: [PROPOSAL_SEED, moderator.key(), &id.to_le_bytes()]
pub struct ProposalAccount {
    pub version: u8,
    pub bump: u8,
    pub moderator: Pubkey,
    pub id: u16, // Set by moderator
    pub num_options: u8,
    pub state: ProposalState,

    pub created_at: i64,
    pub length: u16,     // In seconds
    pub creator: Pubkey, // Should match moderator admin

    // References for validation
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub vault: Pubkey,
    pub pools: [Pubkey; MAX_OPTIONS as usize],

    // AMM configuration
    pub fee: u16,
    pub twap_config: TWAPConfig,
}
