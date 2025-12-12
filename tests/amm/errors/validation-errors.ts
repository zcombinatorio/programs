import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { computeSwapOutput } from "../../../sdk/src";
import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  ensureWalletFunded,
} from "../helpers/setup";
import { createPool, createPoolWithLiquidity } from "../helpers/factories";
import { expectAnchorError } from "../helpers/assertions";
import {
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  MAX_FEE,
  DEFAULT_FEE,
  ONE_TOKEN,
} from "../helpers/constants";

describe("AMM - Errors - Validation Errors", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("InvalidAmount", () => {
    it("swap with zero input fails with InvalidAmount", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Attempt swap with zero input
      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        0, // Zero input
        0
      );

      await expectAnchorError(builder.rpc(), "InvalidAmount");
    });

    it("add zero liquidity fails with InvalidAmount", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPool(client, wallet, mintA, mintB);

      // Attempt to add zero liquidity
      const builder = await client.addLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        0, // Zero amount A
        0 // Zero amount B
      );

      await expectAnchorError(builder.rpc(), "InvalidAmount");
    });

    it("remove zero liquidity fails with InvalidAmount", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Attempt to remove zero liquidity
      const builder = await client.removeLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        0, // Zero amount A
        0 // Zero amount B
      );

      await expectAnchorError(builder.rpc(), "InvalidAmount");
    });
  });

  describe("InvalidFee", () => {
    it("create pool with fee > MAX_FEE fails with InvalidFee", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      const invalidFee = MAX_FEE + 1; // 50.01%

      const { builder } = client.createPool(
        wallet.publicKey,
        wallet.publicKey,
        mintA,
        mintB,
        invalidFee,
        new BN("1000000000000"),
        new BN("100000000000"),
        0,
        null
      );

      await expectAnchorError(builder.rpc(), "InvalidFee");
    });
  });

  describe("SlippageExceeded", () => {
    it("output less than min_output_amount fails with SlippageExceeded", async () => {
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
        new BN(INITIAL_LIQUIDITY),
        new BN(INITIAL_LIQUIDITY),
        DEFAULT_FEE
      );

      // Set min output higher than actual output
      const tooHighMinOutput = outputAmount.add(new BN(ONE_TOKEN));

      const builder = await client.swap(
        wallet.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        tooHighMinOutput
      );

      await expectAnchorError(builder.rpc(), "SlippageExceeded");
    });
  });

  describe("InsufficientReserve", () => {
    it("remove more than available fails with InsufficientReserve", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Attempt to remove more than available
      const tooMuch = INITIAL_LIQUIDITY + ONE_TOKEN;
      const builder = await client.removeLiquidity(
        wallet.publicKey,
        ctx.poolPda,
        tooMuch,
        tooMuch
      );

      await expectAnchorError(builder.rpc(), "InsufficientReserve");
    });
  });
});
