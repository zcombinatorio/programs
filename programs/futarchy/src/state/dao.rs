use anchor_lang::prelude::*;

pub const DAO_VERSION: u8 = 1;

#[constant]
pub const DAO_SEED: &[u8] = b"dao";

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum PoolType {
    DAMM,
    DLMM
}

#[derive(Copy, Clone, InitSpace, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub enum DAOType {                                             
    /// Top-level DAO with its own liquidity pool              
    Parent {                                                   
        moderator: Pubkey,                                                                       
        pool: Pubkey,                                          
        pool_type: PoolType,                                   
    },                                                         
    /// Sub-DAO that inherits from a parent                    
    Child {                                                    
        parent_dao: Pubkey,                                    
    },                                                         
} 

/// Seeds: [DAO_SEED, &dao_id.to_le_bytes()] 
#[account]
#[derive(InitSpace)]
pub struct DAOAccount {
    pub version: u8,
    pub bump: u8,

    #[max_len(32)]
    pub name: String, 

    pub admin: Pubkey,
    pub token_mint: Pubkey,   
    pub cosigner: Pubkey,
    pub treasury_multisig: Pubkey,
    pub mint_auth_multisig: Pubkey,
    pub dao_type: DAOType,

    #[max_len(32)] // Initially just admin
    pub white_list: Vec<Pubkey>
}

impl DAOAccount {
    pub fn is_child(&self) -> bool {
        matches!(self.dao_type, DAOType::Child { .. })
    }

    pub fn is_parent(&self) -> bool {
        matches!(self.dao_type, DAOType::Parent{ .. })
    }

    pub fn is_child_of(&self, parent: Pubkey) -> bool {
        match self.dao_type {
            DAOType::Child { parent_dao } => parent == parent_dao,
            DAOType::Parent { .. } => false
        }
    }
}

#[event]
pub struct DAOInitialized {
    pub version: u8,
    pub name: String,
    pub admin: Pubkey,
    pub treasury_multisig: Pubkey,
    pub mint_multisig: Pubkey,
    pub dao_type: DAOType
}