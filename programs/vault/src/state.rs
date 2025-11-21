use anchor_lang::prelude::*;

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub enum VaultType {
    Base,  // 0
    Quote, // 1
}

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum VaultState {
    // Awaiting activation
    Setup,
    // Deposits / Withdrawals allowed
    Active,
    // Deposits / Withdrawals revoked
    // Redeem Winnings allowed
    Finalized,
}

#[derive(InitSpace)]
#[account]
pub struct VaultAccount {
    pub owner: Pubkey, // Vault creator
    pub mint: Pubkey,  // Regular mint
    pub proposal_id: u8,
    pub vault_type: VaultType,
    pub state: VaultState,

    // Number of markets (2 <= n <= 4)
    pub num_options: u8,

    // Set after finalization
    // (index, cond. mint PDA bump)
    pub winning_option: Option<(u8, u8)>,
    pub bump: u8,
}
