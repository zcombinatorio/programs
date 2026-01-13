import { expect } from "chai";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createStakingVault,
  getNextNonce,
  expectStakingConfig,
  DEFAULT_UNSTAKING_PERIOD,
  DEFAULT_VOLUME_WINDOW,
  FUNDING_AMOUNT,
} from "../helpers";

describe("SVault - Happy Path - Initialization", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT);
  });

  describe("Staking Vault Creation", () => {
    it("creates staking vault with default parameters", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await expectStakingConfig(client, ctx.configPda, {
        admin: wallet.publicKey,
        tokenMint,
        unstakingPeriod: DEFAULT_UNSTAKING_PERIOD,
        volumeWindow: DEFAULT_VOLUME_WINDOW,
        totalStaked: 0,
      });
    });

    it("creates staking vault with custom unstaking period", async () => {
      const customUnstakingPeriod = 7; // 7 days

      const ctx = await createStakingVault(client, wallet, tokenMint, {
        unstakingPeriod: customUnstakingPeriod,
      });

      await expectStakingConfig(client, ctx.configPda, {
        unstakingPeriod: customUnstakingPeriod,
      });
    });

    it("creates staking vault with custom volume window", async () => {
      const customVolumeWindow = 30; // 30 days

      const ctx = await createStakingVault(client, wallet, tokenMint, {
        volumeWindow: customVolumeWindow,
      });

      await expectStakingConfig(client, ctx.configPda, {
        volumeWindow: customVolumeWindow,
      });
    });

    it("creates staking vault with zero unstaking period", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint, {
        unstakingPeriod: 0,
      });

      await expectStakingConfig(client, ctx.configPda, {
        unstakingPeriod: 0,
      });
    });

    it("creates multiple vaults for same mint with different nonces", async () => {
      const nonce1 = getNextNonce();
      const nonce2 = getNextNonce();

      const ctx1 = await createStakingVault(client, wallet, tokenMint, {
        nonce: nonce1,
      });
      const ctx2 = await createStakingVault(client, wallet, tokenMint, {
        nonce: nonce2,
      });

      expect(ctx1.configPda.toString()).to.not.equal(ctx2.configPda.toString());

      await expectStakingConfig(client, ctx1.configPda, {
        tokenMint,
      });
      await expectStakingConfig(client, ctx2.configPda, {
        tokenMint,
      });
    });

    it("initializes vault with correct PDAs", async () => {
      const nonce = getNextNonce();
      const { builder, configPda } = client.initializeStakingVault(
        wallet.publicKey,
        tokenMint,
        DEFAULT_UNSTAKING_PERIOD,
        DEFAULT_VOLUME_WINDOW,
        nonce
      );
      await builder.rpc();

      // Verify PDAs are derivable
      const [derivedConfig] = client.deriveStakingConfigPDA(tokenMint, nonce);
      expect(configPda.toString()).to.equal(derivedConfig.toString());

      // Verify stake and reward vaults exist
      const [stakeVault] = client.deriveStakeVaultPDA(configPda);
      const [rewardVault] = client.deriveRewardVaultPDA(configPda);

      const config = await client.fetchStakingConfig(configPda);
      expect(config.stakeVault.toString()).to.equal(stakeVault.toString());
      expect(config.rewardVault.toString()).to.equal(rewardVault.toString());
    });
  });
});
