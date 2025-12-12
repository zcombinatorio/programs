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
import { expectReserves } from "../helpers/assertions";
import {
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  FUNDING_AMOUNT,
  ONE_TOKEN,
} from "../helpers/constants";

describe("AMM - Happy Path - Liquidity", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("Add Liquidity", () => {
    it("add liquidity increases reserves", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPool(client, wallet, mintA, mintB);

      // Verify empty reserves
      await expectReserves(client, ctx.poolPda, 0, 0);

      // Add liquidity
      const addAmount = INITIAL_LIQUIDITY;
      const builder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        addAmount,
        addAmount
      );
      await builder.rpc();

      // Verify reserves increased
      await expectReserves(client, ctx.poolPda, addAmount, addAmount);
    });

    it("add asymmetric liquidity amounts", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPool(client, wallet, mintA, mintB);

      // Add different amounts for each side
      const amountA = INITIAL_LIQUIDITY;
      const amountB = INITIAL_LIQUIDITY * 2;
      const builder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        amountA,
        amountB
      );
      await builder.rpc();

      await expectReserves(client, ctx.poolPda, amountA, amountB);
    });

    it("add liquidity multiple times accumulates", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPool(client, wallet, mintA, mintB);

      // Add liquidity twice
      const firstAdd = ONE_TOKEN * 10;
      let builder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        firstAdd,
        firstAdd
      );
      await builder.rpc();

      const secondAdd = ONE_TOKEN * 20;
      builder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        secondAdd,
        secondAdd
      );
      await builder.rpc();

      // Reserves should be sum of both additions
      await expectReserves(
        client,
        ctx.poolPda,
        firstAdd + secondAdd,
        firstAdd + secondAdd
      );
    });
  });

  describe("Remove Liquidity", () => {
    it("remove liquidity decreases reserves", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

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

    it("partial liquidity removal", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Remove only 10%
      const removeAmount = INITIAL_LIQUIDITY / 10;
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

    it("remove asymmetric liquidity amounts", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Remove different amounts
      const removeA = INITIAL_LIQUIDITY / 4;
      const removeB = INITIAL_LIQUIDITY / 2;
      const builder = await client.removeLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        removeA,
        removeB
      );
      await builder.rpc();

      await expectReserves(
        client,
        ctx.poolPda,
        INITIAL_LIQUIDITY - removeA,
        INITIAL_LIQUIDITY - removeB
      );
    });

    it("remove all liquidity (drain pool)", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Remove all liquidity
      const builder = await client.removeLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );
      await builder.rpc();

      await expectReserves(client, ctx.poolPda, 0, 0);
    });
  });

  describe("Liquidity After Swaps", () => {
    it("add liquidity after swaps occurred", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Do a swap first
      const swapBuilder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await swapBuilder.rpc();

      // Get reserves after swap
      const { reserveA: afterSwapA, reserveB: afterSwapB } =
        await client.fetchReserves(ctx.poolPda);

      // Add more liquidity
      const addAmount = ONE_TOKEN * 10;
      const addBuilder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        addAmount,
        addAmount
      );
      await addBuilder.rpc();

      // Verify reserves increased
      const { reserveA: finalA, reserveB: finalB } =
        await client.fetchReserves(ctx.poolPda);

      expect(finalA.eq(afterSwapA.add(new BN(addAmount)))).to.be.true;
      expect(finalB.eq(afterSwapB.add(new BN(addAmount)))).to.be.true;
    });
  });
});
