import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createFundedUser,
  createUserClient,
  ensureWalletFunded,
} from "../helpers/setup";
import { createPool, createPoolWithLiquidity } from "../helpers/factories";
import { expectAnchorError } from "../helpers/assertions";
import { INITIAL_LIQUIDITY, FUNDING_AMOUNT } from "../helpers/constants";

describe("AMM - Errors - Authorization Errors", () => {
  const { provider, wallet, client } = getTestContext();

  beforeEach(async () => {
    await ensureWalletFunded(provider, wallet);
  });

  describe("InvalidAdmin", () => {
    it("non-admin calling cease_trading fails with InvalidAdmin", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Create a different user
      const nonAdmin = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const nonAdminClient = createUserClient(provider, nonAdmin.keypair);

      // Attempt to cease trading as non-admin should fail
      await expectAnchorError(
        nonAdminClient.ceaseTrading(nonAdmin.keypair.publicKey, ctx.poolPda).rpc(),
        "InvalidAdmin"
      );
    });
  });

  describe("Liquidity Provider Authorization", () => {
    it("wrong signer adds liquidity fails", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      // Create pool with specific liquidity provider (wallet)
      const ctx = await createPool(client, wallet, mintA, mintB);

      // Create a different user who is NOT the liquidity provider
      const wrongUser = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const wrongUserClient = createUserClient(provider, wrongUser.keypair);

      // Attempt to add liquidity as wrong user should fail
      const builder = await wrongUserClient.addLiquidity(
        wrongUser.keypair.publicKey,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      await expectAnchorError(builder.rpc(), "InvalidAdmin");
    });

    it("wrong signer removes liquidity fails", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, mintA);
      await fundOwnerWallet(provider, wallet, mintB);

      // Create pool with liquidity (wallet is LP)
      const ctx = await createPoolWithLiquidity(client, wallet, mintA, mintB);

      // Create a different user who is NOT the liquidity provider
      const wrongUser = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const wrongUserClient = createUserClient(provider, wrongUser.keypair);

      // Attempt to remove liquidity as wrong user should fail
      const builder = await wrongUserClient.removeLiquidity(
        wrongUser.keypair.publicKey,
        ctx.poolPda,
        INITIAL_LIQUIDITY / 2,
        INITIAL_LIQUIDITY / 2
      );

      await expectAnchorError(builder.rpc(), "InvalidAdmin");
    });

    it("designated liquidity provider can add liquidity", async () => {
      const mintA = await createTestMint(provider, wallet);
      const mintB = await createTestMint(provider, wallet);

      // Create funded user to be the designated LP
      const designatedLP = await createFundedUser(
        provider,
        wallet,
        mintA,
        mintB,
        FUNDING_AMOUNT
      );
      const lpClient = createUserClient(provider, designatedLP.keypair);

      // Create pool with designated LP
      const ctx = await createPool(client, wallet, mintA, mintB, {
        liquidityProvider: designatedLP.keypair.publicKey,
      });

      // Designated LP should be able to add liquidity
      const builder = await lpClient.addLiquidity(
        designatedLP.keypair.publicKey,
        ctx.poolPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      // This should succeed
      await builder.rpc();
    });
  });
});
