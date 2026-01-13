import { expect } from "chai";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  getTokenBalance,
  createStakingVault,
  createVaultWithZeroUnstakingPeriod,
  expectUserStake,
  expectTotalStaked,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
  SMALL_STAKE,
} from "../helpers";

describe("SVault - Multi-User - Concurrent Staking", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT * 10);
  });

  describe("Multiple Operations", () => {
    it("handles multiple stake operations from same user", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // First stake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT,
      });

      // Second stake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT * 2)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT * 3,
      });

      // Third stake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      const expectedTotal = STAKE_AMOUNT * 3 + SMALL_STAKE;
      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: expectedTotal,
      });
      await expectTotalStaked(client, ctx.configPda, expectedTotal);
    });

    it("handles interleaved stake and unstake operations", async () => {
      const ctx = await createVaultWithZeroUnstakingPeriod(
        client,
        wallet,
        tokenMint
      );

      // Initial stake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT,
        pendingUnstake: 0,
      });

      // Partial unstake
      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT - SMALL_STAKE,
        pendingUnstake: SMALL_STAKE,
      });

      // Stake more while having pending unstake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT - SMALL_STAKE + STAKE_AMOUNT,
        pendingUnstake: SMALL_STAKE,
      });

      // Withdraw the pending unstake
      await client.withdraw(wallet.publicKey, tokenMint, ctx.nonce).rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT * 2 - SMALL_STAKE,
        pendingUnstake: 0,
      });
    });
  });

  describe("Complete Lifecycle", () => {
    it("handles full stake -> unstake -> withdraw -> restake cycle", async () => {
      const ctx = await createVaultWithZeroUnstakingPeriod(
        client,
        wallet,
        tokenMint
      );

      // First cycle: stake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT,
        pendingUnstake: 0,
      });
      await expectTotalStaked(client, ctx.configPda, STAKE_AMOUNT);

      // Initiate unstake
      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: 0,
        pendingUnstake: STAKE_AMOUNT,
      });

      // Withdraw
      await client.withdraw(wallet.publicKey, tokenMint, ctx.nonce).rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: 0,
        pendingUnstake: 0,
      });

      // Second cycle: restake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT * 2)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT * 2,
        pendingUnstake: 0,
      });
      await expectTotalStaked(client, ctx.configPda, STAKE_AMOUNT * 2);
    });
  });
});
