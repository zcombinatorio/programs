import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";

// Lending program on devnet
export const LENDING_PROGRAM_ID = new PublicKey(
  "LEND7YMJZSudGFhVmx1xJCAahk8Vv62RQ9p4QkyeBH8"
);

// Meteora DLMM program on devnet
export const DLMM_PROGRAM_ID = new PublicKey(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
);

// Meteora CP-AMM (DAMM v2) program
export const CP_AMM_PROGRAM_ID = new PublicKey(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);

// Test parameters
export const DEFAULT_LTV_BPS = 5000; // 50%
export const DEFAULT_LIQUIDATION_THRESHOLD_BPS = 8000; // 80%
export const DEFAULT_LOAN_DURATION_SECONDS = 86400; // 24 hours

// Token amounts (in lamports/smallest units)
export const INITIAL_LIQUIDITY = new BN(1_000_000_000); // 1000 tokens (6 decimals)
export const COLLATERAL_AMOUNT = new BN(100_000_000); // 100 tokens
export const BORROW_AMOUNT = new BN(40_000_000); // 40 tokens (within 50% LTV)

// Funding amounts
export const SOL_AIRDROP = 2_000_000_000; // 2 SOL
export const TOKEN_FUNDING = 10_000_000_000; // 10000 tokens
