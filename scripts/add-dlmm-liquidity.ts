/**
 * Add liquidity to the DLMM pool
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import * as fs from "fs";

const RPC_URL = "https://api.devnet.solana.com";
const ADMIN_KEYPAIR_PATH = "./test-admin.json";
const CONFIG_PATH = "./devnet-dlmm-config.json";

async function main() {
  // Load config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  console.log("Pool:", config.pool);

  // Load admin
  const adminData = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(adminData));
  console.log("Admin:", admin.publicKey.toString());

  const connection = new Connection(RPC_URL, "confirmed");

  // Load pool
  const poolAddress = new PublicKey(config.pool);
  const dlmmPool = await DLMM.create(connection, poolAddress);
  
  console.log("\nPool state:");
  console.log("  Active bin:", dlmmPool.lbPair.activeId);
  console.log("  Bin step:", dlmmPool.lbPair.binStep);

  // Add liquidity around active bin
  const activeBin = dlmmPool.lbPair.activeId;
  const minBinId = activeBin - 20;
  const maxBinId = activeBin + 20;
  
  const totalXAmount = new BN(500_000_000); // 500 BASE
  const totalYAmount = new BN(500_000_000); // 500 QUOTE

  console.log("\nAdding liquidity...");
  console.log("  X amount:", totalXAmount.toString());
  console.log("  Y amount:", totalYAmount.toString());
  console.log("  Bin range:", minBinId, "to", maxBinId);

  const positionKeypair = Keypair.generate();
  console.log("  Position pubkey:", positionKeypair.publicKey.toString());

  try {
    const tx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      user: admin.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: {
        minBinId,
        maxBinId,
        strategyType: StrategyType.Spot,
      },
    });

    const sig = await connection.sendTransaction(tx, [admin, positionKeypair]);
    console.log("  Tx:", sig);
    
    await connection.confirmTransaction(sig, "confirmed");
    console.log("  Confirmed!");

    // Update config with position
    config.positionPubkey = positionKeypair.publicKey.toString();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("\nConfig updated with position pubkey");

  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.logs) {
      console.log("Logs:", e.logs.slice(-10));
    }
  }
}

main().catch(console.error);
