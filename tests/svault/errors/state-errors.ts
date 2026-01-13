import { expect } from "chai";
import { createHash } from "crypto";
import { BN } from "@coral-xyz/anchor";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createStakingVault,
  expectAnchorError,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
  REWARD_AMOUNT,
  DEFAULT_UNSTAKING_PERIOD,
} from "../helpers";

function hashLeaf(user: string, amount: number): Buffer {
  return createHash("sha256")
    .update(Buffer.from(user.replace("0x", ""), "hex"))
    .update(Buffer.from(new BN(amount).toArray("le", 8)))
    .digest();
}

describe("SVault - Errors - State", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT * 10);
  });

  describe("Withdraw - Unstaking Period", () => {
    it("rejects withdraw before unstaking period elapsed", async () => {
      // Create vault with non-zero unstaking period
      const ctx = await createStakingVault(client, wallet, tokenMint, {
        unstakingPeriod: 7, // 7 days
      });

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      await client
        .initiateUnstake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Try to withdraw immediately (should fail)
      await expectAnchorError(
        client.withdraw(wallet.publicKey, tokenMint, ctx.nonce).rpc(),
        "UnstakingPeriodNotElapsed"
      );
    });

    it("rejects withdraw when no pending unstake", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint, {
        unstakingPeriod: 0,
      });

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Try to withdraw without initiating unstake
      await expectAnchorError(
        client.withdraw(wallet.publicKey, tokenMint, ctx.nonce).rpc(),
        "NoPendingUnstake"
      );
    });
  });

  describe("Claim Rewards - Merkle Proof", () => {
    it("rejects claim with invalid merkle proof", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Create valid merkle root
      const leaf = hashLeaf(
        wallet.publicKey.toBuffer().toString("hex"),
        REWARD_AMOUNT
      );

      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(leaf),
          REWARD_AMOUNT
        )
        .rpc();

      // Try to claim with wrong amount (invalid proof)
      const wrongAmount = REWARD_AMOUNT * 2;
      const fakeProof: number[][] = [];

      await expectAnchorError(
        client
          .claimRewards(
            wallet.publicKey,
            tokenMint,
            ctx.nonce,
            wrongAmount,
            fakeProof
          )
          .rpc(),
        "InvalidMerkleProof"
      );
    });

    it("rejects claim when nothing to claim", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Create merkle tree and post rewards
      const cumulativeAmount = REWARD_AMOUNT;
      const leaf = hashLeaf(
        wallet.publicKey.toBuffer().toString("hex"),
        cumulativeAmount
      );

      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(leaf),
          REWARD_AMOUNT
        )
        .rpc();

      // First claim should succeed
      await client
        .claimRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          cumulativeAmount,
          []
        )
        .rpc();

      // Second claim with same cumulative should fail (nothing new to claim)
      await expectAnchorError(
        client
          .claimRewards(
            wallet.publicKey,
            tokenMint,
            ctx.nonce,
            cumulativeAmount,
            []
          )
          .rpc(),
        "NothingToClaim"
      );
    });
  });
});
