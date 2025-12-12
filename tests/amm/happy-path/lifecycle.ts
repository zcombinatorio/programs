import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";

import { PoolState } from "../../../sdk/src";
import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  ensureWalletFunded,
  TestContext,
} from "../helpers/setup";
import { createPool, createPoolWithLiquidity } from "../helpers/factories";
import {
  expectPoolState,
  expectPoolFee,
  expectPoolAdmin,
  expectLiquidityProvider,
  expectReserves,
  expectFeeVaultBalance,
} from "../helpers/assertions";
import {
  DEFAULT_FEE,
  ZERO_FEE,
  MAX_FEE,
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  FUNDING_AMOUNT,
  DEFAULT_STARTING_OBSERVATION,
  DEFAULT_MAX_OBSERVATION_DELTA,
} from "../helpers/constants";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("AMM - Happy Path - Lifecycle", () => {
  const { provider, wallet, client } = getTestContext();

  let mintA: PublicKey;
  let mintB: PublicKey;

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  before(async () => {
    await ensureWalletFunded(provider, wallet);
    mintA = await createTestMint(provider, wallet);
    mintB = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, mintA, FUNDING_AMOUNT);
    await fundOwnerWallet(provider, wallet, mintB, FUNDING_AMOUNT);
  });

  describe("Pool Creation", () => {
    it("creates pool with valid parameters", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);

      const ctx = await createPool(client, wallet, testMintA, testMintB);

      // Verify pool state
      await expectPoolState(client, ctx.poolPda, PoolState.Trading);
      await expectPoolFee(client, ctx.poolPda, DEFAULT_FEE);
      await expectPoolAdmin(client, ctx.poolPda, wallet.publicKey);
      await expectReserves(client, ctx.poolPda, 0, 0);
    });

    it("creates pool with zero fee", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);

      const ctx = await createPool(client, wallet, testMintA, testMintB, {
        fee: ZERO_FEE,
      });

      await expectPoolFee(client, ctx.poolPda, ZERO_FEE);
    });

    it("creates pool with max fee (5000 bps / 50%)", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);

      const ctx = await createPool(client, wallet, testMintA, testMintB, {
        fee: MAX_FEE,
      });

      await expectPoolFee(client, ctx.poolPda, MAX_FEE);
    });

    it("creates pool with custom liquidity provider", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);
      const customLP = Keypair.generate().publicKey;

      const ctx = await createPool(client, wallet, testMintA, testMintB, {
        liquidityProvider: customLP,
      });

      await expectLiquidityProvider(client, ctx.poolPda, customLP);
    });

    it("creates pool with custom oracle parameters", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);

      const customObservation = BigInt("2000000000000");
      const customDelta = BigInt("50000000000");
      const customWarmup = 60;

      const ctx = await createPool(client, wallet, testMintA, testMintB, {
        startingObservation: customObservation,
        maxObservationDelta: customDelta,
        warmupDuration: customWarmup,
      });

      const pool = await client.fetchPool(ctx.poolPda);
      expect(pool.oracle.startingObservation.toString()).to.equal(
        customObservation.toString()
      );
      expect(pool.oracle.maxObservationDelta.toString()).to.equal(
        customDelta.toString()
      );
      expect(pool.oracle.warmupDuration).to.equal(customWarmup);
    });
  });

  describe("Liquidity Management", () => {
    it("adds liquidity to pool", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, testMintA);
      await fundOwnerWallet(provider, wallet, testMintB);

      const ctx = await createPool(client, wallet, testMintA, testMintB);

      const builder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );
      await builder.rpc();

      await expectReserves(
        client,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );
    });

    it("removes liquidity from pool", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, testMintA);
      await fundOwnerWallet(provider, wallet, testMintB);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        testMintA,
        testMintB
      );

      const removeAmount = INITIAL_LIQUIDITY / 2;
      const builder = await client.removeLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        removeAmount,
        removeAmount
      );
      await builder.rpc();

      await expectReserves(
        client,
        ctx.poolPda,
        INITIAL_LIQUIDITY - removeAmount,
        INITIAL_LIQUIDITY - removeAmount
      );
    });
  });

  describe("Trading Lifecycle", () => {
    it("ceases trading and transitions to Finalized", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, testMintA);
      await fundOwnerWallet(provider, wallet, testMintB);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        testMintA,
        testMintB
      );

      // Verify initial state
      await expectPoolState(client, ctx.poolPda, PoolState.Trading);

      // Cease trading
      await client.ceaseTrading(wallet.publicKey, ctx.poolPda).rpc();

      // Verify finalized state
      await expectPoolState(client, ctx.poolPda, PoolState.Finalized);
    });

    it("completes full lifecycle: create → add liquidity → swap → remove liquidity → finalize", async () => {
      const testMintA = await createTestMint(provider, wallet);
      const testMintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, testMintA);
      await fundOwnerWallet(provider, wallet, testMintB);

      // 1. Create pool
      const ctx = await createPool(client, wallet, testMintA, testMintB, {
        fee: DEFAULT_FEE,
      });
      await expectPoolState(client, ctx.poolPda, PoolState.Trading);

      // 2. Add liquidity
      const addBuilder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );
      await addBuilder.rpc();
      await expectReserves(
        client,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      // 3. Swap
      const swapBuilder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true, // A to B
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await swapBuilder.rpc();

      // Reserves should have changed
      const { reserveA, reserveB } = await client.fetchReserves(ctx.poolPda);
      expect(reserveA.gt(new BN(INITIAL_LIQUIDITY))).to.be.true;
      expect(reserveB.lt(new BN(INITIAL_LIQUIDITY))).to.be.true;

      // 4. Remove some liquidity
      const removeBuilder = await client.removeLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        SWAP_AMOUNT / 2,
        SWAP_AMOUNT / 2
      );
      await removeBuilder.rpc();

      // 5. Finalize
      await client.ceaseTrading(wallet.publicKey, ctx.poolPda).rpc();
      await expectPoolState(client, ctx.poolPda, PoolState.Finalized);
    });
  });
});
