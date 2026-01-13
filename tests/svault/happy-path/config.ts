import { expect } from "chai";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createStakingVault,
  ensureFeeVaultExists,
  expectStakingConfig,
  expectUserStake,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
  SLASH_50_PERCENT,
  SLASH_10_PERCENT,
} from "../helpers";

describe("SVault - Happy Path - Config", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT);
    // Ensure fee vault exists for slash tests
    await ensureFeeVaultExists(provider, wallet, tokenMint);
  });

  describe("Set Config", () => {
    it("updates unstaking period", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      const newUnstakingPeriod = 30; // 30 days

      await client
        .setConfig(wallet.publicKey, tokenMint, ctx.nonce, {
          unstakingPeriod: newUnstakingPeriod,
        })
        .rpc();

      await expectStakingConfig(client, ctx.configPda, {
        unstakingPeriod: newUnstakingPeriod,
      });
    });

    it("updates volume window", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      const newVolumeWindow = 7; // 7 days

      await client
        .setConfig(wallet.publicKey, tokenMint, ctx.nonce, {
          volumeWindow: newVolumeWindow,
        })
        .rpc();

      await expectStakingConfig(client, ctx.configPda, {
        volumeWindow: newVolumeWindow,
      });
    });

    it("updates both parameters at once", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      const newUnstakingPeriod = 14;
      const newVolumeWindow = 21;

      await client
        .setConfig(wallet.publicKey, tokenMint, ctx.nonce, {
          unstakingPeriod: newUnstakingPeriod,
          volumeWindow: newVolumeWindow,
        })
        .rpc();

      await expectStakingConfig(client, ctx.configPda, {
        unstakingPeriod: newUnstakingPeriod,
        volumeWindow: newVolumeWindow,
      });
    });

    it("sets unstaking period to zero", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .setConfig(wallet.publicKey, tokenMint, ctx.nonce, {
          unstakingPeriod: 0,
        })
        .rpc();

      await expectStakingConfig(client, ctx.configPda, {
        unstakingPeriod: 0,
      });
    });
  });

  describe("Slash", () => {
    it("slashes staked amount by 50%", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Stake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Admin slashes 50%
      await client
        .slash(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          wallet.publicKey,
          SLASH_50_PERCENT
        )
        .rpc();

      const expectedStaked = Math.floor(STAKE_AMOUNT * 0.5);
      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: expectedStaked,
      });
    });

    it("slashes staked amount by 10%", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .slash(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          wallet.publicKey,
          SLASH_10_PERCENT
        )
        .rpc();

      const expectedStaked = Math.floor(STAKE_AMOUNT * 0.9);
      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: expectedStaked,
      });
    });

    it("slashes pending unstake amount", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Stake and initiate unstake
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const unstakeAmount = STAKE_AMOUNT / 2;
      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, unstakeAmount)
        .rpc();

      // Admin slashes 50%
      await client
        .slash(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          wallet.publicKey,
          SLASH_50_PERCENT
        )
        .rpc();

      const expectedStaked = Math.floor((STAKE_AMOUNT - unstakeAmount) * 0.5);
      const expectedPending = Math.floor(unstakeAmount * 0.5);

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: expectedStaked,
        pendingUnstake: expectedPending,
      });
    });

    it("slashes with 0 basis points does nothing", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .slash(wallet.publicKey, tokenMint, ctx.nonce, wallet.publicKey, 0)
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: STAKE_AMOUNT,
      });
    });

    it("slashes 100% removes all stake", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .slash(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          wallet.publicKey,
          10000 // 100%
        )
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        stakedAmount: 0,
      });
    });
  });
});
