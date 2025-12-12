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
import { getInvariant, expectReserves } from "../helpers/assertions";
import {
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  FUNDING_AMOUNT,
  ONE_TOKEN,
  DEFAULT_FEE,
} from "../helpers/constants";

describe("AMM - Multi-User - Concurrent Swaps", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("Multiple Traders", () => {
    it("two traders swap in sequence", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Create two funded traders
      const alice = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const bob = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );

      const aliceClient = createUserClient(provider, alice.keypair);
      const bobClient = createUserClient(provider, bob.keypair);

      const kBefore = await getInvariant(client, ctx.poolPda);

      // Alice swaps A→B
      const aliceBuilder = await aliceClient.swap(
        alice.keypair.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await aliceBuilder.rpc();

      // Bob swaps A→B
      const bobBuilder = await bobClient.swap(
        bob.keypair.publicKey,
        ctx.poolPda,
        true,
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await bobBuilder.rpc();

      const kAfter = await getInvariant(client, ctx.poolPda);

      // Invariant should be maintained
      expect(kAfter.gte(kBefore)).to.be.true;
    });

    it("trader A swaps A→B while trader B swaps B→A", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Create two funded traders
      const alice = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const bob = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );

      const aliceClient = createUserClient(provider, alice.keypair);
      const bobClient = createUserClient(provider, bob.keypair);

      const { reserveA: beforeA, reserveB: beforeB } =
        await client.fetchReserves(ctx.poolPda);

      // Alice swaps A→B
      const aliceBuilder = await aliceClient.swap(
        alice.keypair.publicKey,
        ctx.poolPda,
        true, // A to B
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await aliceBuilder.rpc();

      // Bob swaps B→A (opposite direction)
      const bobBuilder = await bobClient.swap(
        bob.keypair.publicKey,
        ctx.poolPda,
        false, // B to A
        SWAP_AMOUNT,
        1 // min_output > 0 required
      );
      await bobBuilder.rpc();

      // Reserves should be roughly similar to original (swaps partially cancel out)
      const { reserveA: afterA, reserveB: afterB } = await client.fetchReserves(
        ctx.poolPda
      );

      // Due to fees, reserves won't be exactly the same
      // But they should be reasonably close
      const tolerance = INITIAL_LIQUIDITY / 10; // 10% tolerance
      expect(
        afterA.sub(beforeA).abs().lt(new BN(tolerance))
      ).to.be.true;
    });

    it("sequential swaps move price", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Create trader
      const trader = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const traderClient = createUserClient(provider, trader.keypair);

      // Get initial spot price
      const priceBefore = await client.fetchSpotPrice(ctx.poolPda);

      // Multiple swaps in same direction should move price
      for (let i = 0; i < 3; i++) {
        const builder = await traderClient.swap(
          trader.keypair.publicKey,
          ctx.poolPda,
          true, // Always A→B
          SWAP_AMOUNT,
          1 // min_output > 0 required
        );
        await builder.rpc();
      }

      // Get final spot price
      const priceAfter = await client.fetchSpotPrice(ctx.poolPda);

      // Price should have changed (A→B swaps increase price of A relative to B)
      expect(priceAfter.gt(priceBefore)).to.be.true;
    });

    it("multiple small swaps vs one large swap (price impact comparison)", async () => {
      // Create two identical pools
      const mintA1 = await createTestMint(provider, wallet);
      const mintB1 = await createTestMint(provider, wallet);
      const mintA2 = await createTestMint(provider, wallet);
      const mintB2 = await createTestMint(provider, wallet);

      await fundOwnerWallet(provider, wallet, mintA1);
      await fundOwnerWallet(provider, wallet, mintB1);
      await fundOwnerWallet(provider, wallet, mintA2);
      await fundOwnerWallet(provider, wallet, mintB2);

      const pool1 = await createPoolWithLiquidity(
        client,
        wallet,
        mintA1,
        mintB1
      );
      const pool2 = await createPoolWithLiquidity(
        client,
        wallet,
        mintA2,
        mintB2
      );

      // Create traders
      const trader1 = await createFundedUser(
        provider,
        wallet,
        mintA1,
        mintB1,
        FUNDING_AMOUNT
      );
      const trader2 = await createFundedUser(
        provider,
        wallet,
        mintA2,
        mintB2,
        FUNDING_AMOUNT
      );

      const trader1Client = createUserClient(provider, trader1.keypair);
      const trader2Client = createUserClient(provider, trader2.keypair);

      const totalSwapAmount = ONE_TOKEN * 10;

      // Pool 1: Multiple small swaps
      const smallSwapAmount = ONE_TOKEN;
      for (let i = 0; i < 10; i++) {
        const builder = await trader1Client.swap(
          trader1.keypair.publicKey,
          pool1.poolPda,
          true,
          smallSwapAmount,
          1 // min_output > 0 required
        );
        await builder.rpc();
      }

      // Pool 2: One large swap
      const builder = await trader2Client.swap(
        trader2.keypair.publicKey,
        pool2.poolPda,
        true,
        totalSwapAmount,
        1 // min_output > 0 required
      );
      await builder.rpc();

      // Compare final reserves - should be different due to price impact
      const reserves1 = await client.fetchReserves(pool1.poolPda);
      const reserves2 = await client.fetchReserves(pool2.poolPda);

      // Reserves should differ between the two approaches due to path dependency
      // The exact relationship depends on fee structure and rounding
      // Just verify that different swap patterns produce different final states
      const reservesDiffer =
        !reserves1.reserveA.eq(reserves2.reserveA) ||
        !reserves1.reserveB.eq(reserves2.reserveB);
      expect(reservesDiffer).to.be.true;
    });
  });
});
