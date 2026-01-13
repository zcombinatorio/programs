import { expect } from "chai";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createStakingVault,
  ensureFeeVaultExists,
  expectAnchorError,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
  SMALL_STAKE,
} from "../helpers";

describe("SVault - Errors - Validation", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT);
    // Ensure fee vault exists for slash tests
    await ensureFeeVaultExists(provider, wallet, tokenMint);
  });

  describe("Stake - Invalid Amount", () => {
    it("rejects stake amount of zero", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await expectAnchorError(
        client.stake(wallet.publicKey, tokenMint, ctx.nonce, 0).rpc(),
        "InvalidAmount"
      );
    });
  });

  describe("Initiate Unstake - Invalid Amount", () => {
    it("rejects unstake amount of zero", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectAnchorError(
        client
          .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, 0)
          .rpc(),
        "InvalidAmount"
      );
    });

    it("rejects unstake more than staked amount", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectAnchorError(
        client
          .initiateUnstake(
            wallet.publicKey,
            tokenMint,
            ctx.nonce,
            STAKE_AMOUNT + 1
          )
          .rpc(),
        "InsufficientStake"
      );
    });

    it("rejects unstake when nothing is staked", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Stake and fully unstake first to create account with 0 staked
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      // Now try to unstake more when staked amount is 0
      await expectAnchorError(
        client
          .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, 1)
          .rpc(),
        "InsufficientStake"
      );
    });
  });

  describe("Slash - Invalid Basis Points", () => {
    it("rejects basis points over 10000", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectAnchorError(
        client
          .slash(
            wallet.publicKey,
            tokenMint,
            ctx.nonce,
            wallet.publicKey,
            10001 // Over 100%
          )
          .rpc(),
        "InvalidBasisPoints"
      );
    });
  });
});
