/**
 * Initialize Redemption Vault Script
 * 
 * Usage: npx tsx scripts/init-vault.ts
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

import { Redemption } from "../target/types/redemption";

// ============================================
// CONFIGURATION
// ============================================

// RPC URL
const RPC_URL = "https://api.mainnet-beta.solana.com";

// Wallet path
const WALLET_PATH = ".keys/authority.json";

// Base mint (token users send in) - FAIR token, 9 decimals
const BASE_MINT = new PublicKey("Fairr196TRbroavk2QhRb3RRDH1ZpdWC3yJDTDDestar");
const BASE_DECIMALS = 9;

// Quote mint (token users receive) - USDC, 6 decimals  
const QUOTE_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const QUOTE_DECIMALS = 6;

// Price: 0.000276 USDC per FAIR token
const PRICE = 276;

// Initial deposit: 10 USDC
const DEPOSIT_AMOUNT = 10 * 10 ** QUOTE_DECIMALS;

// Vault nonce
const NONCE = 1;

// ============================================
// SCRIPT
// ============================================

const VAULT_SEED = Buffer.from("redemption");

function loadWallet(walletPath: string): Keypair {
  const resolved = walletPath.startsWith("~")
    ? walletPath.replace("~", process.env.HOME || "")
    : path.resolve(__dirname, "..", walletPath);
  const secretKey = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  const walletKeypair = loadWallet(WALLET_PATH);
  const wallet = new Wallet(walletKeypair);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idlPath = path.resolve(__dirname, "../target/idl/redemption.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<Redemption>(idl, provider);

  console.log("=== Redemption Vault Initialization ===\n");
  console.log("RPC:", RPC_URL);
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin:", wallet.publicKey.toBase58());
  console.log("Base Mint:", BASE_MINT.toBase58());
  console.log("Quote Mint:", QUOTE_MINT.toBase58());
  console.log("Price:", PRICE, `(${PRICE / 10 ** QUOTE_DECIMALS} quote per base)`);
  console.log("Deposit:", DEPOSIT_AMOUNT / 10 ** QUOTE_DECIMALS, "USDC");
  console.log("Nonce:", NONCE);
  console.log();

  // Derive vault PDA
  const nonceBuffer = Buffer.alloc(2);
  nonceBuffer.writeUInt16LE(NONCE);
  const [vault] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, BASE_MINT.toBuffer(), QUOTE_MINT.toBuffer(), nonceBuffer],
    program.programId
  );
  console.log("Vault PDA:", vault.toBase58());

  // Get ATAs
  const vaultQuoteAta = await getAssociatedTokenAddress(QUOTE_MINT, vault, true);
  const vaultBaseAta = await getAssociatedTokenAddress(BASE_MINT, vault, true);
  const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    QUOTE_MINT,
    wallet.publicKey
  );
  const adminQuoteAta = adminQuoteAccount.address;

  // Check balance
  const adminQuoteBalance = await connection.getTokenAccountBalance(adminQuoteAta);
  console.log("Admin USDC Balance:", Number(adminQuoteBalance.value.amount) / 10 ** QUOTE_DECIMALS);
  
  if (Number(adminQuoteBalance.value.amount) < DEPOSIT_AMOUNT) {
    console.error("\n❌ Insufficient USDC balance");
    console.error(`   Need: ${DEPOSIT_AMOUNT / 10 ** QUOTE_DECIMALS}`);
    console.error(`   Have: ${Number(adminQuoteBalance.value.amount) / 10 ** QUOTE_DECIMALS}`);
    process.exit(1);
  }

  console.log("\nInitializing vault...");

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
  console.log("\nVault Address:", vault.toBase58());
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
