// Test constants for futarchy test suite

import { BN } from "@coral-xyz/anchor";
import { TWAPConfig } from "../../../sdk/src";

// Option counts to test (min and max boundaries)
export const OPTION_COUNTS = [2, 6];

// Token amounts (6 decimals)
export const ONE_TOKEN = 1_000_000;
export const MIN_AMOUNT = 1;

// Standard test amounts
export const INITIAL_LIQUIDITY = 10_000_000; // 10 tokens (for each base/quote)
export const FUNDING_AMOUNT = 100_000_000; // 100 tokens (for initial funding)

// Proposal settings
// MIN_RECORDING_INTERVAL in AMM is 60 seconds, so we need at least 70 seconds for TWAP warmup
export const PROPOSAL_LENGTH = 70;
export const DEFAULT_FEE = 30; // 30 basis points

// Default TWAP config for testing
export const DEFAULT_TWAP_CONFIG: TWAPConfig = {
  startingObservation: new BN(1_000_000_000_000), // 1e12 (PRICE_SCALE)
  maxObservationDelta: new BN(100_000_000_000), // 10% of PRICE_SCALE
  warmupDuration: 0, // No warmup for tests
};

// Compute budget settings
export const COMPUTE_UNITS = 600_000;

// Helper to get compute units (futarchy always uses max)
export function getComputeUnits(): number {
  return COMPUTE_UNITS;
}

// Sleep helper for waiting on proposal expiration
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
