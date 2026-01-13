import { expect } from "chai";
import { Keypair } from "@solana/web3.js";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createStakingVault,
  expectDelegate,
  expectDelegateNotExists,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
} from "../helpers";

describe("SVault - Happy Path - Delegation", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT);
  });

  describe("Add Delegate", () => {
    it("adds a delegate successfully", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // First stake so user has a UserStake account
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const delegateKeypair = Keypair.generate();

      await client
        .addDelegate(
          wallet.publicKey,
          delegateKeypair.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegateKeypair])
        .rpc();

      await expectDelegate(
        client,
        ctx.configPda,
        delegateKeypair.publicKey,
        wallet.publicKey
      );
    });

    it("adds multiple delegates for same staker", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const delegate1 = Keypair.generate();
      const delegate2 = Keypair.generate();

      await client
        .addDelegate(
          wallet.publicKey,
          delegate1.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegate1])
        .rpc();

      await client
        .addDelegate(
          wallet.publicKey,
          delegate2.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegate2])
        .rpc();

      await expectDelegate(
        client,
        ctx.configPda,
        delegate1.publicKey,
        wallet.publicKey
      );
      await expectDelegate(
        client,
        ctx.configPda,
        delegate2.publicKey,
        wallet.publicKey
      );
    });
  });

  describe("Remove Delegate", () => {
    it("removes a delegate successfully", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const delegateKeypair = Keypair.generate();

      // Add delegate
      await client
        .addDelegate(
          wallet.publicKey,
          delegateKeypair.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegateKeypair])
        .rpc();

      // Verify delegate exists
      await expectDelegate(
        client,
        ctx.configPda,
        delegateKeypair.publicKey,
        wallet.publicKey
      );

      // Remove delegate
      await client
        .removeDelegate(
          wallet.publicKey,
          delegateKeypair.publicKey,
          tokenMint,
          ctx.nonce
        )
        .rpc();

      // Verify delegate no longer exists
      await expectDelegateNotExists(
        client,
        ctx.configPda,
        delegateKeypair.publicKey
      );
    });

    it("can add same delegate again after removal", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const delegateKeypair = Keypair.generate();

      // Add delegate
      await client
        .addDelegate(
          wallet.publicKey,
          delegateKeypair.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegateKeypair])
        .rpc();

      // Remove delegate
      await client
        .removeDelegate(
          wallet.publicKey,
          delegateKeypair.publicKey,
          tokenMint,
          ctx.nonce
        )
        .rpc();

      // Add delegate again
      await client
        .addDelegate(
          wallet.publicKey,
          delegateKeypair.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegateKeypair])
        .rpc();

      await expectDelegate(
        client,
        ctx.configPda,
        delegateKeypair.publicKey,
        wallet.publicKey
      );
    });
  });

  describe("Delegate Relationships", () => {
    it("same staker can manage multiple delegates independently", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      const delegate1 = Keypair.generate();
      const delegate2 = Keypair.generate();
      const delegate3 = Keypair.generate();

      // Add three delegates
      await client
        .addDelegate(
          wallet.publicKey,
          delegate1.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegate1])
        .rpc();

      await client
        .addDelegate(
          wallet.publicKey,
          delegate2.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegate2])
        .rpc();

      await client
        .addDelegate(
          wallet.publicKey,
          delegate3.publicKey,
          tokenMint,
          ctx.nonce
        )
        .signers([delegate3])
        .rpc();

      // Verify all delegates exist
      await expectDelegate(
        client,
        ctx.configPda,
        delegate1.publicKey,
        wallet.publicKey
      );
      await expectDelegate(
        client,
        ctx.configPda,
        delegate2.publicKey,
        wallet.publicKey
      );
      await expectDelegate(
        client,
        ctx.configPda,
        delegate3.publicKey,
        wallet.publicKey
      );

      // Remove middle delegate
      await client
        .removeDelegate(
          wallet.publicKey,
          delegate2.publicKey,
          tokenMint,
          ctx.nonce
        )
        .rpc();

      // Verify delegate1 and delegate3 still exist
      await expectDelegate(
        client,
        ctx.configPda,
        delegate1.publicKey,
        wallet.publicKey
      );
      await expectDelegateNotExists(client, ctx.configPda, delegate2.publicKey);
      await expectDelegate(
        client,
        ctx.configPda,
        delegate3.publicKey,
        wallet.publicKey
      );
    });
  });
});
