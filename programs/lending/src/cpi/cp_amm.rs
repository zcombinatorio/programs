// CP-AMM (DAMM v2) CPI interface
// Program ID: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG

use anchor_lang::prelude::*;

// Declare the program interface from IDL
anchor_lang::declare_program!(cp_amm);

pub use cp_amm::*;

/// CP-AMM program ID
pub const CP_AMM_PROGRAM_ID: Pubkey = pubkey!("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

/// Pool authority (constant for all CP-AMM pools)
pub const CP_AMM_POOL_AUTHORITY: Pubkey = pubkey!("HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC");
