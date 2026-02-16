/**
 * Mainnet pool configuration for lending tests with surfpool
 */
import { PublicKey } from "@solana/web3.js";

export const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// ZC/SOL DLMM pool
export const DLMM_CONFIG = {
  pool: new PublicKey("7jbhVZcYqCRmciBcZzK8L5B96Pyw7i1SpXQFKBkzD3G2"),
  baseMint: new PublicKey("GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC"), // ZC
  quoteMint: NATIVE_SOL_MINT, // WSOL
  poolType: "dlmm" as const,
};

// STAR token mint (Stardust) - for reference
export const STAR_MINT = new PublicKey("StargWr5r6r8gZSjmEKGZ1dmvKWkj79r2z1xqjFstar");

// USDC/SOL DAMM v2 (CP-AMM) pool
// Note: This pool has USDC as token A, SOL as token B
export const DAMM_CONFIG = {
  pool: new PublicKey("5mZLXxnVy1F1PgQPFPtNsDmmwj7MkyYNN71dwK6nMvf"),
  baseMint: USDC_MINT, // USDC (lent token, token A in pool)
  quoteMint: NATIVE_SOL_MINT, // SOL (collateral, token B in pool)
  poolType: "cpAmm" as const,
};
