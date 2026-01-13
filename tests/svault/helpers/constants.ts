// Test constants for svault test suite

// Token amounts (6 decimals)
export const ONE_TOKEN = 1_000_000;
export const MIN_AMOUNT = 1;

// Standard test amounts
export const STAKE_AMOUNT = 10_000_000; // 10 tokens
export const SMALL_STAKE = 1_000_000; // 1 token
export const LARGE_STAKE = 100_000_000; // 100 tokens
export const FUNDING_AMOUNT = 1_000_000_000; // 1000 tokens (for initial funding)
export const REWARD_AMOUNT = 50_000_000; // 50 tokens (for reward pool)

// Staking config defaults
export const DEFAULT_UNSTAKING_PERIOD = 1; // 1 day (in days)
export const DEFAULT_VOLUME_WINDOW = 14; // 14 days
export const ZERO_UNSTAKING_PERIOD = 0; // For immediate withdraw tests

// Slashing
export const SLASH_50_PERCENT = 5000; // 50% in basis points
export const SLASH_10_PERCENT = 1000; // 10% in basis points

// Compute budget settings
export const COMPUTE_UNITS = 200_000;
