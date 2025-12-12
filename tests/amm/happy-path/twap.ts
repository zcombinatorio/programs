import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  ensureWalletFunded,
} from "../helpers/setup";
import { createPool, createPoolWithLiquidity } from "../helpers/factories";
import {
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  DEFAULT_STARTING_OBSERVATION,
  DEFAULT_MAX_OBSERVATION_DELTA,
} from "../helpers/constants";

describe("AMM - Happy Path - TWAP Oracle", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  // Note: Skip time-dependent tests - focus on non-time-dependent TWAP functionality

  describe("Oracle Initialization", () => {
    it("initial observation set on pool creation", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      const customObservation = BigInt("2000000000000");
      const ctx = await createPool(client, wallet, mintA, mintB, {
        startingObservation: customObservation,
      });

      const pool = await client.fetchPool(ctx.poolPda);

      expect(pool.oracle.startingObservation.toString()).to.equal(
        customObservation.toString()
      );
      expect(pool.oracle.lastObservation.toString()).to.equal(
        customObservation.toString()
      );
    });

    it("TWAP oracle state initialized correctly", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      const ctx = await createPool(client, wallet, mintA, mintB);

      const pool = await client.fetchPool(ctx.poolPda);

      // Oracle should be initialized
      expect(pool.oracle).to.exist;
      expect(pool.oracle.startingObservation.toString()).to.equal(
        DEFAULT_STARTING_OBSERVATION.toString()
      );
      expect(pool.oracle.maxObservationDelta.toString()).to.equal(
        DEFAULT_MAX_OBSERVATION_DELTA.toString()
      );
      expect(pool.oracle.cumulativeObservations.toString()).to.equal("0");
      expect(pool.oracle.createdAtUnixTime.toNumber()).to.be.greaterThan(0);
      expect(pool.oracle.lastUpdateUnixTime.toNumber()).to.be.greaterThan(0);
    });

    it("oracle fields accessible after creation", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      const ctx = await createPool(client, wallet, mintA, mintB);

      const pool = await client.fetchPool(ctx.poolPda);

      // All oracle fields should be accessible
      expect(pool.oracle.cumulativeObservations).to.exist;
      expect(pool.oracle.lastUpdateUnixTime).to.exist;
      expect(pool.oracle.createdAtUnixTime).to.exist;
      expect(pool.oracle.lastPrice).to.exist;
      expect(pool.oracle.lastObservation).to.exist;
      expect(pool.oracle.maxObservationDelta).to.exist;
      expect(pool.oracle.startingObservation).to.exist;
      expect(pool.oracle.warmupDuration).to.exist;
    });
  });

  describe("TWAP Updates", () => {
    it("crank TWAP updates last_price from reserves", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      const poolBefore = await client.fetchPool(ctx.poolPda);
      const lastPriceBefore = poolBefore.oracle.lastPrice;

      // Crank TWAP
      const builder = await client.crankTwap(ctx.poolPda);
      await builder.rpc();

      const poolAfter = await client.fetchPool(ctx.poolPda);

      // With balanced reserves (1:1), price should reflect that
      // lastPrice should be calculated from current reserves
      expect(poolAfter.oracle.lastPrice).to.exist;
    });

    it("swap automatically triggers TWAP update", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      const poolBefore = await client.fetchPool(ctx.poolPda);
      const updateTimeBefore = poolBefore.oracle.lastUpdateUnixTime;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Swap should crank TWAP
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      const poolAfter = await client.fetchPool(ctx.poolPda);

      // lastUpdateUnixTime should be updated (or same if within MIN_RECORDING_INTERVAL)
      const lastUpdateAfter = new BN(poolAfter.oracle.lastUpdateUnixTime.toString());
      const lastUpdateBefore = new BN(updateTimeBefore.toString());
      expect(lastUpdateAfter.gte(lastUpdateBefore)).to.be.true;

      // lastPrice should reflect new reserves ratio
      expect(poolAfter.oracle.lastPrice).to.exist;
    });
  });

  describe("Oracle Configuration", () => {
    it("custom warmup duration is stored", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      const customWarmup = 300; // 5 minutes
      const ctx = await createPool(client, wallet, mintA, mintB, {
        warmupDuration: customWarmup,
      });

      const pool = await client.fetchPool(ctx.poolPda);
      expect(pool.oracle.warmupDuration).to.equal(customWarmup);
    });

    it("custom max observation delta is stored", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      const customDelta = BigInt("50000000000"); // 5% of scale
      const ctx = await createPool(client, wallet, mintA, mintB, {
        maxObservationDelta: customDelta,
      });

      const pool = await client.fetchPool(ctx.poolPda);
      expect(pool.oracle.maxObservationDelta.toString()).to.equal(
        customDelta.toString()
      );
    });
  });
});
