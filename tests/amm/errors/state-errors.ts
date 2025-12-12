import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import { PoolState } from "../../../sdk/src";
import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  ensureWalletFunded,
} from "../helpers/setup";
import {
  createPool,
  createPoolWithLiquidity,
  createFinalizedPool,
} from "../helpers/factories";
import { expectAnchorError, expectPoolState } from "../helpers/assertions";
import { INITIAL_LIQUIDITY, SWAP_AMOUNT } from "../helpers/constants";

describe("AMM - Errors - State Errors", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("InvalidState", () => {
    it("swap on Finalized pool fails with InvalidState", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createFinalizedPool(client, wallet, mintA, mintB);

      // Verify pool is finalized
      await expectPoolState(client, ctx.poolPda, PoolState.Finalized);

      // Attempt swap should fail
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("crank TWAP on Finalized pool fails with InvalidState", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createFinalizedPool(client, wallet, mintA, mintB);

      // Attempt to crank TWAP should fail
      const builder = await client.crankTwap(ctx.poolPda);

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("cease trading on already Finalized pool fails with InvalidState", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createFinalizedPool(client, wallet, mintA, mintB);

      // Attempt to finalize again should fail
      await expectAnchorError(
        client.ceaseTrading(wallet.publicKey, ctx.poolPda).rpc(),
        "InvalidState"
      );
    });
  });

  describe("EmptyPool", () => {
    it("swap with zero reserves fails with EmptyPool", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      // Create pool without adding liquidity
      const ctx = await createPool(client, wallet, mintA, mintB);

      // Attempt swap should fail - pool is empty
      // min_output must be > 0 to pass InvalidAmount check
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );

      await expectAnchorError(builder.rpc(), "EmptyPool");
    });
  });
});
