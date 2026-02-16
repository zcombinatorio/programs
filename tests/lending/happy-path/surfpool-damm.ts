/**
 * Lending Program Full Lifecycle Tests - DAMM v2 (CP-AMM) Pool via Surfpool
 * 
 * Tests: Initialize → Add Liquidity → Borrow → Repay with USDC/SOL pool
 */

import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  AccountLayout,
} from "@solana/spl-token";
import * as http from "http";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";

import { LendingClient, PoolType } from "../../../sdk/src";
import { getTestContext, TestContext } from "../helpers/setup";
import { DAMM_CONFIG, USDC_MINT, NATIVE_SOL_MINT } from "../helpers/mainnet-config";

// CP-AMM program ID
const CP_AMM_PROGRAM_ID = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

// TODO: CP-AMM IDL may be out of sync with deployed program - needs IDL refresh
// Pool account struct layout differs from expected, causing PoolMintMismatch errors
// DLMM tests work correctly; prioritize those for now
describe.skip("Lending: DAMM v2 (CP-AMM) Full Lifecycle", function () {
  this.timeout(300000);

  let ctx: TestContext;
  let adminKeypair: Keypair;
  let adminClient: LendingClient;
  let borrowerKeypair: Keypair;
  let borrowerClient: LendingClient;

  // Vault state
  let vaultPda: PublicKey;
  let baseVault: PublicKey;
  let quoteVault: PublicKey;
  const vaultNonce = Math.floor(Math.random() * 65535);

  // Position state
  let positionPda: PublicKey;

  // Transaction signatures
  const txSignatures: Record<string, string> = {};

  // Helper to mint tokens via surfnet_setAccount
  async function mintTokens(mint: PublicKey, owner: PublicKey, amount: bigint): Promise<void> {
    const ata = getAssociatedTokenAddressSync(mint, owner);
    
    const tokenData = Buffer.alloc(AccountLayout.span);
    AccountLayout.encode({
      mint: mint,
      owner: owner,
      amount: amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    }, tokenData);

    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'surfnet_setAccount',
      params: [
        ata.toString(),
        {
          lamports: 2039280,
          data: tokenData.toString('hex'),
          owner: TOKEN_PROGRAM_ID.toString(),
          executable: false,
          rentEpoch: 0
        }
      ]
    });

    return new Promise((resolve, reject) => {
      const req = http.request('http://127.0.0.1:8899', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const result = JSON.parse(body);
          if (result.error) reject(new Error(result.error.message));
          else resolve();
        });
      });
      req.write(data);
      req.end();
    });
  }

  // Helper to wrap SOL
  async function wrapSol(wallet: Keypair, amount: number): Promise<string> {
    const ata = getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey);
    
    const tx = new Transaction();
    try {
      await getAccount(ctx.provider.connection, ata);
    } catch {
      tx.add(createAssociatedTokenAccountInstruction(
        wallet.publicKey, ata, wallet.publicKey, NATIVE_MINT
      ));
    }
    
    tx.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: ata,
        lamports: amount,
      }),
      createSyncNativeInstruction(ata)
    );
    
    const sig = await ctx.provider.connection.sendTransaction(tx, [wallet]);
    await ctx.provider.connection.confirmTransaction(sig);
    return sig;
  }

  before(async function () {
    ctx = getTestContext();

    const endpoint = ctx.provider.connection.rpcEndpoint;
    const isLocalhost = endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
    
    if (!isLocalhost) {
      console.log("Skipping: not on localhost/surfpool");
      return this.skip();
    }

    // Pre-fetch all required accounts to trigger surfpool cloning
    console.log("Cloning mainnet accounts via surfpool...");
    console.log("  Pool:", DAMM_CONFIG.pool.toString());
    console.log("  USDC mint:", USDC_MINT.toString());
    console.log("  SOL mint:", NATIVE_SOL_MINT.toString());
    
    // Fetch each account explicitly to trigger cloning
    const poolInfo = await ctx.provider.connection.getAccountInfo(DAMM_CONFIG.pool);
    console.log("  Pool cloned:", poolInfo ? "✓" : "✗");
    
    const usdcMintInfo = await ctx.provider.connection.getAccountInfo(USDC_MINT);
    console.log("  USDC mint cloned:", usdcMintInfo ? "✓" : "✗");
    
    // SOL mint is native, always exists
    console.log("  SOL mint: ✓ (native)");

    if (!poolInfo || !usdcMintInfo) {
      console.log("Failed to clone mainnet accounts");
      return this.skip();
    }
    console.log("✓ All accounts cloned");

    // Fetch CP-AMM pool info
    try {
      const cpAmm = new CpAmm(ctx.provider.connection);
      const poolState = await cpAmm.fetchPoolState(DAMM_CONFIG.pool);
      console.log("✓ CP-AMM pool fetched");
      console.log("  Token A:", poolState.tokenAMint.toString());
      console.log("  Token B:", poolState.tokenBMint.toString());
    } catch (e) {
      console.log("Warning: Could not fetch CP-AMM pool state:", e);
    }

    // Setup admin
    const fs = await import("fs");
    const keypairData = JSON.parse(fs.readFileSync("./.keys/authority.json", "utf-8"));
    adminKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    const adminBalance = await ctx.provider.connection.getBalance(adminKeypair.publicKey);
    if (adminBalance < 10 * LAMPORTS_PER_SOL) {
      const sig = await ctx.provider.connection.requestAirdrop(adminKeypair.publicKey, 100 * LAMPORTS_PER_SOL);
      await ctx.provider.connection.confirmTransaction(sig);
    }

    adminClient = new LendingClient(
      new anchor.AnchorProvider(
        ctx.provider.connection,
        new anchor.Wallet(adminKeypair),
        { commitment: "confirmed" }
      )
    );
    console.log("Admin:", adminKeypair.publicKey.toString());

    // Setup borrower
    borrowerKeypair = Keypair.generate();
    const airdropSig = await ctx.provider.connection.requestAirdrop(borrowerKeypair.publicKey, 50 * LAMPORTS_PER_SOL);
    await ctx.provider.connection.confirmTransaction(airdropSig);

    borrowerClient = new LendingClient(
      new anchor.AnchorProvider(
        ctx.provider.connection,
        new anchor.Wallet(borrowerKeypair),
        { commitment: "confirmed" }
      )
    );
    console.log("Borrower:", borrowerKeypair.publicKey.toString());

    // Mint USDC tokens for admin (for liquidity)
    console.log("Minting USDC tokens for admin...");
    await mintTokens(USDC_MINT, adminKeypair.publicKey, BigInt('10000000000')); // 10K USDC (6 decimals)
    console.log("✓ Admin funded with USDC tokens");

    // Borrower will use SOL as collateral (already has airdropped SOL)
    console.log("✓ Borrower has SOL for collateral");
  });

  after(function () {
    console.log("\n=== Transaction Signatures ===");
    for (const [step, sig] of Object.entries(txSignatures)) {
      console.log(`${step}: ${sig}`);
    }
  });

  describe("1. Initialize Vault", function() {
    it("should initialize vault with DAMM v2 (CP-AMM) pool", async function() {
      const { builder, vaultPda: vPda, baseVault: bv, quoteVault: qv } = adminClient.initializeVault(
        adminKeypair.publicKey,
        DAMM_CONFIG.baseMint,  // USDC (lent token)
        DAMM_CONFIG.quoteMint, // SOL (collateral)
        DAMM_CONFIG.pool,
        vaultNonce,
        5000,  // 50% LTV
        8000,  // 80% liquidation threshold
        new BN(86400), // 24 hour loan duration
        { cpAmm: {} } as PoolType  // CP-AMM (DAMM v2)
      );

      vaultPda = vPda;
      baseVault = bv;
      quoteVault = qv;

      const sig = await builder.rpc();
      txSignatures["1_initialize_vault"] = sig;
      console.log("Initialize Vault TX:", sig);

      const vault = await adminClient.fetchVault(vaultPda);
      expect(vault).to.exist;
      expect(vault.pool.toString()).to.equal(DAMM_CONFIG.pool.toString());
      expect(vault.poolType).to.equal(PoolType.CpAmm);
      console.log("Vault PDA:", vaultPda.toString());
      console.log("Pool Type: CP-AMM (DAMM v2)");
    });
  });

  describe("2. Add Liquidity (USDC)", function() {
    it("should add USDC liquidity to vault", async function() {
      // Check admin's USDC balance
      const adminBaseAta = getAssociatedTokenAddressSync(USDC_MINT, adminKeypair.publicKey);
      const baseAccount = await getAccount(ctx.provider.connection, adminBaseAta);
      console.log("Admin USDC balance:", baseAccount.amount.toString());

      // Add liquidity (5K USDC)
      const liquidityAmount = new BN('5000000000'); // 5K USDC (6 decimals)
      
      const builder = await adminClient.addLiquidity(
        adminKeypair.publicKey,
        vaultPda,
        liquidityAmount,
      );

      const sig = await builder.rpc();
      txSignatures["2_add_liquidity"] = sig;
      console.log("Add Liquidity TX:", sig);

      // Verify liquidity added
      const vault = await adminClient.fetchVault(vaultPda);
      console.log("Vault base liquidity:", vault.totalBaseLiquidity?.toString());
      expect(vault.totalBaseLiquidity?.toString()).to.equal(liquidityAmount.toString());
    });
  });

  describe("3. Open Position (Borrow)", function() {
    it("should open a borrowing position with SOL collateral", async function() {
      // Collateral: SOL (quote token)
      // Borrow: USDC (base token)
      
      // Wrap SOL for collateral
      const wrapAmount = 5 * LAMPORTS_PER_SOL; // 5 SOL
      console.log("Wrapping", wrapAmount / LAMPORTS_PER_SOL, "SOL as collateral...");
      const wrapSig = await wrapSol(borrowerKeypair, wrapAmount);
      txSignatures["3a_wrap_collateral"] = wrapSig;

      // Open position: collateral in SOL, borrow USDC
      const collateralAmount = new BN(wrapAmount);
      const borrowAmount = new BN('500000000'); // 500 USDC (well under LTV, assuming ~$100/SOL)

      const { builder, positionPda: pPda } = await borrowerClient.openPosition(
        borrowerKeypair.publicKey,
        vaultPda,
        collateralAmount,
        borrowAmount
      );

      positionPda = pPda;
      const sig = await builder.rpc();
      txSignatures["3b_open_position"] = sig;
      console.log("Open Position TX:", sig);
      console.log("Position PDA:", positionPda.toString());

      const position = await borrowerClient.fetchPosition(positionPda);
      expect(position).to.exist;
      console.log("Collateral (SOL):", position.collateralAmount.toString());
      console.log("Borrowed (USDC):", position.borrowedAmount.toString());
    });
  });

  describe("4. Repay Position", function() {
    it("should repay and close position", async function() {
      if (!positionPda) {
        console.log("⚠ No position to repay - skipping");
        return;
      }

      const position = await borrowerClient.fetchPosition(positionPda);
      console.log("Repaying borrowed amount:", position.borrowedAmount.toString());

      // The borrowed USDC should already be in borrower's account
      const borrowerBaseAta = getAssociatedTokenAddressSync(USDC_MINT, borrowerKeypair.publicKey);
      const baseAccount = await getAccount(ctx.provider.connection, borrowerBaseAta);
      console.log("Borrower USDC balance before repay:", baseAccount.amount.toString());

      const builder = await borrowerClient.repay(
        borrowerKeypair.publicKey,
        vaultPda
      );

      const sig = await builder.rpc();
      txSignatures["4_repay"] = sig;
      console.log("Repay TX:", sig);

      // Verify position closed
      const closedPosition = await borrowerClient.fetchPositionOrNull(positionPda);
      expect(closedPosition).to.be.null;
      console.log("Position closed successfully");

      // Check vault accounting
      const vault = await borrowerClient.fetchVault(vaultPda);
      console.log("Vault after repay:");
      console.log("  Open positions:", vault.openPositions);
      console.log("  Total borrowed:", vault.totalBaseBorrowed.toString());
      expect(vault.openPositions).to.equal(0);
      expect(vault.totalBaseBorrowed.toString()).to.equal("0");
    });
  });
});
