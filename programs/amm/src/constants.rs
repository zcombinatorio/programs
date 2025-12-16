use anchor_lang::prelude::*;

#[constant]
pub const MAX_FEE: u16 = 5000; // 50%

// Fee vault authority
#[constant]
pub const FEE_AUTHORITY: Pubkey = pubkey!("FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC");

#[constant]
pub const RESERVE_SEED: &[u8] = b"reserve";

#[constant]
pub const POOL_SEED: &[u8] = b"pool";

#[constant]
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

#[constant]
pub const AMM_VERSION: u8 = 1;