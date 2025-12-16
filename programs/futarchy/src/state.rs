use anchor_lang::prelude::*;

use crate::constants::MAX_OPTIONS;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub moderator_id_counter: u32, // global counter (starts at 0)
}

#[account]
#[derive(InitSpace)]
pub struct ModeratorAccount {
    pub id: u32, // moderator id (globally unique)
    pub admin: Pubkey,
    pub quote_mint: Pubkey,
    pub base_mint: Pubkey,
    pub proposal_id_counter: u8, // next proposal id
    pub bump: u8,
}

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum ProposalState {
    Setup,
    Pending,
    Resolved(u8), // index of the winning option
}

#[account]
#[derive(InitSpace)]
pub struct ProposalAccount {
    pub creator: Pubkey, // Should match moderator admin
    pub moderator: Pubkey,
    pub id: u8,
    pub num_options: u8,
    pub state: ProposalState,

    pub created_at: i64,
    pub length: u16, // in seconds

    // References for validation
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub vault: Pubkey,
    pub pools: [Pubkey; MAX_OPTIONS as usize],

    // AMM configuration
    pub fee: u16,
    pub twap_config: TWAPConfig,

    pub bump: u8,
}

#[derive(InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct TWAPConfig {
    pub starting_observation: u128,
    pub max_observation_delta: u128,
    pub warmup_duration: u32,
}
