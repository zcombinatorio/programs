// Test constants for AMM test suite

// Token amounts (6 decimals)
export const ONE_TOKEN = 1_000_000;
export const MIN_AMOUNT = 1;

// Standard test amounts
export const SWAP_AMOUNT = 1_000_000; // 1 token
export const LARGE_SWAP = 100_000_000; // 100 tokens
export const FUNDING_AMOUNT = 1_000_000_000; // 1000 tokens (for initial funding)
export const INITIAL_LIQUIDITY = 100_000_000; // 100 tokens per side

// Fee configurations (in basis points)
export const ZERO_FEE = 0;
export const DEFAULT_FEE = 30; // 0.3%
export const LOW_FEE = 10; // 0.1%
export const MEDIUM_FEE = 100; // 1%
export const HIGH_FEE = 1000; // 10%
export const MAX_FEE = 5000; // 50%

// Fee configurations to test
export const FEE_CONFIGS = [ZERO_FEE, DEFAULT_FEE, MEDIUM_FEE, HIGH_FEE, MAX_FEE];

// TWAP oracle defaults
export const DEFAULT_STARTING_OBSERVATION = 1_000_000_000_000n; // 1e12 (PRICE_SCALE)
export const DEFAULT_MAX_OBSERVATION_DELTA = 100_000_000_000n; // 1e11 (10% of scale)
export const DEFAULT_WARMUP_DURATION = 0; // No warmup for tests

// Compute budget settings
export const COMPUTE_UNITS = 300_000;
