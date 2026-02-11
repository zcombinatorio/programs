// Dynamic AMM (CP-AMM / DAMM v2) CPI interface
// Program ID: Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB

use anchor_lang::prelude::*;

// Declare the program interface from IDL
anchor_lang::declare_program!(dynamic_amm);

pub use dynamic_amm::*;

/// Dynamic AMM program ID
pub const DYNAMIC_AMM_PROGRAM_ID: Pubkey = pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
