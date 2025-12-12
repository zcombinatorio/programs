import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("3bt3f7BRg7zTZL8LbVTa5QeoD29Svd8t1L3xGwrjgmgz");
export const FEE_AUTHORITY = new PublicKey("FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC");

export const POOL_SEED = Buffer.from("pool");
export const RESERVE_SEED = Buffer.from("reserve");
export const FEE_VAULT_SEED = Buffer.from("fee_vault");

export const MAX_FEE = 5000; // 50% in basis points
export const PRICE_SCALE = 1_000_000_000_000n; // 1e12
