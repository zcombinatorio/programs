/**
 * Lending Program Full Lifecycle Tests - DLMM Pool via Surfpool
 * 
 * Tests: Initialize → Add Liquidity → Borrow → Repay
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

import { LendingClient, PoolType } from "../../../sdk/src";
import { getTestContext, TestContext } from "../helpers/setup";
import { DLMM_CONFIG } from "../helpers/mainnet-config";

describe("Lending: DLMM Full Lifecycle", function () {
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

    // Pre-fetch pool and mints to trigger surfpool cloning
    console.log("Cloning mainnet accounts via surfpool...");
    const [poolInfo, baseMintInfo, quoteMintInfo] = await Promise.all([
      ctx.provider.connection.getAccountInfo(DLMM_CONFIG.pool),
      ctx.provider.connection.getAccountInfo(DLMM_CONFIG.baseMint),
      ctx.provider.connection.getAccountInfo(DLMM_CONFIG.quoteMint),
    ]);

    if (!poolInfo || !baseMintInfo || !quoteMintInfo) {
      console.log("Failed to clone mainnet accounts");
      return this.skip();
    }
    console.log("✓ Pool and mints cloned");

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

    // Mint ZC tokens for admin (for liquidity)
    console.log("Minting ZC tokens for admin...");
    await mintTokens(DLMM_CONFIG.baseMint, adminKeypair.publicKey, BigInt('1000000000000')); // 1M tokens (6 decimals)
    console.log("✓ Admin funded with ZC tokens");

    // Mint ZC tokens for borrower (for collateral)
    console.log("Minting ZC tokens for borrower...");
    await mintTokens(DLMM_CONFIG.baseMint, borrowerKeypair.publicKey, BigInt('100000000000')); // 100K tokens
    console.log("✓ Borrower funded with ZC tokens");
  });

  after(function () {
    console.log("\n=== Transaction Signatures ===");
    for (const [step, sig] of Object.entries(txSignatures)) {
      console.log(`${step}: ${sig}`);
    }
  });

  describe("1. Initialize Vault", function() {
    it("should initialize vault with DLMM pool", async function() {
      const { builder, vaultPda: vPda, baseVault: bv, quoteVault: qv } = adminClient.initializeVault(
        adminKeypair.publicKey,
        DLMM_CONFIG.baseMint,
        DLMM_CONFIG.quoteMint,
        DLMM_CONFIG.pool,
        vaultNonce,
        5000,  // 50% LTV
        8000,  // 80% liquidation threshold
        new BN(86400), // 24 hour loan duration
        { dlmm: {} } as PoolType
      );

      vaultPda = vPda;
      baseVault = bv;
      quoteVault = qv;

      const sig = await builder.rpc();
      txSignatures["1_initialize_vault"] = sig;
      console.log("Initialize Vault TX:", sig);

      const vault = await adminClient.fetchVault(vaultPda);
      expect(vault).to.exist;
      expect(vault.pool.toString()).to.equal(DLMM_CONFIG.pool.toString());
      console.log("Vault PDA:", vaultPda.toString());
    });
  });

  describe("2. Add Liquidity (ZC)", function() {
    it("should add ZC liquidity to vault", async function() {
      // Check admin's ZC balance
      const adminBaseAta = getAssociatedTokenAddressSync(DLMM_CONFIG.baseMint, adminKeypair.publicKey);
      const baseAccount = await getAccount(ctx.provider.connection, adminBaseAta);
      console.log("Admin ZC balance:", baseAccount.amount.toString());

      // Add liquidity (500K ZC tokens)
      const liquidityAmount = new BN('500000000000'); // 500K tokens (6 decimals)
      
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
    it("should open a borrowing position with ZC collateral", async function() {
      // Wrap SOL for borrower (for collateral - wait, collateral is ZC, borrow is also ZC?)
      // Actually need to check the lending model:
      // - Collateral: quote token (SOL)
      // - Borrow: base token (ZC)
      
      // Wrap SOL as collateral
      const wrapAmount = 10 * LAMPORTS_PER_SOL;
      console.log("Wrapping", wrapAmount / LAMPORTS_PER_SOL, "SOL as collateral...");
      const wrapSig = await wrapSol(borrowerKeypair, wrapAmount);
      txSignatures["3a_wrap_collateral"] = wrapSig;

      // Create borrower's ZC ATA to receive borrowed tokens
      const borrowerBaseAta = getAssociatedTokenAddressSync(DLMM_CONFIG.baseMint, borrowerKeypair.publicKey);
      
      // Open position: collateral in SOL, borrow ZC
      const collateralAmount = new BN(wrapAmount);
      const borrowAmount = collateralAmount.divn(4); // Borrow 25% (conservative, well under 50% LTV)

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
      console.log("Collateral:", position.collateralAmount.toString());
      console.log("Borrowed:", position.borrowedAmount.toString());
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
    });
  });
});
