/**
 * Initialize Redemption Vault Script
 * 
 * Reads config from Anchor.toml automatically.
 * 
 * Usage:
 *   npx tsx scripts/init-vault.ts
 *   npx tsx scripts/init-vault.ts --cluster devnet
 *   npx tsx scripts/init-vault.ts --cluster mainnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as toml from "toml";

import { Redemption } from "../target/types/redemption";

// ============================================
// CONFIGURATION - Edit these values
// ============================================

// Base mint (token users send in) - FAIR token, 9 decimals
const BASE_MINT = new PublicKey("Fairr196TRbroavk2QhRb3RRDH1ZpdWC3yJDTDDestar");
const BASE_DECIMALS = 9;

// Quote mint (token users receive) - USDC, 6 decimals  
const QUOTE_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const QUOTE_DECIMALS = 6;

// Price: 0.000276 USDC per FAIR token
// price = 0.000276 * 10^6 = 276
const PRICE = 276;

// Initial deposit: 10 USDC
const DEPOSIT_AMOUNT = 10 * 10 ** QUOTE_DECIMALS; // 10_000_000

// Vault nonce (change this to create multiple vaults)
const NONCE = 1;

// ============================================
// LOAD ANCHOR.TOML CONFIG
// ============================================

interface AnchorToml {
  provider: {
    cluster: string;
    wallet: string;
  };
}

function loadAnchorToml(): AnchorToml {
  const tomlPath = path.resolve(__dirname, "../Anchor.toml");
  const content = fs.readFileSync(tomlPath, "utf-8");
  return toml.parse(content) as AnchorToml;
}

function resolveClusterUrl(cluster: string): string {
  switch (cluster) {
    case "localnet":
      return "http://127.0.0.1:8899";
    case "devnet":
      return "https://api.devnet.solana.com";
    case "mainnet":
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    default:
      // Assume it's a URL
      return cluster;
  }
}

function loadWallet(walletPath: string): Keypair {
  const resolved = walletPath.startsWith("~")
    ? walletPath.replace("~", process.env.HOME || "")
    : path.resolve(__dirname, "..", walletPath);
  const secretKey = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// ============================================
// SCRIPT
// ============================================

const VAULT_SEED = Buffer.from("redemption");

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  let clusterOverride: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cluster" && args[i + 1]) {
      clusterOverride = args[i + 1];
    }
  }

  // Load config from Anchor.toml
  const config = loadAnchorToml();
  const cluster = clusterOverride || config.provider.cluster;
  const clusterUrl = resolveClusterUrl(cluster);
  const walletKeypair = loadWallet(config.provider.wallet);
  const wallet = new Wallet(walletKeypair);

  // Setup connection and provider
  const connection = new Connection(clusterUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program from IDL
  const idlPath = path.resolve(__dirname, "../target/idl/redemption.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<Redemption>(idl, provider);

  console.log("=== Redemption Vault Initialization ===\n");
  console.log("Cluster:", cluster, `(${clusterUrl})`);
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin:", wallet.publicKey.toBase58());
  console.log("Base Mint:", BASE_MINT.toBase58());
  console.log("Quote Mint:", QUOTE_MINT.toBase58());
  console.log("Price:", PRICE, `(${PRICE / 10 ** QUOTE_DECIMALS} quote per base)`);
  console.log("Deposit:", DEPOSIT_AMOUNT / 10 ** QUOTE_DECIMALS, "quote tokens");
  console.log("Nonce:", NONCE);
  console.log();

  // Derive vault PDA
  const nonceBuffer = Buffer.alloc(2);
  nonceBuffer.writeUInt16LE(NONCE);
  const [vault, bump] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, BASE_MINT.toBuffer(), QUOTE_MINT.toBuffer(), nonceBuffer],
    program.programId
  );
  console.log("Vault PDA:", vault.toBase58());

  // Get vault ATAs
  const vaultQuoteAta = await getAssociatedTokenAddress(QUOTE_MINT, vault, true);
  const vaultBaseAta = await getAssociatedTokenAddress(BASE_MINT, vault, true);
  console.log("Vault Quote ATA:", vaultQuoteAta.toBase58());
  console.log("Vault Base ATA:", vaultBaseAta.toBase58());

  // Get admin quote ATA
  const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    QUOTE_MINT,
    wallet.publicKey
  );
  const adminQuoteAta = adminQuoteAccount.address;
  console.log("Admin Quote ATA:", adminQuoteAta.toBase58());

  // Check admin has enough quote tokens
  const adminQuoteBalance = await connection.getTokenAccountBalance(adminQuoteAta);
  console.log("Admin Quote Balance:", Number(adminQuoteBalance.value.amount) / 10 ** QUOTE_DECIMALS);
  
  if (Number(adminQuoteBalance.value.amount) < DEPOSIT_AMOUNT) {
    console.error("\n❌ Error: Insufficient quote token balance for deposit");
    console.error(`   Need: ${DEPOSIT_AMOUNT / 10 ** QUOTE_DECIMALS}`);
    console.error(`   Have: ${Number(adminQuoteBalance.value.amount) / 10 ** QUOTE_DECIMALS}`);
    process.exit(1);
  }

  console.log("\nInitializing vault...");

  // Initialize vault
  const tx = await program.methods
    .initialize(NONCE, new BN(PRICE), new BN(DEPOSIT_AMOUNT))
    .accountsPartial({
      admin: wallet.publicKey,
      baseMint: BASE_MINT,
      quoteMint: QUOTE_MINT,
      adminQuoteAta,
      baseTokenProgram: TOKEN_PROGRAM_ID,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("\n✅ Vault initialized!");
  console.log("Transaction:", tx);
  console.log("\n=== Vault Details ===");
  console.log("Vault Address:", vault.toBase58());
  console.log("Base Mint:", BASE_MINT.toBase58());
  console.log("Quote Mint:", QUOTE_MINT.toBase58());
  console.log("Price:", PRICE);
  console.log("Nonce:", NONCE);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
