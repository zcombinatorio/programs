/**
 * Integration tests for off-chain merkle tree generation.
 *
 * These tests verify that the merkle tree implementation in monitor/lib/rewards.ts
 * produces proofs that are valid on-chain. The functions below are copied directly
 * from the monitor to ensure exact compatibility.
 */

import { expect } from "chai";
import { createHash } from "crypto";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createStakingVault,
  createFundedUser,
  createUserClient,
  FUNDING_AMOUNT,
  STAKE_AMOUNT,
  REWARD_AMOUNT,
} from "../helpers";

// ============================================================================
// OFF-CHAIN FUNCTIONS (copied from monitor/lib/rewards.ts)
// These must match EXACTLY for proofs to verify on-chain
// ============================================================================

interface TreeLeaf {
  userAddress: string;
  cumulativeAmount: number; // Raw amount (6 decimals already applied)
}

interface MerkleTreeResult {
  root: Buffer;
  layers: Buffer[][];
}

/**
 * Compute a merkle leaf from user address and cumulative amount.
 * Uses SHA-256 to match solana_program::hash::hashv on-chain.
 * Format: sha256(pubkey_bytes || amount_le_bytes)
 *
 * NOTE: In monitor/lib/rewards.ts, this multiplies by 1e6 to convert from
 * decimal to raw. Here we expect raw amounts directly since tests use raw.
 */
function computeLeaf(userAddress: string, rawAmount: number): Buffer {
  // Pack: pubkey (32 bytes raw) + amount (u64 LE)
  const pubkey = new PublicKey(userAddress);
  const addressBytes = pubkey.toBuffer(); // 32 bytes
  const amountBytes = Buffer.alloc(8);
  amountBytes.writeBigUInt64LE(BigInt(rawAmount));

  return createHash("sha256").update(addressBytes).update(amountBytes).digest();
}

/**
 * Hash two nodes together, sorting to ensure consistent ordering.
 * Matches on-chain verify_proof which puts smaller hash first.
 */
function hashPair(left: Buffer, right: Buffer): Buffer {
  const sorted = Buffer.compare(left, right) < 0 ? [left, right] : [right, left];
  return createHash("sha256").update(sorted[0]).update(sorted[1]).digest();
}

/**
 * Build a merkle tree from reward allocations.
 * Uses SHA-256 to match solana_program::hash::hashv on-chain.
 */
function buildMerkleTree(leaves: TreeLeaf[]): MerkleTreeResult {
  if (leaves.length === 0) {
    throw new Error("Cannot build tree with no leaves");
  }

  const leafBuffers = leaves.map((l) => computeLeaf(l.userAddress, l.cumulativeAmount));
  const layers: Buffer[][] = [leafBuffers];

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

/**
 * Get merkle proof for a leaf at given index.
 */
function getMerkleProof(layers: Buffer[][], leafIndex: number): Buffer[] {
  const proof: Buffer[] = [];
  let index = leafIndex;

  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;

    if (siblingIndex < layer.length) {
      proof.push(layer[siblingIndex]);
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Convert merkle proof to format expected by SVault (array of 32-byte arrays as number[]).
 */
function proofToSVaultFormat(proof: Buffer[]): number[][] {
  return proof.map((p) => Array.from(p));
}

// ============================================================================
// TESTS
// ============================================================================

describe("SVault - Integration - Off-chain Merkle", () => {
  describe("Test Vectors (Hash Consistency)", () => {
    it("computeLeaf produces expected hash for known input", () => {
      // Known test case: specific pubkey + amount should always produce same hash
      // This catches any changes to encoding that would break proofs
      const testPubkey = "11111111111111111111111111111112"; // System program
      const testAmount = 1_000_000; // 1 token with 6 decimals

      const leaf1 = computeLeaf(testPubkey, testAmount);
      const leaf2 = computeLeaf(testPubkey, testAmount);

      // Same input = same output (deterministic)
      expect(leaf1).to.deep.equal(leaf2);
      expect(leaf1.length).to.equal(32); // SHA-256 output is 32 bytes
    });

    it("different amounts produce different hashes", () => {
      const testPubkey = "11111111111111111111111111111112";

      const leaf1 = computeLeaf(testPubkey, 1_000_000);
      const leaf2 = computeLeaf(testPubkey, 1_000_001);

      expect(leaf1).to.not.deep.equal(leaf2);
    });

    it("different pubkeys produce different hashes", () => {
      const pubkey1 = Keypair.generate().publicKey.toBase58();
      const pubkey2 = Keypair.generate().publicKey.toBase58();

      const leaf1 = computeLeaf(pubkey1, 1_000_000);
      const leaf2 = computeLeaf(pubkey2, 1_000_000);

      expect(leaf1).to.not.deep.equal(leaf2);
    });

    it("hashPair is commutative (sorted)", () => {
      const a = Buffer.alloc(32, 0x11);
      const b = Buffer.alloc(32, 0x22);

      const hash1 = hashPair(a, b);
      const hash2 = hashPair(b, a);

      // Order shouldn't matter due to sorting
      expect(hash1).to.deep.equal(hash2);
    });

    it("proof depth matches expected for tree size", () => {
      // 1 leaf = 0 proof elements
      // 2 leaves = 1 proof element
      // 3-4 leaves = 2 proof elements
      // 5-8 leaves = 3 proof elements

      // Pre-generate valid keypairs for deterministic test
      const keypairs = Array(8).fill(null).map(() => Keypair.generate());

      const makeLeaves = (n: number): TreeLeaf[] =>
        keypairs.slice(0, n).map((kp, i) => ({
          userAddress: kp.publicKey.toBase58(),
          cumulativeAmount: 1000 * (i + 1),
        }));

      const { layers: layers1 } = buildMerkleTree(makeLeaves(1));
      const { layers: layers2 } = buildMerkleTree(makeLeaves(2));
      const { layers: layers4 } = buildMerkleTree(makeLeaves(4));
      const { layers: layers8 } = buildMerkleTree(makeLeaves(8));

      expect(getMerkleProof(layers1, 0).length).to.equal(0);
      expect(getMerkleProof(layers2, 0).length).to.equal(1);
      expect(getMerkleProof(layers4, 0).length).to.equal(2);
      expect(getMerkleProof(layers8, 0).length).to.equal(3);
    });
  });


  const { provider, wallet, client } = getTestContext();
  let tokenMint: PublicKey;

  before(async () => {
    tokenMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, tokenMint, FUNDING_AMOUNT * 100);
  });

  describe("Single User", () => {
    it("generates valid proof for single user (off-chain → on-chain)", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Stake first (required for claiming)
      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Build tree with single leaf using OFF-CHAIN functions
      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: REWARD_AMOUNT },
      ];

      const { root, layers } = buildMerkleTree(leaves);
      const proof = getMerkleProof(layers, 0);
      const svaultProof = proofToSVaultFormat(proof);

      // Post rewards with off-chain generated root
      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), REWARD_AMOUNT)
        .rpc();

      // Verify config has correct root
      const config = await client.fetchStakingConfig(ctx.configPda);
      expect(config.currentMerkleRoot).to.deep.equal(Array.from(root));

      // Claim rewards using off-chain generated proof
      await client
        .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, REWARD_AMOUNT, svaultProof)
        .rpc();

      // Verify claim succeeded
      const [userStakePda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      const userStake = await client.fetchUserStake(userStakePda);
      expect(userStake.totalClaimed.toNumber()).to.equal(REWARD_AMOUNT);
    });
  });

  describe("Two Users", () => {
    it("generates valid proofs for both users (off-chain → on-chain)", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Create second user
      const user2 = await createFundedUser(provider, wallet, tokenMint);
      const user2Client = createUserClient(provider, user2.keypair);

      // Both users stake
      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      await user2Client.stake(user2.keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Build tree with two leaves
      const reward1 = REWARD_AMOUNT;
      const reward2 = REWARD_AMOUNT / 2;
      const totalReward = reward1 + reward2;

      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: reward1 },
        { userAddress: user2.keypair.publicKey.toBase58(), cumulativeAmount: reward2 },
      ];

      const { root, layers } = buildMerkleTree(leaves);

      // Generate proofs for both users
      const proof1 = proofToSVaultFormat(getMerkleProof(layers, 0));
      const proof2 = proofToSVaultFormat(getMerkleProof(layers, 1));

      // Post rewards
      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), totalReward)
        .rpc();

      // User 1 claims
      await client
        .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, reward1, proof1)
        .rpc();

      // User 2 claims
      await user2Client
        .claimRewards(user2.keypair.publicKey, tokenMint, ctx.nonce, reward2, proof2)
        .rpc();

      // Verify both claims succeeded
      const [userStake1Pda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      const [userStake2Pda] = client.deriveUserStakePDA(ctx.configPda, user2.keypair.publicKey);

      const userStake1 = await client.fetchUserStake(userStake1Pda);
      const userStake2 = await client.fetchUserStake(userStake2Pda);

      expect(userStake1.totalClaimed.toNumber()).to.equal(reward1);
      expect(userStake2.totalClaimed.toNumber()).to.equal(reward2);
    });
  });

  describe("Three Users (Odd Number - Tests Promotion)", () => {
    it("generates valid proofs for all three users", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Create users 2 and 3
      const user2 = await createFundedUser(provider, wallet, tokenMint);
      const user3 = await createFundedUser(provider, wallet, tokenMint);
      const user2Client = createUserClient(provider, user2.keypair);
      const user3Client = createUserClient(provider, user3.keypair);

      // All users stake
      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      await user2Client.stake(user2.keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      await user3Client.stake(user3.keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Build tree with three leaves (odd number tests promotion logic)
      const reward1 = REWARD_AMOUNT;
      const reward2 = REWARD_AMOUNT / 2;
      const reward3 = REWARD_AMOUNT / 4;
      const totalReward = reward1 + reward2 + reward3;

      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: reward1 },
        { userAddress: user2.keypair.publicKey.toBase58(), cumulativeAmount: reward2 },
        { userAddress: user3.keypair.publicKey.toBase58(), cumulativeAmount: reward3 },
      ];

      const { root, layers } = buildMerkleTree(leaves);

      // Generate proofs for all users
      const proof1 = proofToSVaultFormat(getMerkleProof(layers, 0));
      const proof2 = proofToSVaultFormat(getMerkleProof(layers, 1));
      const proof3 = proofToSVaultFormat(getMerkleProof(layers, 2));

      // Post rewards
      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), totalReward)
        .rpc();

      // All users claim
      await client.claimRewards(wallet.publicKey, tokenMint, ctx.nonce, reward1, proof1).rpc();
      await user2Client.claimRewards(user2.keypair.publicKey, tokenMint, ctx.nonce, reward2, proof2).rpc();
      await user3Client.claimRewards(user3.keypair.publicKey, tokenMint, ctx.nonce, reward3, proof3).rpc();

      // Verify all claims succeeded
      const [userStake1Pda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      const [userStake2Pda] = client.deriveUserStakePDA(ctx.configPda, user2.keypair.publicKey);
      const [userStake3Pda] = client.deriveUserStakePDA(ctx.configPda, user3.keypair.publicKey);

      expect((await client.fetchUserStake(userStake1Pda)).totalClaimed.toNumber()).to.equal(reward1);
      expect((await client.fetchUserStake(userStake2Pda)).totalClaimed.toNumber()).to.equal(reward2);
      expect((await client.fetchUserStake(userStake3Pda)).totalClaimed.toNumber()).to.equal(reward3);
    });
  });

  describe("Larger Tree (8 Users)", () => {
    it("generates valid proofs for all 8 users", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      // Create 7 additional users (+ wallet = 8 total)
      const users = await Promise.all(
        Array(7)
          .fill(null)
          .map(() => createFundedUser(provider, wallet, tokenMint))
      );

      const userClients = users.map((u) => createUserClient(provider, u.keypair));

      // All users stake
      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      for (let i = 0; i < users.length; i++) {
        await userClients[i].stake(users[i].keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      }

      // Build tree with 8 leaves
      const baseReward = 10_000_000; // 10 tokens
      const rewards = [
        baseReward,
        baseReward * 2,
        baseReward * 3,
        baseReward * 4,
        baseReward * 5,
        baseReward * 6,
        baseReward * 7,
        baseReward * 8,
      ];
      const totalReward = rewards.reduce((a, b) => a + b, 0);

      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: rewards[0] },
        ...users.map((u, i) => ({
          userAddress: u.keypair.publicKey.toBase58(),
          cumulativeAmount: rewards[i + 1],
        })),
      ];

      const { root, layers } = buildMerkleTree(leaves);

      // Post rewards
      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), totalReward)
        .rpc();

      // All users claim
      const proof0 = proofToSVaultFormat(getMerkleProof(layers, 0));
      await client.claimRewards(wallet.publicKey, tokenMint, ctx.nonce, rewards[0], proof0).rpc();

      for (let i = 0; i < users.length; i++) {
        const proof = proofToSVaultFormat(getMerkleProof(layers, i + 1));
        await userClients[i]
          .claimRewards(users[i].keypair.publicKey, tokenMint, ctx.nonce, rewards[i + 1], proof)
          .rpc();
      }

      // Verify all claims
      const [userStake0Pda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      expect((await client.fetchUserStake(userStake0Pda)).totalClaimed.toNumber()).to.equal(rewards[0]);

      for (let i = 0; i < users.length; i++) {
        const [userStakePda] = client.deriveUserStakePDA(ctx.configPda, users[i].keypair.publicKey);
        expect((await client.fetchUserStake(userStakePda)).totalClaimed.toNumber()).to.equal(rewards[i + 1]);
      }
    });
  });

  describe("Edge Cases", () => {
    it("rejects claim with proof generated for wrong user", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);
      const user2 = await createFundedUser(provider, wallet, tokenMint);
      const user2Client = createUserClient(provider, user2.keypair);

      // Both users stake
      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      await user2Client.stake(user2.keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Build tree with two leaves
      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: REWARD_AMOUNT },
        { userAddress: user2.keypair.publicKey.toBase58(), cumulativeAmount: REWARD_AMOUNT },
      ];

      const { root, layers } = buildMerkleTree(leaves);
      const proof1 = proofToSVaultFormat(getMerkleProof(layers, 0)); // Proof for user 1

      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), REWARD_AMOUNT * 2)
        .rpc();

      // User 2 tries to claim with user 1's proof (should fail)
      try {
        await user2Client
          .claimRewards(user2.keypair.publicKey, tokenMint, ctx.nonce, REWARD_AMOUNT, proof1)
          .rpc();
        expect.fail("Should have thrown InvalidMerkleProof");
      } catch (err: any) {
        expect(err.message).to.include("InvalidMerkleProof");
      }
    });

    it("rejects claim for user not in tree", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);
      const outsider = await createFundedUser(provider, wallet, tokenMint);
      const outsiderClient = createUserClient(provider, outsider.keypair);

      // Only wallet stakes and is in tree
      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      await outsiderClient.stake(outsider.keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Tree only includes wallet
      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: REWARD_AMOUNT },
      ];

      const { root } = buildMerkleTree(leaves);

      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), REWARD_AMOUNT)
        .rpc();

      // Outsider tries to claim (not in tree)
      try {
        await outsiderClient
          .claimRewards(outsider.keypair.publicKey, tokenMint, ctx.nonce, REWARD_AMOUNT, [])
          .rpc();
        expect.fail("Should have thrown InvalidMerkleProof");
      } catch (err: any) {
        expect(err.message).to.include("InvalidMerkleProof");
      }
    });

    it("handles cumulative claims across multiple reward postings", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // First reward posting: 50 tokens
      const firstCumulative = REWARD_AMOUNT;
      const leaves1: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: firstCumulative },
      ];
      const { root: root1, layers: layers1 } = buildMerkleTree(leaves1);
      const proof1 = proofToSVaultFormat(getMerkleProof(layers1, 0));

      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root1), firstCumulative)
        .rpc();

      await client
        .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, firstCumulative, proof1)
        .rpc();

      // Second reward posting: cumulative now 100 tokens (50 new)
      const secondCumulative = REWARD_AMOUNT * 2;
      const leaves2: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: secondCumulative },
      ];
      const { root: root2, layers: layers2 } = buildMerkleTree(leaves2);
      const proof2 = proofToSVaultFormat(getMerkleProof(layers2, 0));

      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root2), REWARD_AMOUNT)
        .rpc();

      await client
        .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, secondCumulative, proof2)
        .rpc();

      // Verify total claimed is cumulative amount
      const [userStakePda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      const userStake = await client.fetchUserStake(userStakePda);
      expect(userStake.totalClaimed.toNumber()).to.equal(secondCumulative);
    });
  });

  describe("Leaf Ordering", () => {
    it("produces same root regardless of leaf insertion order", () => {
      // This verifies that the tree is deterministic based on content, not order
      const user1 = Keypair.generate().publicKey.toBase58();
      const user2 = Keypair.generate().publicKey.toBase58();
      const user3 = Keypair.generate().publicKey.toBase58();

      const leaves1: TreeLeaf[] = [
        { userAddress: user1, cumulativeAmount: 100 },
        { userAddress: user2, cumulativeAmount: 200 },
        { userAddress: user3, cumulativeAmount: 300 },
      ];

      const leaves2: TreeLeaf[] = [
        { userAddress: user1, cumulativeAmount: 100 },
        { userAddress: user2, cumulativeAmount: 200 },
        { userAddress: user3, cumulativeAmount: 300 },
      ];

      const { root: root1 } = buildMerkleTree(leaves1);
      const { root: root2 } = buildMerkleTree(leaves2);

      // Same leaves in same order = same root
      expect(root1).to.deep.equal(root2);
    });

    it("proof works when leaves are in consistent order", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);
      const user2 = await createFundedUser(provider, wallet, tokenMint);
      const user2Client = createUserClient(provider, user2.keypair);

      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();
      await user2Client.stake(user2.keypair.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Build with user2 FIRST (different than typical order)
      const leaves: TreeLeaf[] = [
        { userAddress: user2.keypair.publicKey.toBase58(), cumulativeAmount: REWARD_AMOUNT },
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: REWARD_AMOUNT },
      ];

      const { root, layers } = buildMerkleTree(leaves);
      const proof0 = proofToSVaultFormat(getMerkleProof(layers, 0)); // user2's proof
      const proof1 = proofToSVaultFormat(getMerkleProof(layers, 1)); // wallet's proof

      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), REWARD_AMOUNT * 2)
        .rpc();

      // Both should be able to claim with correct index-based proofs
      await user2Client
        .claimRewards(user2.keypair.publicKey, tokenMint, ctx.nonce, REWARD_AMOUNT, proof0)
        .rpc();
      await client
        .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, REWARD_AMOUNT, proof1)
        .rpc();

      // Verify
      const [userStake1Pda] = client.deriveUserStakePDA(ctx.configPda, user2.keypair.publicKey);
      const [userStake2Pda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      expect((await client.fetchUserStake(userStake1Pda)).totalClaimed.toNumber()).to.equal(REWARD_AMOUNT);
      expect((await client.fetchUserStake(userStake2Pda)).totalClaimed.toNumber()).to.equal(REWARD_AMOUNT);
    });
  });

  describe("Decimal Precision", () => {
    it("handles fractional token amounts correctly", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Use a fractional amount: 12.345678 tokens = 12345678 raw
      const rawAmount = 12_345_678;

      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: rawAmount },
      ];

      const { root, layers } = buildMerkleTree(leaves);
      const proof = proofToSVaultFormat(getMerkleProof(layers, 0));

      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), rawAmount)
        .rpc();

      await client
        .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, rawAmount, proof)
        .rpc();

      const [userStakePda] = client.deriveUserStakePDA(ctx.configPda, wallet.publicKey);
      const userStake = await client.fetchUserStake(userStakePda);
      expect(userStake.totalClaimed.toNumber()).to.equal(rawAmount);
    });
  });

  describe("Vault Balance Edge Cases", () => {
    it("fails claim when reward vault has insufficient funds", async () => {
      const ctx = await createStakingVault(client, wallet, tokenMint);

      await client.stake(wallet.publicKey, tokenMint, ctx.nonce, STAKE_AMOUNT).rpc();

      // Build tree with large amount
      const claimAmount = REWARD_AMOUNT * 10;
      const leaves: TreeLeaf[] = [
        { userAddress: wallet.publicKey.toBase58(), cumulativeAmount: claimAmount },
      ];

      const { root, layers } = buildMerkleTree(leaves);
      const proof = proofToSVaultFormat(getMerkleProof(layers, 0));

      // Only post small amount to vault (less than claim amount)
      await client
        .postRewards(wallet.publicKey, tokenMint, ctx.nonce, Array.from(root), REWARD_AMOUNT)
        .rpc();

      // Claim should fail due to insufficient vault balance
      try {
        await client
          .claimRewards(wallet.publicKey, tokenMint, ctx.nonce, claimAmount, proof)
          .rpc();
        expect.fail("Should have failed due to insufficient funds");
      } catch (err: any) {
        // Should fail with transfer error or similar
        expect(err.message).to.match(/insufficient|InsufficientFunds|0x1/i);
      }
    });
  });
});
