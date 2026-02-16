/**
 * Lending Program Liquidation Tests - DLMM Pool via Surfpool
 * 
 * Tests: Liquidation via expired loan
 * Uses short loan duration to trigger expiry-based liquidation
 */

import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, AccountMeta } from "@solana/web3.js";
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
import DLMM from "@meteora-ag/dlmm";

import { LendingClient, PoolType, deriveLendingVaultPDA, deriveBaseVaultPDA, deriveQuoteVaultPDA, derivePositionPDA, LENDING_PROGRAM_ID } from "../../../sdk/src";
import { getTestContext, TestContext } from "../helpers/setup";
import { DLMM_CONFIG } from "../helpers/mainnet-config";

// DLMM program ID
const DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

// Helper to derive DLMM event authority
function deriveDlmmEventAuthority(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    DLMM_PROGRAM_ID
  );
  return pda;
}

describe("Lending: DLMM Liquidation", function () {
  this.timeout(300000);

  let ctx: TestContext;
  let adminKeypair: Keypair;
  let adminClient: LendingClient;
  let borrowerKeypair: Keypair;
  let borrowerClient: LendingClient;
  let liquidatorKeypair: Keypair;
  let liquidatorClient: LendingClient;

  // Vault state
  let vaultPda: PublicKey;
  let baseVault: PublicKey;
  let quoteVault: PublicKey;
  const vaultNonce = Math.floor(Math.random() * 65535);

  // Position state
  let positionPda: PublicKey;

  // DLMM pool accounts (fetched from mainnet clone)
  let dlmmAccounts: {
    lbPair: PublicKey;
    reserveX: PublicKey;
    reserveY: PublicKey;
    tokenXMint: PublicKey;
    tokenYMint: PublicKey;
    binArrayBitmapExtension: PublicKey | null;
    oracle: PublicKey;
    eventAuthority: PublicKey;
    binArrays: PublicKey[];
  };

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

  // Helper to advance time (surfnet specific)
  async function advanceTime(seconds: number): Promise<void> {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'surfnet_warpTime',
      params: [seconds]
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
          if (result.error) {
            console.log("Time warp not supported, will use short loan duration");
            resolve(); // Continue anyway
          } else {
            console.log(`Time advanced by ${seconds} seconds`);
            resolve();
          }
        });
      });
      req.write(data);
      req.end();
    });
  }

  // Fetch DLMM pool accounts from mainnet clone
  async function fetchDlmmPoolAccounts(): Promise<typeof dlmmAccounts> {
    console.log("Fetching DLMM pool accounts...");
    
    // Use DLMM SDK to create pool instance
    const dlmmPool = await DLMM.create(ctx.provider.connection, DLMM_CONFIG.pool);
    
    // Get bin arrays for the active bins around current price
    const activeBin = await dlmmPool.getActiveBin();
    console.log("Active bin ID:", activeBin.binId);
    
    // Get the bin arrays we need for swapping
    // DLMM bins are organized into bin arrays (each holds multiple bins)
    const binStep = dlmmPool.lbPair.binStep;
    const binArrays = await dlmmPool.getBinArrays();
    
    // Filter to relevant bin arrays (around active price)
    const relevantBinArrayPubkeys = binArrays
      .map(ba => ba.publicKey)
      .slice(0, 6); // Take first 6 relevant bin arrays
    
    console.log("Bin arrays:", relevantBinArrayPubkeys.length);
    
    return {
      lbPair: DLMM_CONFIG.pool,
      reserveX: dlmmPool.lbPair.reserveX,
      reserveY: dlmmPool.lbPair.reserveY,
      tokenXMint: dlmmPool.lbPair.tokenXMint,
      tokenYMint: dlmmPool.lbPair.tokenYMint,
      binArrayBitmapExtension: dlmmPool.lbPair.binArrayBitmapExtension && !dlmmPool.lbPair.binArrayBitmapExtension.equals(PublicKey.default) 
        ? dlmmPool.lbPair.binArrayBitmapExtension 
        : null,
      oracle: dlmmPool.lbPair.oracle,
      eventAuthority: deriveDlmmEventAuthority(),
      binArrays: relevantBinArrayPubkeys,
    };
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

    // Fetch DLMM pool accounts
    dlmmAccounts = await fetchDlmmPoolAccounts();
    console.log("✓ DLMM pool accounts fetched");

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
    const airdropSig1 = await ctx.provider.connection.requestAirdrop(borrowerKeypair.publicKey, 50 * LAMPORTS_PER_SOL);
    await ctx.provider.connection.confirmTransaction(airdropSig1);

    borrowerClient = new LendingClient(
      new anchor.AnchorProvider(
        ctx.provider.connection,
        new anchor.Wallet(borrowerKeypair),
        { commitment: "confirmed" }
      )
    );
    console.log("Borrower:", borrowerKeypair.publicKey.toString());

    // Setup liquidator
    liquidatorKeypair = Keypair.generate();
    const airdropSig2 = await ctx.provider.connection.requestAirdrop(liquidatorKeypair.publicKey, 10 * LAMPORTS_PER_SOL);
    await ctx.provider.connection.confirmTransaction(airdropSig2);

    liquidatorClient = new LendingClient(
      new anchor.AnchorProvider(
        ctx.provider.connection,
        new anchor.Wallet(liquidatorKeypair),
        { commitment: "confirmed" }
      )
    );
    console.log("Liquidator:", liquidatorKeypair.publicKey.toString());

    // Mint ZC tokens for admin (for liquidity)
    console.log("Minting ZC tokens for admin...");
    await mintTokens(DLMM_CONFIG.baseMint, adminKeypair.publicKey, BigInt('1000000000000')); // 1M tokens (6 decimals)
    console.log("✓ Admin funded with ZC tokens");
  });

  after(function () {
    console.log("\n=== Transaction Signatures ===");
    for (const [step, sig] of Object.entries(txSignatures)) {
      console.log(`${step}: ${sig}`);
    }
  });

  describe("1. Setup: Initialize Vault with Short Loan Duration", function() {
    it("should initialize vault with 5-second loan duration", async function() {
      // Very short loan duration for testing expiry liquidation
      const loanDurationSeconds = new BN(5);
      
      const { builder, vaultPda: vPda, baseVault: bv, quoteVault: qv } = adminClient.initializeVault(
        adminKeypair.publicKey,
        DLMM_CONFIG.baseMint,
        DLMM_CONFIG.quoteMint,
        DLMM_CONFIG.pool,
        vaultNonce,
        5000,  // 50% LTV
        8000,  // 80% liquidation threshold
        loanDurationSeconds,
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
      expect(vault.loanDurationSeconds.toString()).to.equal("5");
      console.log("Vault PDA:", vaultPda.toString());
      console.log("Loan duration:", vault.loanDurationSeconds.toString(), "seconds");
    });
  });

  describe("2. Setup: Add Liquidity", function() {
    it("should add ZC liquidity to vault", async function() {
      const liquidityAmount = new BN('500000000000'); // 500K tokens
      
      const builder = await adminClient.addLiquidity(
        adminKeypair.publicKey,
        vaultPda,
        liquidityAmount,
      );

      const sig = await builder.rpc();
      txSignatures["2_add_liquidity"] = sig;
      console.log("Add Liquidity TX:", sig);
    });
  });

  describe("3. Setup: Open Position", function() {
    it("should open a borrowing position", async function() {
      // Wrap SOL as collateral
      const wrapAmount = 10 * LAMPORTS_PER_SOL;
      const wrapSig = await wrapSol(borrowerKeypair, wrapAmount);
      txSignatures["3a_wrap_collateral"] = wrapSig;

      // Open position
      const collateralAmount = new BN(wrapAmount);
      const borrowAmount = collateralAmount.divn(4); // 25% borrow

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

      const position = await borrowerClient.fetchPosition(positionPda);
      expect(position).to.exist;
      expect(position.isActive).to.be.true;
      console.log("Position opened:", positionPda.toString());
      console.log("Collateral:", position.collateralAmount.toString());
      console.log("Borrowed:", position.borrowedAmount.toString());
    });
  });

  describe("4. Wait for Loan Expiry", function() {
    it("should wait for loan to expire", async function() {
      console.log("Waiting for loan expiry (5 seconds + buffer)...");
      
      // Try to warp time if supported, otherwise just wait
      await advanceTime(10);
      
      // Also do a real wait to ensure expiry
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      console.log("Loan should now be expired");
    });
  });

  describe("5. Liquidate Position", function() {
    it("should liquidate expired position via DLMM swap", async function() {
      if (!positionPda) {
        console.log("⚠ No position to liquidate - skipping");
        return;
      }

      // Verify position exists and is still active
      const position = await liquidatorClient.fetchPosition(positionPda);
      expect(position.isActive).to.be.true;
      console.log("Position to liquidate:");
      console.log("  Collateral:", position.collateralAmount.toString());
      console.log("  Borrowed:", position.borrowedAmount.toString());

      // Build liquidation tx using raw instruction
      // We need to call liquidateDlmm directly since client doesn't have wrapper yet
      const vault = await liquidatorClient.fetchVault(vaultPda);

      // Build remaining accounts for bin arrays
      const remainingAccounts: AccountMeta[] = dlmmAccounts.binArrays.map(pubkey => ({
        pubkey,
        isSigner: false,
        isWritable: true,
      }));

      // Use 0 min_amount_out for testing (in prod would use oracle price - slippage)
      const minAmountOut = new BN(0);

      // DLMM swaps require high compute budget
      const { ComputeBudgetProgram } = await import("@solana/web3.js");

      const sig = await liquidatorClient.program.methods
        .liquidateDlmm(minAmountOut)
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        ])
        .accountsPartial({
          liquidator: liquidatorKeypair.publicKey,
          user: borrowerKeypair.publicKey,
          vault: vaultPda,
          position: positionPda,
          baseMint: vault.baseMint,
          quoteMint: vault.quoteMint,
          baseVault: vault.baseVault,
          quoteVault: vault.quoteVault,
          lbPair: dlmmAccounts.lbPair,
          binArrayBitmapExtension: dlmmAccounts.binArrayBitmapExtension,
          reserveX: dlmmAccounts.reserveX,
          reserveY: dlmmAccounts.reserveY,
          tokenXMint: dlmmAccounts.tokenXMint,
          tokenYMint: dlmmAccounts.tokenYMint,
          oracle: dlmmAccounts.oracle,
          hostFeeIn: null,
          dlmmProgram: DLMM_PROGRAM_ID,
          eventAuthority: dlmmAccounts.eventAuthority,
          tokenXProgram: TOKEN_PROGRAM_ID,
          tokenYProgram: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

      txSignatures["5_liquidate"] = sig;
      console.log("Liquidate TX:", sig);

      // Verify position is closed
      const closedPosition = await liquidatorClient.fetchPositionOrNull(positionPda);
      expect(closedPosition).to.be.null;
      console.log("✓ Position liquidated successfully!");

      // Check vault accounting updated
      const vaultAfter = await liquidatorClient.fetchVault(vaultPda);
      console.log("Vault after liquidation:");
      console.log("  Open positions:", vaultAfter.openPositions);
      console.log("  Total borrowed:", vaultAfter.totalBaseBorrowed.toString());
      console.log("  Total collateral:", vaultAfter.totalQuoteCollateral.toString());
      expect(vaultAfter.openPositions).to.equal(0);
    });
  });
});
