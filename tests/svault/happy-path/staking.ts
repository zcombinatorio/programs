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
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

describe("SVault - Happy Path - Staking", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT);
  });

  describe("Stake", () => {
    it("stakes tokens successfully", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT,
        pendingUnstake: 0,
        totalClaimed: 0,
      });

      await expectTotalStaked(client, ctx.configPda, STAKE_AMOUNT);
    });

    it("stakes multiple times", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      const expectedTotal = STAKE_AMOUNT + SMALL_STAKE;
      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: expectedTotal,
      });
      await expectTotalStaked(client, ctx.configPda, expectedTotal);
    });

    it("transfers tokens to stake vault", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);
      const [stakeVault] = client.deriveStakeVaultPDA(ctx.configPda);

      const vaultBalanceBefore = await getTokenBalance(provider, stakeVault);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const vaultBalanceAfter = await getTokenBalance(provider, stakeVault);
      expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(STAKE_AMOUNT);
    });
  });

  describe("Initiate Unstake", () => {
    it("initiates unstake successfully", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT - SMALL_STAKE,
        pendingUnstake: SMALL_STAKE,
      });
    });

    it("initiates unstake for full amount", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: 0,
        pendingUnstake: STAKE_AMOUNT,
      });
    });

    it("sets unstake initiation timestamp", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Allow for clock drift - use a buffer before the transaction
      const beforeTimestamp = Math.floor(Date.now() / 1000) - 5;

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, SMALL_STAKE)
        .rpc();

      const userStake = await client.fetchUserStakeByMint(
        tokenMint,
        ctx.nonce,
        wallet.publicKey
      );

      const afterTimestamp = Math.floor(Date.now() / 1000) + 5;
      expect(userStake.unstakeInitiatedAt.toNumber()).to.be.at.least(
        beforeTimestamp
      );
      expect(userStake.unstakeInitiatedAt.toNumber()).to.be.at.most(
        afterTimestamp
      );
    });
  });

  describe("Withdraw", () => {
    it("withdraws after zero unstaking period", async () => {
      const ctx = await createVaultWithZeroUnstakingPeriod(
        client,
        wallet,
        tokenMint
      );

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Should be able to withdraw immediately with 0 day unstaking period
      await client.withdraw(wallet.publicKey, tokenMint, ctx.nonce).rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: 0,
        pendingUnstake: 0,
      });
    });

    it("returns tokens to user after withdraw", async () => {
      const ctx = await createVaultWithZeroUnstakingPeriod(
        client,
        wallet,
        tokenMint
      );

      const walletAta = getAssociatedTokenAddressSync(tokenMint, wallet.publicKey);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const balanceAfterStake = await getTokenBalance(provider, walletAta);

      await client
        .initiateUnstake(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          STAKE_AMOUNT
        )
        .rpc();

      await client
        .withdraw(wallet.publicKey, tokenMint, ctx.nonce)
        .rpc();

      const balanceAfterWithdraw = await getTokenBalance(provider, walletAta);
      expect(balanceAfterWithdraw - balanceAfterStake).to.equal(STAKE_AMOUNT);
    });

    it("resets pending unstake after withdraw", async () => {
      const ctx = await createVaultWithZeroUnstakingPeriod(
        client,
        wallet,
        tokenMint
      );

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client.withdraw(wallet.publicKey, tokenMint, ctx.nonce).rpc();

      const userStake = await client.fetchUserStakeByMint(
        tokenMint,
        ctx.nonce,
        wallet.publicKey
      );
      expect(userStake.pendingUnstake.toNumber()).to.equal(0);
      expect(userStake.unstakeInitiatedAt.toNumber()).to.equal(0);
    });
  });

  describe("Full Staking Lifecycle", () => {
    it("completes full stake -> unstake -> withdraw cycle", async () => {
      const ctx = await createVaultWithZeroUnstakingPeriod(
        client,
        wallet,
        tokenMint
      );

      // Stake
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
    });
  });
});
