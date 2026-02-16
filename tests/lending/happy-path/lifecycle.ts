/**
 * Lending Program Lifecycle Tests
 *
 * Tests the full lending flow:
 * 1. Initialize vault with DLMM pool
 * 2. Add liquidity
 * 3. Open position (borrow)
 * 4. Repay position
 * 5. Remove liquidity
 */

import { expect } from "chai";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { PoolType } from "../../../sdk/src";
import {
  getTestContext,
  ensureWalletFunded,
  createTestMint,
  fundWalletAta,
  createFundedUser,
  initializeTestVault,
  getTokenBalance,
  TestContext,
  TestVault,
  FundedUser,
} from "../helpers/setup";
import {
  expectVaultState,
  expectPositionState,
  expectPositionClosed,
  expectTokenBalance,
} from "../helpers/assertions";
import {
  INITIAL_LIQUIDITY,
  COLLATERAL_AMOUNT,
  BORROW_AMOUNT,
  DEFAULT_LTV_BPS,
  DEFAULT_LIQUIDATION_THRESHOLD_BPS,
  DEFAULT_LOAN_DURATION_SECONDS,
} from "../helpers/constants";

describe("Lending: Lifecycle", () => {
  let ctx: TestContext;
  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let mockPool: PublicKey; // For localnet tests without real Meteora pools

  before(async () => {
    ctx = getTestContext();
    await ensureWalletFunded(ctx.provider, ctx.wallet);

    // Create test mints
    baseMint = await createTestMint(ctx.provider, ctx.wallet, 6);
    quoteMint = await createTestMint(ctx.provider, ctx.wallet, 6);

    // For localnet, we'll need a mock pool or skip pool-dependent tests
    // For devnet, use actual Meteora pools
    mockPool = PublicKey.unique(); // Placeholder - real tests need real pool
  });

  describe("Vault Initialization", () => {
    it("should initialize a vault with valid parameters", async () => {
      // Skip if no real pool (localnet)
      if (ctx.provider.connection.rpcEndpoint.includes("localhost")) {
        console.log("Skipping: requires Meteora pool on devnet");
        return;
      }

      const nonce = Math.floor(Math.random() * 65535);
      const vault = await initializeTestVault(
        ctx,
        baseMint,
        quoteMint,
        mockPool,
        { dlmm: {} } as PoolType,
        nonce
      );

      const vaultAccount = await ctx.client.fetchVault(vault.vaultPda);
      expect(vaultAccount.admin.toString()).to.equal(ctx.wallet.publicKey.toString());
      expect(vaultAccount.baseMint.toString()).to.equal(baseMint.toString());
      expect(vaultAccount.quoteMint.toString()).to.equal(quoteMint.toString());
      expect(vaultAccount.ltvBps).to.equal(DEFAULT_LTV_BPS);
      expect(vaultAccount.liquidationThresholdBps).to.equal(
        DEFAULT_LIQUIDATION_THRESHOLD_BPS
      );
      expect(vaultAccount.totalBaseLiquidity.toNumber()).to.equal(0);
      expect(vaultAccount.totalBaseBorrowed.toNumber()).to.equal(0);
      expect(vaultAccount.openPositions).to.equal(0);
    });
  });

  describe("Liquidity Management", () => {
    let vault: TestVault;
    let adminBaseAta: PublicKey;

    before(async () => {
      if (ctx.provider.connection.rpcEndpoint.includes("localhost")) {
        console.log("Skipping liquidity tests: requires Meteora pool");
        return;
      }

      // Initialize fresh vault
      const nonce = Math.floor(Math.random() * 65535);
      vault = await initializeTestVault(
        ctx,
        baseMint,
        quoteMint,
        mockPool,
        { dlmm: {} } as PoolType,
        nonce
      );

      // Fund admin wallet with base tokens
      adminBaseAta = await fundWalletAta(
        ctx.provider,
        ctx.wallet,
        baseMint,
        INITIAL_LIQUIDITY.mul(new BN(2))
      );
    });

    it("should add liquidity to vault", async () => {
      if (!vault) return;

      const builder = await ctx.client.addLiquidity(
        ctx.wallet.publicKey,
        vault.vaultPda,
        INITIAL_LIQUIDITY
      );
      await builder.rpc();

      await expectVaultState(ctx.client, vault.vaultPda, {
        totalLiquidity: INITIAL_LIQUIDITY,
        totalBorrowed: 0,
      });

      await expectTokenBalance(ctx.provider, vault.baseVault, INITIAL_LIQUIDITY);
    });

    it("should remove liquidity from vault", async () => {
      if (!vault) return;

      const removeAmount = INITIAL_LIQUIDITY.div(new BN(2));
      const builder = await ctx.client.removeLiquidity(
        ctx.wallet.publicKey,
        vault.vaultPda,
        removeAmount
      );
      await builder.rpc();

      const expectedRemaining = INITIAL_LIQUIDITY.sub(removeAmount);
      await expectVaultState(ctx.client, vault.vaultPda, {
        totalLiquidity: expectedRemaining,
      });
    });
  });

  describe("Borrowing Flow", () => {
    let vault: TestVault;
    let user: FundedUser;
    let positionPda: PublicKey;

    before(async () => {
      if (ctx.provider.connection.rpcEndpoint.includes("localhost")) {
        console.log("Skipping borrow tests: requires Meteora pool");
        return;
      }

      // Initialize fresh vault with liquidity
      const nonce = Math.floor(Math.random() * 65535);
      vault = await initializeTestVault(
        ctx,
        baseMint,
        quoteMint,
        mockPool,
        { dlmm: {} } as PoolType,
        nonce
      );

      // Fund and add liquidity
      await fundWalletAta(ctx.provider, ctx.wallet, baseMint, INITIAL_LIQUIDITY);
      const addLiqBuilder = await ctx.client.addLiquidity(
        ctx.wallet.publicKey,
        vault.vaultPda,
        INITIAL_LIQUIDITY
      );
      await addLiqBuilder.rpc();

      // Create funded user (needs quote tokens for collateral)
      user = await createFundedUser(
        ctx.provider,
        ctx.wallet,
        baseMint,
        quoteMint,
        0, // No base tokens needed
        COLLATERAL_AMOUNT.mul(new BN(2)) // Plenty of quote for collateral
      );

      [positionPda] = ctx.client.derivePositionPDA(vault.vaultPda, user.keypair.publicKey);
    });

    it("should open a borrowing position", async () => {
      if (!vault || !user) return;

      const userClient = new (await import("../../../sdk/src")).LendingClient(
        new (await import("@coral-xyz/anchor")).AnchorProvider(
          ctx.provider.connection,
          user.wallet,
          ctx.provider.opts
        )
      );

      const { builder } = await userClient.openPosition(
        user.keypair.publicKey,
        vault.vaultPda,
        COLLATERAL_AMOUNT,
        BORROW_AMOUNT
      );
      await builder.rpc();

      // Check position state
      await expectPositionState(ctx.client, positionPda, {
        collateralAmount: COLLATERAL_AMOUNT,
        borrowedAmount: BORROW_AMOUNT,
        isActive: true,
      });

      // Check vault state updated
      await expectVaultState(ctx.client, vault.vaultPda, {
        totalBorrowed: BORROW_AMOUNT,
        openPositions: 1,
      });

      // Check user received borrowed tokens
      const userBaseBalance = await getTokenBalance(ctx.provider, user.baseAta);
      expect(userBaseBalance.eq(BORROW_AMOUNT)).to.be.true;
    });

    it("should repay position and return collateral", async () => {
      if (!vault || !user) return;

      const userClient = new (await import("../../../sdk/src")).LendingClient(
        new (await import("@coral-xyz/anchor")).AnchorProvider(
          ctx.provider.connection,
          user.wallet,
          ctx.provider.opts
        )
      );

      const userQuoteBalanceBefore = await getTokenBalance(ctx.provider, user.quoteAta);

      const builder = await userClient.repay(user.keypair.publicKey, vault.vaultPda);
      await builder.rpc();

      // Position should be closed
      await expectPositionClosed(ctx.client, positionPda);

      // Vault should show no borrows
      await expectVaultState(ctx.client, vault.vaultPda, {
        totalBorrowed: 0,
        openPositions: 0,
      });

      // User should have collateral returned
      const userQuoteBalanceAfter = await getTokenBalance(ctx.provider, user.quoteAta);
      const collateralReturned = userQuoteBalanceAfter.sub(userQuoteBalanceBefore);
      expect(collateralReturned.eq(COLLATERAL_AMOUNT)).to.be.true;
    });
  });
});
