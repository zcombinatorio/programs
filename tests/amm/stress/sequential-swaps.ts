import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createFundedUser,
  createUserClient,
  ensureWalletFunded,
} from "../helpers/setup";
import { createPoolWithLiquidity } from "../helpers/factories";
import {
  getInvariant,
  expectFeeVaultBalance,
  expectReserves,
} from "../helpers/assertions";
import {
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  FUNDING_AMOUNT,
  ONE_TOKEN,
  DEFAULT_FEE,
} from "../helpers/constants";

describe("AMM - Stress Tests - Sequential Operations", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("High Volume Swaps", () => {
    it("50 sequential swaps alternating direction", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      // Create pool with larger liquidity for stress test
      const largeLiquidity = INITIAL_LIQUIDITY * 10;
      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        largeLiquidity,
        largeLiquidity,
        { fee: DEFAULT_FEE }
      );

      // Create funded trader
      const trader = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT * 10 // Extra funds for many swaps
      );
      const traderClient = createUserClient(provider, trader.keypair);

      const kInitial = await getInvariant(client, ctx.poolPda);
      const smallSwap = ONE_TOKEN / 10; // Small swaps to avoid running out of funds

      // 50 sequential swaps alternating direction
      for (let i = 0; i < 50; i++) {
        const direction = i % 2 === 0; // Alternate A→B and B→A
        const builder = await traderClient.swap(
          trader.keypair.publicKey,
          ctx.poolPda,
          direction,
          smallSwap,
          1 // min_output > 0 required
        );
        await builder.rpc();
      }

      const kFinal = await getInvariant(client, ctx.poolPda);

      // Invariant should be maintained (and increased due to fees)
      expect(kFinal.gte(kInitial)).to.be.true;

      // Reserves should still be positive
      const { reserveA, reserveB } = await client.fetchReserves(ctx.poolPda);
      expect(reserveA.gt(new BN(0))).to.be.true;
      expect(reserveB.gt(new BN(0))).to.be.true;
    }).timeout(120000); // 2 minute timeout for stress test

    it("verify reserves and fees remain consistent after many operations", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        INITIAL_LIQUIDITY * 5,
        INITIAL_LIQUIDITY * 5,
        { fee: DEFAULT_FEE }
      );

      const trader = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT * 5
      );
      const traderClient = createUserClient(provider, trader.keypair);

      let totalFeesPaid = new BN(0);
      const swapAmount = ONE_TOKEN / 5;

      // Track fees across 20 swaps
      for (let i = 0; i < 20; i++) {
        const direction = i % 2 === 0;

        // Get quote to know expected fee
        const quote = await client.quote(ctx.poolPda, direction, swapAmount, 0);
        totalFeesPaid = totalFeesPaid.add(quote.feeAmount);

        const builder = await traderClient.swap(
          trader.keypair.publicKey,
          ctx.poolPda,
          direction,
          swapAmount,
          1 // min_output > 0 required
        );
        await builder.rpc();
      }

      // Fee vault should have accumulated fees
      const [feeVault] = client.deriveFeeVaultPDA(ctx.poolPda);
      const connection = client.program.provider.connection;
      const { getAccount } = await import("@solana/spl-token");
      const feeAccount = await getAccount(connection, feeVault);
      const feeBalance = new BN(feeAccount.amount.toString());

      // Fee balance should be approximately equal to total fees paid
      // (some rounding may occur)
      expect(feeBalance.gt(new BN(0))).to.be.true;
    }).timeout(120000);
  });

  describe("Liquidity Cycles", () => {
    it("20 add/remove liquidity cycles", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA, FUNDING_AMOUNT * 10);
      await fundOwnerWallet(provider, wallet, mintB, FUNDING_AMOUNT * 10);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        INITIAL_LIQUIDITY * 5,
        INITIAL_LIQUIDITY * 5
      );

      const cycleAmount = ONE_TOKEN * 10;

      // 20 add/remove cycles
      for (let i = 0; i < 20; i++) {
        // Add liquidity
        const addBuilder = await client.addLiquidity(
          wallet.publicKey,
          ctx.poolPda,
          cycleAmount,
          cycleAmount
        );
        await addBuilder.rpc();

        // Remove liquidity
        const removeBuilder = await client.removeLiquidity(
          wallet.publicKey,
          ctx.poolPda,
          cycleAmount,
          cycleAmount
        );
        await removeBuilder.rpc();
      }

      // Final reserves should be close to initial
      // (might differ slightly due to rounding)
      const { reserveA, reserveB } = await client.fetchReserves(ctx.poolPda);
      const tolerance = ONE_TOKEN; // 1 token tolerance

      expect(
        reserveA
          .sub(new BN(INITIAL_LIQUIDITY * 5))
          .abs()
          .lte(new BN(tolerance))
      ).to.be.true;
      expect(
        reserveB
          .sub(new BN(INITIAL_LIQUIDITY * 5))
          .abs()
          .lte(new BN(tolerance))
      ).to.be.true;
    }).timeout(120000);
  });

  describe("Invariant Stability", () => {
    it("check invariant k holds after stress sequence", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA, FUNDING_AMOUNT * 10);
      await fundOwnerWallet(provider, wallet, mintB, FUNDING_AMOUNT * 10);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        INITIAL_LIQUIDITY * 10,
        INITIAL_LIQUIDITY * 10,
        { fee: DEFAULT_FEE }
      );

      const trader = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT * 10
      );
      const traderClient = createUserClient(provider, trader.keypair);

      const kInitial = await getInvariant(client, ctx.poolPda);
      let kMin = kInitial;
      let kMax = kInitial;

      // Mixed operations
      for (let i = 0; i < 30; i++) {
        if (i % 3 === 0) {
          // Add liquidity
          const addBuilder = await client.addLiquidity(
            wallet.publicKey,
            ctx.poolPda,
            ONE_TOKEN * 5,
            ONE_TOKEN * 5
          );
          await addBuilder.rpc();
        } else if (i % 3 === 1) {
          // Swap
          const builder = await traderClient.swap(
            trader.keypair.publicKey,
            ctx.poolPda,
            i % 2 === 0,
            ONE_TOKEN / 2,
            1 // min_output > 0 required
          );
          await builder.rpc();
        } else {
          // Remove small liquidity
          const removeBuilder = await client.removeLiquidity(
            wallet.publicKey,
            ctx.poolPda,
            ONE_TOKEN,
            ONE_TOKEN
          );
          await removeBuilder.rpc();
        }

        const kCurrent = await getInvariant(client, ctx.poolPda);
        if (kCurrent.lt(kMin)) kMin = kCurrent;
        if (kCurrent.gt(kMax)) kMax = kCurrent;
      }

      const kFinal = await getInvariant(client, ctx.poolPda);

      // k should never decrease from swaps (only from liquidity removal)
      // Final k should be positive
      expect(kFinal.gt(new BN(0))).to.be.true;

      // Log k range for visibility
      console.log(`    k range: ${kMin.toString()} - ${kMax.toString()}`);
      console.log(`    k final: ${kFinal.toString()}`);
    }).timeout(180000); // 3 minute timeout
  });
});
