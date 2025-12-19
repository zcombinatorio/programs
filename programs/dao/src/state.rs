use anchor_lang::prelude::*;

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum PoolType {
    DAMM,
    DLMM
}

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum DAOType {
    Parent {
        moderator: Pubkey,
        base_mint: Pubkey,
        pool: Pubkey,
        pool_type: PoolType,
    },
    Child {
        parent_dao: Pubkey,
    },
}

#[account]
#[derive(InitSpace)]
pub struct DAOAccount {
    pub version: u8,
    pub admin: Pubkey,
    pub treasury_multisig: Pubkey,
    pub mint_auth_multisig: Pubkey,
    pub dao_type: DAOType,
    #[max_len(4)]
    pub white_list: Vec<Pubkey>
}
