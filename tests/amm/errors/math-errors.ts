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
import { expectAnchorError, expectError } from "../helpers/assertions";
import { INITIAL_LIQUIDITY, ONE_TOKEN, HIGH_FEE, ZERO_FEE } from "../helpers/constants";

describe("AMM - Errors - Math Errors", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("OutputTooSmall", () => {
    it("tiny swap that rounds to zero output fails with OutputTooSmall", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA, ONE_TOKEN * 1000);
      await fundOwnerWallet(provider, wallet, mintB, ONE_TOKEN * 1000);

      // Create pool with heavily imbalanced reserves
      // Large reserve A, tiny reserve B
      // This makes A→B swaps produce very small outputs
      const largeReserveA = ONE_TOKEN * 500; // 500 tokens
      const tinyReserveB = 100; // 0.0001 tokens (100 units)
      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        largeReserveA,
        tinyReserveB,
        { fee: ZERO_FEE } // Zero fee to simplify math
      );

      // Swap A→B with small input
      // output = input * 100 / (500_000_000 + input) ≈ 0 for small inputs
      // With input = 1000: output = 1000 * 100 / 500_001_000 = 0
      const smallInput = 1000;

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        smallInput,
        1 // min_output must be > 0 to pass InvalidAmount check
      );

      await expectAnchorError(builder.rpc(), "OutputTooSmall");
    });
  });

  describe("InvariantViolated", () => {
    // Note: InvariantViolated is hard to trigger in normal operation
    // as it's checked both pre and post transfer. This test documents
    // that the invariant check exists and verifies it's maintained.

    it("invariant is maintained during swap", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Get initial k
      const { reserveA: beforeA, reserveB: beforeB } = await client.fetchReserves(ctx.poolPda);
      const kBefore = beforeA.mul(beforeB);

      // Small swap should pass invariant check
      // min_output must be > 0
      const swapAmount = ONE_TOKEN / 10; // 0.1 tokens
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        swapAmount,
        1 // min_output > 0 required
      );

      // This should succeed - invariant should be maintained
      await builder.rpc();

      // Verify reserves still satisfy invariant
      const { reserveA, reserveB } = await client.fetchReserves(ctx.poolPda);
      const kAfter = reserveA.mul(reserveB);

      // k should be >= initial k (fees increase k)
      expect(kAfter.gte(kBefore)).to.be.true;
    });
  });
});
