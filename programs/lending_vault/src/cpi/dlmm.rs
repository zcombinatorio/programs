// DLMM (Concentrated Liquidity) CPI interface
// Program ID: LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo

use anchor_lang::prelude::*;

// Declare the program interface from IDL
anchor_lang::declare_program!(dlmm);

pub use dlmm::*;

/// DLMM program ID
pub const DLMM_PROGRAM_ID: Pubkey = pubkey!("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
