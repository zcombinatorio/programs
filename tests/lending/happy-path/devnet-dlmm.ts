/**
 * Lending Program Tests with Meteora DLMM on Devnet
 *
 * These tests require:
 * 1. Devnet connection
 * 2. Funded test wallet (test-admin.json)
 * 3. DLMM pool created via scripts/setup-devnet-dlmm.ts
 *
 * Run with: anchor test --provider.cluster devnet -- --grep "Lending: DLMM"
 */

import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";

import { LendingClient, PoolType } from "../../../sdk/src";
import {
  getTestContext,
  getTokenBalance,
  createUserClient,
  TestContext,
} from "../helpers/setup";
import {
  expectVaultState,
  expectPositionState,
  expectPositionClosed,
} from "../helpers/assertions";
import { DEVNET_CONFIG, ADMIN_ATAS } from "../helpers/devnet-config";

// =============================================================================
// TESTS
// =============================================================================

describe("Lending: DLMM Devnet", function () {
  // Increase timeout for devnet
  this.timeout(120000);

  let ctx: TestContext;
  let adminKeypair: Keypair;
  let adminClient: LendingClient;

  // Test state
  let vaultPda: PublicKey;
  let baseVault: PublicKey;
  let quoteVault: PublicKey;
  const vaultNonce = Math.floor(Math.random() * 65535);

  before(async function () {
    ctx = getTestContext();

    // Check if on devnet
    const genesisHash = await ctx.provider.connection.getGenesisHash();
    const isDevnet = genesisHash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

    if (!isDevnet) {
      console.log("Skipping DLMM devnet tests: not connected to devnet");
      this.skip();
      return;
    }

    // Load admin keypair
    try {
      const fs = await import("fs");
      const keypairData = JSON.parse(
        fs.readFileSync("./test-admin.json", "utf-8")
      );
      adminKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
      console.log("Admin:", adminKeypair.publicKey.toString());
    } catch {
      console.log("Could not load test-admin.json, skipping");
      this.skip();
      return;
    }

    // Create client for admin
    const adminWallet = new anchor.Wallet(adminKeypair);
    const adminProvider = new anchor.AnchorProvider(
      ctx.provider.connection,
      adminWallet,
      ctx.provider.opts
    );
    adminClient = new LendingClient(adminProvider);

    // Check balance
    const balance = await ctx.provider.connection.getBalance(adminKeypair.publicKey);
    console.log("Admin balance:", balance / LAMPORTS_PER_SOL, "SOL");

    if (balance < 0.5 * LAMPORTS_PER_SOL) {
      console.log("Insufficient balance. Please fund:", adminKeypair.publicKey.toString());
      this.skip();
    }

    // Verify DLMM pool exists
    const poolInfo = await ctx.provider.connection.getAccountInfo(DEVNET_CONFIG.pool);
    if (!poolInfo) {
      console.log("DLMM pool not found. Run scripts/setup-devnet-dlmm.ts first");
      this.skip();
    }
    console.log("DLMM pool verified:", DEVNET_CONFIG.pool.toString());
  });

  describe("Vault Initialization with DLMM", () => {
    it("should initialize vault with DLMM pool", async function () {
      const { builder, vaultPda: vPda, baseVault: bv, quoteVault: qv } = adminClient.initializeVault(
        adminKeypair.publicKey,
        DEVNET_CONFIG.baseMint,
        DEVNET_CONFIG.quoteMint,
        DEVNET_CONFIG.pool,
        vaultNonce,
        5000, // 50% LTV
        8000, // 80% liquidation threshold
        new BN(60), // 60 second loan duration (short for testing)
        { dlmm: {} } as PoolType
      );

      vaultPda = vPda;
      baseVault = bv;
      quoteVault = qv;

      await builder.rpc();

      // Verify vault
      const vault = await adminClient.fetchVault(vaultPda);
      expect(vault.admin.toString()).to.equal(adminKeypair.publicKey.toString());
      expect(vault.baseMint.toString()).to.equal(DEVNET_CONFIG.baseMint.toString());
      expect(vault.quoteMint.toString()).to.equal(DEVNET_CONFIG.quoteMint.toString());
      expect(vault.pool.toString()).to.equal(DEVNET_CONFIG.pool.toString());
      expect(vault.ltvBps).to.equal(5000);
      expect(vault.liquidationThresholdBps).to.equal(8000);

      console.log("Vault created:", vaultPda.toString());
    });
  });

  describe("Liquidity Management", () => {
    it("should add liquidity to vault", async function () {
      const amount = new BN(100_000_000); // 100 BASE tokens

      const builder = await adminClient.addLiquidity(
        adminKeypair.publicKey,
        vaultPda,
        amount
      );
      await builder.rpc();

      const vault = await adminClient.fetchVault(vaultPda);
      expect(vault.totalBaseLiquidity.toString()).to.equal(amount.toString());

      console.log("Added liquidity:", amount.toString());
    });
  });

  describe("Borrowing Flow", () => {
    let userKeypair: Keypair;
    let userClient: LendingClient;
    let positionPda: PublicKey;

    before(async function () {
      // Create a test user
      userKeypair = Keypair.generate();
      
      // Fund user with SOL
      const sig = await ctx.provider.connection.requestAirdrop(
        userKeypair.publicKey,
        LAMPORTS_PER_SOL
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      // Fund user with QUOTE tokens (collateral)
      const userQuoteAta = await getOrCreateAssociatedTokenAccount(
        ctx.provider.connection,
        adminKeypair,
        DEVNET_CONFIG.quoteMint,
        userKeypair.publicKey
      );
      await mintTo(
        ctx.provider.connection,
        adminKeypair,
        DEVNET_CONFIG.quoteMint,
        userQuoteAta.address,
        adminKeypair, // We're the mint authority
        BigInt(50_000_000) // 50 QUOTE tokens
      );

      // Create user client
      const userWallet = new anchor.Wallet(userKeypair);
      const userProvider = new anchor.AnchorProvider(
        ctx.provider.connection,
        userWallet,
        ctx.provider.opts
      );
      userClient = new LendingClient(userProvider);

      [positionPda] = userClient.derivePositionPDA(vaultPda, userKeypair.publicKey);
      
      console.log("Test user:", userKeypair.publicKey.toString());
    });

    it("should open a borrowing position", async function () {
      const collateralAmount = new BN(20_000_000); // 20 QUOTE as collateral
      const borrowAmount = new BN(8_000_000); // 8 BASE to borrow (40% LTV, under 50% limit)

      const { builder } = await userClient.openPosition(
        userKeypair.publicKey,
        vaultPda,
        collateralAmount,
        borrowAmount
      );
      await builder.rpc();

      // Verify position
      const position = await userClient.fetchPosition(positionPda);
      expect(position.collateralAmount.toString()).to.equal(collateralAmount.toString());
      expect(position.borrowedAmount.toString()).to.equal(borrowAmount.toString());
      expect(position.isActive).to.be.true;

      // Verify vault state
      const vault = await userClient.fetchVault(vaultPda);
      expect(vault.totalBaseBorrowed.toString()).to.equal(borrowAmount.toString());
      expect(vault.openPositions).to.equal(1);

      console.log("Position opened:", positionPda.toString());
      console.log("  Collateral:", collateralAmount.toString());
      console.log("  Borrowed:", borrowAmount.toString());
    });

    it("should repay position and return collateral", async function () {
      // First, give user some BASE tokens to repay
      const userBaseAta = await getOrCreateAssociatedTokenAccount(
        ctx.provider.connection,
        adminKeypair,
        DEVNET_CONFIG.baseMint,
        userKeypair.publicKey
      );
      await mintTo(
        ctx.provider.connection,
        adminKeypair,
        DEVNET_CONFIG.baseMint,
        userBaseAta.address,
        adminKeypair,
        BigInt(10_000_000) // 10 BASE to cover repayment
      );

      const userQuoteAtaBefore = await getTokenBalance(
        ctx.provider,
        getAssociatedTokenAddressSync(DEVNET_CONFIG.quoteMint, userKeypair.publicKey)
      );

      const builder = await userClient.repay(userKeypair.publicKey, vaultPda);
      await builder.rpc();

      // Position should be closed
      const position = await userClient.fetchPositionOrNull(positionPda);
      expect(position).to.be.null;

      // Vault should show no borrows
      const vault = await userClient.fetchVault(vaultPda);
      expect(vault.totalBaseBorrowed.toString()).to.equal("0");
      expect(vault.openPositions).to.equal(0);

      // User should have collateral returned
      const userQuoteAtaAfter = await getTokenBalance(
        ctx.provider,
        getAssociatedTokenAddressSync(DEVNET_CONFIG.quoteMint, userKeypair.publicKey)
      );
      expect(userQuoteAtaAfter.gt(userQuoteAtaBefore)).to.be.true;

      console.log("Position repaid successfully");
    });
  });

  describe("Remove Liquidity", () => {
    it("should remove liquidity from vault", async function () {
      const vault = await adminClient.fetchVault(vaultPda);
      const removeAmount = vault.totalBaseLiquidity;

      const builder = await adminClient.removeLiquidity(
        adminKeypair.publicKey,
        vaultPda,
        removeAmount
      );
      await builder.rpc();

      const vaultAfter = await adminClient.fetchVault(vaultPda);
      expect(vaultAfter.totalBaseLiquidity.toString()).to.equal("0");

      console.log("Removed liquidity:", removeAmount.toString());
    });
  });
});

// =============================================================================
// HELPER: Read DLMM pool state directly (for debugging)
// =============================================================================

export async function readDlmmPoolState(
  connection: anchor.web3.Connection,
  poolAddress: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(poolAddress);
  if (!accountInfo) {
    throw new Error("Pool account not found");
  }

  const data = accountInfo.data;

  const activeId = data.readInt32LE(76);
  const binStep = data.readUInt16LE(80);
  const tokenXMint = new PublicKey(data.slice(88, 120));
  const tokenYMint = new PublicKey(data.slice(120, 152));

  return {
    activeId,
    binStep,
    tokenXMint,
    tokenYMint,
  };
}
