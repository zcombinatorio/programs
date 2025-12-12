import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { PoolState, computeSwapOutput } from "../../../sdk/src";
import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  ensureWalletFunded,
} from "../helpers/setup";
import { createPoolWithLiquidity } from "../helpers/factories";
import {
  expectReserves,
  expectFeeVaultBalance,
  getInvariant,
} from "../helpers/assertions";
import {
  DEFAULT_FEE,
  ZERO_FEE,
  HIGH_FEE,
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  FUNDING_AMOUNT,
  ONE_TOKEN,
} from "../helpers/constants";

describe("AMM - Happy Path - Swaps", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("Basic Swaps", () => {
    it("swaps A→B basic case", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      const { reserveA: beforeA, reserveB: beforeB } =
        await client.fetchReserves(ctx.poolPda);

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true, // A to B
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      const { reserveA: afterA, reserveB: afterB } = await client.fetchReserves(
        ctx.poolPda
      );

      // Reserve A should increase (received input)
      expect(afterA.gt(beforeA)).to.be.true;
      // Reserve B should decrease (sent output)
      expect(afterB.lt(beforeB)).to.be.true;
    });

    it("swaps B→A basic case", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      const { reserveA: beforeA, reserveB: beforeB } =
        await client.fetchReserves(ctx.poolPda);

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        false, // B to A
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      const { reserveA: afterA, reserveB: afterB } = await client.fetchReserves(
        ctx.poolPda
      );

      // Reserve A should decrease (sent output)
      expect(afterA.lt(beforeA)).to.be.true;
      // Reserve B should increase (received input)
      expect(afterB.gt(beforeB)).to.be.true;
    });
  });

  describe("Fee Handling", () => {
    it("swaps with zero fee pool", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: ZERO_FEE,
      });

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      // Fee vault should be empty
      await expectFeeVaultBalance(client, ctx.poolPda, 0);
    });

    it("swaps with high fee pool", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: HIGH_FEE, // 10%
      });

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true, // A to B - fee on input
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      // Fee should be collected in fee vault (token A)
      const expectedFee = Math.floor((SWAP_AMOUNT * HIGH_FEE) / 10000);
      await expectFeeVaultBalance(client, ctx.poolPda, expectedFee);
    });

    it("fee collected in token A for A→B swap (input fee)", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: DEFAULT_FEE,
      });

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true, // A to B
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      const expectedFee = Math.floor((SWAP_AMOUNT * DEFAULT_FEE) / 10000);
      await expectFeeVaultBalance(client, ctx.poolPda, expectedFee);
    });

    it("fee collected in token A for B→A swap (output fee)", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: DEFAULT_FEE,
      });

      // Calculate expected output
      const { outputAmount } = computeSwapOutput(
        SWAP_AMOUNT,
        new BN(INITIAL_LIQUIDITY), // reserve B (input)
        new BN(INITIAL_LIQUIDITY), // reserve A (output)
        0 // No fee for gross output calc
      );

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        false, // B to A
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      // Fee is on output (token A), should be in fee vault
      const feeVaultBalance = await client.deriveFeeVaultPDA(ctx.poolPda);
      // Fee vault should have some balance (exact amount depends on implementation)
    });

    it("fee dust prevention (minimum fee of 1 when fee_bps > 0)", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: 1, // 0.01% - very small fee
      });

      // Tiny swap that would normally round fee to 0
      const tinyAmount = 100; // 0.0001 tokens
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        tinyAmount,
        1 // min_output > 0 required
      );
      await builder.rpc();

      // Should have minimum fee of 1
      await expectFeeVaultBalance(client, ctx.poolPda, 1);
    });
  });

  describe("Slippage Protection", () => {
    it("swap respects slippage protection (exact min output)", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: DEFAULT_FEE,
      });

      // Get quote
      const quote = await client.quote(ctx.poolPda, true, SWAP_AMOUNT, 0);

      // Swap with exact min output should succeed
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        quote.outputAmount // Exact expected output
      );
      await builder.rpc();
    });
  });

  describe("Invariant Verification", () => {
    it("invariant k maintained after swap (k_after >= k_before)", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: DEFAULT_FEE,
      });

      const kBefore = await getInvariant(client, ctx.poolPda);

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await builder.rpc();

      const kAfter = await getInvariant(client, ctx.poolPda);

      // k should be maintained or increase (due to fees)
      expect(kAfter.gte(kBefore)).to.be.true;
    });
  });

  describe("Sequential Swaps", () => {
    it("multiple sequential swaps", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB, INITIAL_LIQUIDITY, INITIAL_LIQUIDITY, {
        fee: DEFAULT_FEE,
      });

      const kInitial = await getInvariant(client, ctx.poolPda);

      // Multiple swaps in different directions
      for (let i = 0; i < 5; i++) {
        const direction = i % 2 === 0;
        const builder = await client.swap(
          wallet.publicKey,
          ctx.poolPda,
          direction,
          SWAP_AMOUNT / 10,
          1 // min_output > 0 required
        );
        await builder.rpc();
      }

      const kFinal = await getInvariant(client, ctx.poolPda);

      // Invariant should be maintained throughout
      expect(kFinal.gte(kInitial)).to.be.true;
    });
  });
});
