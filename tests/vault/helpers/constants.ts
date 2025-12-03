// Test constants for vault test suite

// Option counts to test (min and max boundaries)
export const OPTION_COUNTS = [2, 8];

// Token amounts (6 decimals)
export const ONE_TOKEN = 1_000_000;
export const MIN_AMOUNT = 1;

// Standard test amounts
export const DEPOSIT_AMOUNT = 1_000_000; // 1 token
export const LARGE_DEPOSIT = 10_000_000; // 10 tokens
export const FUNDING_AMOUNT = 100_000_000; // 100 tokens (for initial funding)

// Compute budget settings
export const COMPUTE_UNITS_LOW = 200_000; // For 2-5 options
export const COMPUTE_UNITS_HIGH = 450_000; // For 6-10 options

export function getComputeUnitsForOptions(numOptions: number): number {
  return numOptions <= 5 ? COMPUTE_UNITS_LOW : COMPUTE_UNITS_HIGH;
}
