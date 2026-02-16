/**
 * Lending Program Tests with Meteora DLMM on Devnet
 *
 * These tests require:
 * 1. Devnet connection
 * 2. Funded test wallet
 * 3. Existing Meteora DLMM pool
 *
 * Run with: anchor test --provider.cluster devnet -- --grep "Lending: DLMM"
 */

import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";

import { LendingClient, PoolType } from "../../../sdk/src";
import {
  getTestContext,
  getTokenBalance,
  TestContext,
} from "../helpers/setup";
import {
  expectVaultState,
  expectPositionState,
  expectPositionClosed,
} from "../helpers/assertions";
import { DLMM_PROGRAM_ID } from "../helpers/constants";

// =============================================================================
// DEVNET CONFIGURATION - Update these for your test environment
// =============================================================================

// Test admin keypair (fund this on devnet)
// Generated pubkey: mns8YmqefB3aKTqCQimDvCexFoWGz787ZGtT5BegfuE
const TEST_ADMIN_KEYPAIR_PATH = "../../test-admin.json";

// Known Meteora DLMM pools on devnet (you may need to create one or find existing)
// Format: { pool, baseMint (X), quoteMint (Y) }
// TODO: Replace with actual devnet pool addresses after discovery/creation
const DEVNET_DLMM_POOLS = {
  // Example: SOL-USDC pool (update with real addresses)
  // SOL_USDC: {
  //   pool: new PublicKey("..."),
  //   baseMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
  //   quoteMint: new PublicKey("..."), // USDC devnet
  // },
};

// =============================================================================
// TESTS
// =============================================================================

describe("Lending: DLMM Devnet", function () {
  // Increase timeout for devnet
  this.timeout(120000);

  let ctx: TestContext;
  let adminKeypair: Keypair;

  before(async function () {
    ctx = getTestContext();

    // Check if on devnet
    const genesisHash = await ctx.provider.connection.getGenesisHash();
    const isDevnet = genesisHash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

    if (!isDevnet) {
      console.log("Skipping DLMM devnet tests: not connected to devnet");
      this.skip();
    }

    // Load or generate admin keypair
    try {
      const fs = await import("fs");
      const keypairData = JSON.parse(
        fs.readFileSync(TEST_ADMIN_KEYPAIR_PATH, "utf-8")
      );
      adminKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
      console.log("Loaded admin keypair:", adminKeypair.publicKey.toString());
    } catch {
      console.log("Could not load admin keypair, using provider wallet");
      adminKeypair = (ctx.wallet as any).payer;
    }

    // Check balance
    const balance = await ctx.provider.connection.getBalance(adminKeypair.publicKey);
    console.log("Admin balance:", balance / 1e9, "SOL");

    if (balance < 0.1 * 1e9) {
      console.log("Insufficient balance. Please fund:", adminKeypair.publicKey.toString());
      this.skip();
    }
  });

  describe("Vault Operations with DLMM", () => {
    // These tests will be enabled once we have devnet pool addresses

    it("should initialize vault with DLMM pool", async function () {
      // Skip until we have real pool addresses
      if (Object.keys(DEVNET_DLMM_POOLS).length === 0) {
        console.log("Skipping: No DLMM pool configured");
        this.skip();
      }

      // TODO: Implement with real pool
    });

    it("should read price from DLMM pool", async function () {
      if (Object.keys(DEVNET_DLMM_POOLS).length === 0) {
        console.log("Skipping: No DLMM pool configured");
        this.skip();
      }

      // TODO: Implement price reading test
    });

    it("should open and repay position using DLMM price oracle", async function () {
      if (Object.keys(DEVNET_DLMM_POOLS).length === 0) {
        console.log("Skipping: No DLMM pool configured");
        this.skip();
      }

      // TODO: Implement full flow test
    });
  });

  describe("Liquidation with DLMM", () => {
    it("should liquidate expired position via DLMM swap", async function () {
      if (Object.keys(DEVNET_DLMM_POOLS).length === 0) {
        console.log("Skipping: No DLMM pool configured");
        this.skip();
      }

      // TODO: Implement liquidation test
      // This requires:
      // 1. Creating a position
      // 2. Waiting for expiry or manipulating price
      // 3. Calling liquidate_dlmm with proper bin arrays
    });
  });
});

// =============================================================================
// HELPER: Find or create DLMM pool on devnet
// =============================================================================

/**
 * Helper to find existing DLMM pools on devnet
 * Run this to discover pool addresses for testing
 */
export async function findDlmmPools(connection: anchor.web3.Connection) {
  console.log("Searching for DLMM pools on devnet...");

  // Use Meteora API to find pools
  try {
    const response = await fetch("https://dlmm-api.meteora.ag/pair/all");
    const pools = await response.json();

    // Filter for devnet pools (if API supports it) or known devnet tokens
    console.log(`Found ${pools.length} pools`);

    // Log first few pools for reference
    pools.slice(0, 5).forEach((pool: any) => {
      console.log(`Pool: ${pool.address}`);
      console.log(`  X: ${pool.mint_x}`);
      console.log(`  Y: ${pool.mint_y}`);
      console.log(`  Bin step: ${pool.bin_step}`);
      console.log("---");
    });

    return pools;
  } catch (err) {
    console.log("Could not fetch pools from API:", err);
    return [];
  }
}

/**
 * Read DLMM pool state directly (for debugging)
 */
export async function readDlmmPoolState(
  connection: anchor.web3.Connection,
  poolAddress: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(poolAddress);
  if (!accountInfo) {
    throw new Error("Pool account not found");
  }

  // Read key fields at known offsets (matching our oracle.rs)
  const data = accountInfo.data;

  const activeId = data.readInt32LE(76);
  const binStep = data.readUInt16LE(80);
  const tokenXMint = new PublicKey(data.slice(88, 120));
  const tokenYMint = new PublicKey(data.slice(120, 152));

  return {
    activeId,
    binStep,
    tokenXMint,
    tokenYMint,
  };
}
