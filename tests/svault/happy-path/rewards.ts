import { expect } from "chai";
import { createHash } from "crypto";
import { BN } from "@coral-xyz/anchor";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  getTokenBalance,
  createStakingVault,
  expectUserStake,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
  REWARD_AMOUNT,
} from "../helpers";

/**
 * Simple merkle tree implementation for testing
 */
function hashLeaf(user: string, amount: number): Buffer {
  return createHash("sha256")
    .update(Buffer.from(user.replace("0x", ""), "hex"))
    .update(Buffer.from(new BN(amount).toArray("le", 8)))
    .digest();
}

function hashPair(left: Buffer, right: Buffer): Buffer {
  // Sort to ensure consistent ordering
  const sorted = Buffer.compare(left, right) < 0 ? [left, right] : [right, left];
  return createHash("sha256")
    .update(sorted[0])
    .update(sorted[1])
    .digest();
}

function buildMerkleTree(leaves: Buffer[]): { root: Buffer; layers: Buffer[][] } {
  if (leaves.length === 0) {
    throw new Error("Cannot build tree with no leaves");
  }

  const layers: Buffer[][] = [leaves];

  while (layers[layers.length - 1].length > 1) {
    const currentLayer = layers[layers.length - 1];
    const nextLayer: Buffer[] = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        nextLayer.push(hashPair(currentLayer[i], currentLayer[i + 1]));
      } else {
        // Odd number of leaves, promote to next level
        nextLayer.push(currentLayer[i]);
      }
    }
    layers.push(nextLayer);
  }

  return { root: layers[layers.length - 1][0], layers };
}

function getProof(
  layers: Buffer[][],
  leafIndex: number
): number[][] {
  const proof: number[][] = [];
  let index = leafIndex;

  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;

    if (siblingIndex < layer.length) {
      proof.push(Array.from(layer[siblingIndex]));
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

describe("SVault - Happy Path - Rewards", () => {
  const { provider, wallet, client } = getTestContext();
  let tokenMint;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT * 10);
  });

  describe("Post Rewards", () => {
    it("posts rewards with merkle root", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Create a simple merkle tree with one user
      const leaf = hashLeaf(wallet.publicKey.toBuffer().toString("hex"), REWARD_AMOUNT);
      const { root } = buildMerkleTree([leaf]);

      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root),
          REWARD_AMOUNT
        )
        .rpc();

      const config = await client.fetchStakingConfig(ctx.configPda);
      expect(config.currentMerkleRoot).to.deep.equal(Array.from(root));
    });

    it("transfers reward tokens to reward vault", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);
      const [rewardVault] = client.deriveRewardVaultPDA(ctx.configPda);

      const leaf = hashLeaf(wallet.publicKey.toBuffer().toString("hex"), REWARD_AMOUNT);
      const { root } = buildMerkleTree([leaf]);

      const vaultBalanceBefore = await getTokenBalance(provider, rewardVault);

      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root),
          REWARD_AMOUNT
        )
        .rpc();

      const vaultBalanceAfter = await getTokenBalance(provider, rewardVault);
      expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(REWARD_AMOUNT);
    });

    it("updates last_updated_at timestamp", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      const leaf = hashLeaf(wallet.publicKey.toBuffer().toString("hex"), REWARD_AMOUNT);
      const { root } = buildMerkleTree([leaf]);

      // Allow for clock drift - use a buffer before the transaction
      const beforeTimestamp = Math.floor(Date.now() / 1000) - 5;

      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root),
          REWARD_AMOUNT
        )
        .rpc();

      const config = await client.fetchStakingConfig(ctx.configPda);
      const afterTimestamp = Math.floor(Date.now() / 1000) + 5;

      expect(config.lastUpdatedAt.toNumber()).to.be.at.least(beforeTimestamp);
      expect(config.lastUpdatedAt.toNumber()).to.be.at.most(afterTimestamp);
    });
  });

  describe("Claim Rewards", () => {
    it("claims rewards with valid merkle proof", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Stake first
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Create merkle tree with the user's cumulative reward
      const cumulativeAmount = REWARD_AMOUNT;
      const leaf = hashLeaf(
        wallet.publicKey.toBuffer().toString("hex"),
        cumulativeAmount
      );
      const { root, layers } = buildMerkleTree([leaf]);
      const proof = getProof(layers, 0);

      // Post rewards
      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root),
          REWARD_AMOUNT
        )
        .rpc();

      // Claim rewards
      await client
        .claimRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          cumulativeAmount,
          proof
        )
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        totalClaimed: cumulativeAmount,
      });
    });

    it("transfers claimed tokens from reward vault to user", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);
      const [rewardVault] = client.deriveRewardVaultPDA(ctx.configPda);

      // Stake first
      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // Create merkle tree
      const cumulativeAmount = REWARD_AMOUNT;
      const leaf = hashLeaf(
        wallet.publicKey.toBuffer().toString("hex"),
        cumulativeAmount
      );
      const { root, layers } = buildMerkleTree([leaf]);
      const proof = getProof(layers, 0);

      // Post rewards
      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root),
          REWARD_AMOUNT
        )
        .rpc();

      const vaultBalanceBefore = await getTokenBalance(provider, rewardVault);

      // Claim rewards
      await client
        .claimRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          cumulativeAmount,
          proof
        )
        .rpc();

      const vaultBalanceAfter = await getTokenBalance(provider, rewardVault);
      // Vault should have decreased by claimed amount
      expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(cumulativeAmount);
    });

    it("claims partial amount when already claimed some", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client
        .stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT)
        .rpc();

      // First claim
      const firstCumulative = REWARD_AMOUNT / 2;
      const leaf1 = hashLeaf(
        wallet.publicKey.toBuffer().toString("hex"),
        firstCumulative
      );
      const { root: root1, layers: layers1 } = buildMerkleTree([leaf1]);
      const proof1 = getProof(layers1, 0);

      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root1),
          firstCumulative
        )
        .rpc();

      await client
        .claimRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          firstCumulative,
          proof1
        )
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        totalClaimed: firstCumulative,
      });

      // Second claim with increased cumulative
      const secondCumulative = REWARD_AMOUNT;
      const leaf2 = hashLeaf(
        wallet.publicKey.toBuffer().toString("hex"),
        secondCumulative
      );
      const { root: root2, layers: layers2 } = buildMerkleTree([leaf2]);
      const proof2 = getProof(layers2, 0);

      // Post additional rewards
      await client
        .postRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          Array.from(root2),
          REWARD_AMOUNT / 2
        )
        .rpc();

      await client
        .claimRewards(
          wallet.publicKey,
          tokenMint,
          ctx.nonce,
          secondCumulative,
          proof2
        )
        .rpc();

      await expectUserStake(client, tokenMint, ctx.nonce, wallet.publicKey, {
        totalClaimed: secondCumulative,
      });
    });
  });
});
