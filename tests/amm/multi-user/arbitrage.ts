import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";

import { computeSwapOutput } from "../../../sdk/src";
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
  INITIAL_LIQUIDITY,
  SWAP_AMOUNT,
  FUNDING_AMOUNT,
  ONE_TOKEN,
  DEFAULT_FEE,
  ZERO_FEE,
} from "../helpers/constants";

describe("AMM - Multi-User - Arbitrage", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("Arbitrage Scenarios", () => {
    it("large swap creates arbitrage opportunity", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY,
        { fee: ZERO_FEE } // Zero fee for clearer arbitrage
      );

      // Create whale and arbitrageur
      const whale = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const arbitrageur = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );

      const whaleClient = createUserClient(provider, whale.keypair);
      const arbClient = createUserClient(provider, arbitrageur.keypair);

      // Get initial price
      const priceBefore = await client.fetchSpotPrice(ctx.poolPda);

      // Whale makes large swap A→B, moving price significantly
      const largeSwap = ONE_TOKEN * 50; // 50 tokens
      const whaleBuilder = await whaleClient.swap(
        whale.keypair.publicKey,
        ctx.poolPda,
        true, // A→B
        largeSwap,
        1 // min_output > 0 required
      );
      await whaleBuilder.rpc();

      // Price has moved - B is now cheaper relative to A
      const priceAfterWhale = await client.fetchSpotPrice(ctx.poolPda);
      expect(priceAfterWhale.gt(priceBefore)).to.be.true;

      // Arbitrageur can now buy A with B at a discount
      const arbSwap = ONE_TOKEN * 10;
      const arbBuilder = await arbClient.swap(
        arbitrageur.keypair.publicKey,
        ctx.poolPda,
        false, // B→A (opposite direction)
        arbSwap,
        1 // min_output > 0 required
      );
      await arbBuilder.rpc();

      // Price should move back toward equilibrium
      const priceAfterArb = await client.fetchSpotPrice(ctx.poolPda);
      expect(priceAfterArb.lt(priceAfterWhale)).to.be.true;
    });

    it("arbitrageur profits from price deviation", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(
        client,
        wallet,
        mintA,
        mintB,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY,
        { fee: ZERO_FEE }
      );

      // Create whale and arbitrageur
      const whale = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const arbitrageur = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );

      const whaleClient = createUserClient(provider, whale.keypair);
      const arbClient = createUserClient(provider, arbitrageur.keypair);

      // Track arbitrageur's initial balances
      const arbABefore = await getAccount(
        provider.connection,
        arbitrageur.mintAAta
      );
      const arbBBefore = await getAccount(
        provider.connection,
        arbitrageur.mintBAta
      );

      // Whale makes large swap A→B
      const whaleBuilder = await whaleClient.swap(
        whale.keypair.publicKey,
        ctx.poolPda,
        true,
        ONE_TOKEN * 30,
        1 // min_output > 0 required
      );
      await whaleBuilder.rpc();

      // Arbitrageur swaps B→A (buying discounted A)
      const arbSwap = ONE_TOKEN * 5;
      const arbBuilder = await arbClient.swap(
        arbitrageur.keypair.publicKey,
        ctx.poolPda,
        false, // B→A
        arbSwap,
        1 // min_output > 0 required
      );
      await arbBuilder.rpc();

      // Check arbitrageur's balances
      const arbAAfter = await getAccount(
        provider.connection,
        arbitrageur.mintAAta
      );
      const arbBAfter = await getAccount(
        provider.connection,
        arbitrageur.mintBAta
      );

      // Arbitrageur should have more A (received) and less B (spent)
      expect(
        new BN(arbAAfter.amount.toString()).gt(
          new BN(arbABefore.amount.toString())
        )
      ).to.be.true;
      expect(
        new BN(arbBAfter.amount.toString()).lt(
          new BN(arbBBefore.amount.toString())
        )
      ).to.be.true;
    });

    it("fees affect arbitrage profitability", async () => {
      // Create two pools with different fees
      const mintA1 = await createTestMint(provider, wallet);
      const mintB1 = await createTestMint(provider, wallet);
      const mintA2 = await createTestMint(provider, wallet);
      const mintB2 = await createTestMint(provider, wallet);

      await fundOwnerWallet(provider, wallet, mintA1);
      await fundOwnerWallet(provider, wallet, mintB1);
      await fundOwnerWallet(provider, wallet, mintA2);
      await fundOwnerWallet(provider, wallet, mintB2);

      // Pool 1: Zero fee
      const pool1 = await createPoolWithLiquidity(
        client,
        wallet,
        mintA1,
        mintB1,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY,
        { fee: ZERO_FEE }
      );

      // Pool 2: Default fee (0.3%)
      const pool2 = await createPoolWithLiquidity(
        client,
        wallet,
        mintA2,
        mintB2,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY,
        { fee: DEFAULT_FEE }
      );

      // Create traders for each pool
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

      const client1 = createUserClient(provider, trader1.keypair);
      const client2 = createUserClient(provider, trader2.keypair);

      // Same swap on both pools
      const swapAmount = ONE_TOKEN * 10;

      // Get quotes to compare outputs
      const quote1 = await client.quote(pool1.poolPda, true, swapAmount, 0);
      const quote2 = await client.quote(pool2.poolPda, true, swapAmount, 0);

      // Zero fee pool should give more output
      expect(quote1.outputAmount.gt(quote2.outputAmount)).to.be.true;

      // Execute swaps
      const builder1 = await client1.swap(
        trader1.keypair.publicKey,
        pool1.poolPda,
        true,
        swapAmount,
        1 // min_output > 0 required
      );
      await builder1.rpc();

      const builder2 = await client2.swap(
        trader2.keypair.publicKey,
        pool2.poolPda,
        true,
        swapAmount,
        1 // min_output > 0 required
      );
      await builder2.rpc();

      // Verify fee difference
      expect(quote1.feeAmount.toString()).to.equal("0");
      expect(quote2.feeAmount.gt(new BN(0))).to.be.true;
    });
  });
});
