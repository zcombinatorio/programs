use anchor_lang::prelude::*;

// Protocol multisig constants
pub const TREASURY_MULTISIG_CONFIG_AUTH: Pubkey = pubkey!("HHroB8P1q3kijtyML9WPvfTXG8JicfmUoGZjVzam64PX");
pub const TREASURY_MULTISIG_KEY_A: Pubkey = pubkey!("HHroB8P1q3kijtyML9WPvfTXG8JicfmUoGZjVzam64PX");
pub const TREASURY_MULTISIG_KEY_B: Pubkey = pubkey!("3ogXyF6ovq5SqsneuGY6gHLG27NK6gw13SqfXMwRBYai");
pub const MINT_MULTISIG_CONFIG_AUTH: Pubkey = pubkey!("Dobm8QnaCPQoc6koxC3wqBQqPTfDwspATb2u6EcWC9Aw");
pub const MINT_MULTISIG_KEY_A: Pubkey = pubkey!("Dobm8QnaCPQoc6koxC3wqBQqPTfDwspATb2u6EcWC9Aw");
pub const MINT_MULTISIG_KEY_B: Pubkey = pubkey!("2xrEGvtxXKujqnHceiSzYDTAbTJEX3yGGPJgywH7LmcD");

// Maximum number of conditional options
// Bottle-necked by launch_proposal (64 account max)
#[constant]
pub const MAX_OPTIONS: u8 = 6;

// Minimum number of conditional options required
#[constant]
pub const MIN_OPTIONS: u8 = 2;
