/**
 * Setup script to create a DLMM pool on devnet for lending tests
 * 
 * Creates:
 * 1. Two test SPL tokens (BASE and QUOTE)
 * 2. A Meteora DLMM pool for BASE/QUOTE
 * 3. Adds initial liquidity
 * 
 * Run with: npx ts-node scripts/setup-devnet-dlmm.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  createMint, 
  mintTo, 
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import DLMM, { ActivationType, StrategyType } from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import * as fs from "fs";

// Configuration
const RPC_URL = "https://api.devnet.solana.com";
const ADMIN_KEYPAIR_PATH = "./test-admin.json";

// Pool parameters
const BIN_STEP = new BN(25); // 0.25% per bin
const BASE_DECIMALS = 6;
const QUOTE_DECIMALS = 6;
const INITIAL_BASE_AMOUNT = 1_000_000_000; // 1000 BASE tokens
const INITIAL_QUOTE_AMOUNT = 1_000_000_000; // 1000 QUOTE tokens
const FEE_BPS = new BN(100); // 1% fee

async function main() {
  console.log("=== DLMM Pool Setup for Lending Tests ===\n");

  // Load admin keypair
  let admin: Keypair;
  try {
    const keypairData = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8"));
    admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    console.log("Admin pubkey:", admin.publicKey.toString());
  } catch (e) {
    console.error("Failed to load admin keypair from", ADMIN_KEYPAIR_PATH);
    console.error("Generate one with: solana-keygen new -o test-admin.json");
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");

  // Check balance
  const balance = await connection.getBalance(admin.publicKey);
  console.log("Admin balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.error("Insufficient balance. Need at least 0.5 SOL.");
    process.exit(1);
  }

  // Step 1: Create test mints
  console.log("Step 1: Creating test mints...");
  
  const baseMint = await createMint(
    connection,
    admin,
    admin.publicKey,
    null,
    BASE_DECIMALS
  );
  console.log("  BASE mint:", baseMint.toString());

  const quoteMint = await createMint(
    connection,
    admin,
    admin.publicKey,
    null,
    QUOTE_DECIMALS
  );
  console.log("  QUOTE mint:", quoteMint.toString());

  // Step 2: Mint tokens to admin
  console.log("\nStep 2: Minting tokens to admin...");

  const adminBaseAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    baseMint,
    admin.publicKey
  );
  await mintTo(
    connection,
    admin,
    baseMint,
    adminBaseAta.address,
    admin,
    BigInt(INITIAL_BASE_AMOUNT * 10) // Mint extra for testing
  );
  console.log("  Minted BASE to:", adminBaseAta.address.toString());

  const adminQuoteAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    quoteMint,
    admin.publicKey
  );
  await mintTo(
    connection,
    admin,
    quoteMint,
    adminQuoteAta.address,
    admin,
    BigInt(INITIAL_QUOTE_AMOUNT * 10)
  );
  console.log("  Minted QUOTE to:", adminQuoteAta.address.toString());

  // Step 3: Create DLMM pool
  console.log("\nStep 3: Creating DLMM pool...");
  
  // For a 1:1 price ratio, active bin should be around 0
  const activeId = new BN(0);
  
  try {
    // Create customizable permissionless pair
    const createPoolTx = await DLMM.createCustomizablePermissionlessLbPair(
      connection,
      BIN_STEP,           // binStep
      baseMint,           // tokenX
      quoteMint,          // tokenY
      activeId,           // activeId
      FEE_BPS,            // feeBps
      ActivationType.Timestamp, // activationType
      false,              // hasAlphaVault
      admin.publicKey,    // creatorKey
      undefined,          // activationPoint (optional)
    );

    const txHash = await connection.sendTransaction(createPoolTx, [admin]);
    console.log("  Create pool tx:", txHash);
    
    await connection.confirmTransaction(txHash, "confirmed");
    console.log("  Pool created!");

    // Derive pool address (customizable permissionless uses different derivation)
    // Let's fetch it from logs or derive it
    const txInfo = await connection.getTransaction(txHash, { commitment: "confirmed" });
    console.log("  Looking for pool address in logs...");
    
    // Try to find pool in the accounts touched
    let poolAddress: PublicKey | undefined;
    
    // Alternative: derive it
    const [derivedPool] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("lb_pair"),
        baseMint.toBuffer(),
        quoteMint.toBuffer(),
        new BN(25).toArrayLike(Buffer, "le", 2),
      ],
      new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo")
    );
    poolAddress = derivedPool;
    console.log("  Derived pool address:", poolAddress.toString());

    // Verify pool exists
    const poolInfo = await connection.getAccountInfo(poolAddress);
    if (!poolInfo) {
      console.log("  Pool not at derived address, trying to find it...");
      // The actual derivation might be different - let's just look for new accounts
      throw new Error("Could not find pool address");
    }

    // Step 4: Add liquidity
    console.log("\nStep 4: Adding liquidity...");

    const dlmmPool = await DLMM.create(connection, poolAddress);
    
    // Create position and add liquidity around active bin
    const activeBinId = activeId.toNumber();
    const minBinId = activeBinId - 10;
    const maxBinId = activeBinId + 10;

    const positionKeypair = Keypair.generate();
    
    const addLiquidityTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      user: admin.publicKey,
      totalXAmount: new BN(INITIAL_BASE_AMOUNT),
      totalYAmount: new BN(INITIAL_QUOTE_AMOUNT),
      strategy: {
        minBinId,
        maxBinId,
        strategyType: StrategyType.Spot,
      },
    });

    const addLiqSig = await connection.sendTransaction(addLiquidityTx, [admin, positionKeypair]);
    await connection.confirmTransaction(addLiqSig, "confirmed");
    console.log("  Liquidity tx:", addLiqSig);

    // Output summary
    console.log("\n=== SETUP COMPLETE ===\n");
    console.log("Add these to your test config:\n");
    console.log(`DLMM_POOL: "${poolAddress.toString()}"`);
    console.log(`BASE_MINT: "${baseMint.toString()}"`);
    console.log(`QUOTE_MINT: "${quoteMint.toString()}"`);
    console.log(`BIN_STEP: 25`);
    console.log(`ADMIN: "${admin.publicKey.toString()}"`);

    // Save to file
    const config = {
      pool: poolAddress.toString(),
      baseMint: baseMint.toString(),
      quoteMint: quoteMint.toString(),
      binStep: 25,
      admin: admin.publicKey.toString(),
      adminBaseAta: adminBaseAta.address.toString(),
      adminQuoteAta: adminQuoteAta.address.toString(),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync("./devnet-dlmm-config.json", JSON.stringify(config, null, 2));
    console.log("\nConfig saved to devnet-dlmm-config.json");

  } catch (e: any) {
    console.error("Error creating pool:", e.message || e);
    console.error(e);
  }
}

main().catch(console.error);
