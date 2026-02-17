/**
 * Withdraw All Funds from Redemption Vault
 * 
 * Usage: npx tsx scripts/withdraw-vault.ts
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

// Base mint - FAIR token, 9 decimals
const BASE_MINT = new PublicKey("Fairr196TRbroavk2QhRb3RRDH1ZpdWC3yJDTDDestar");
const BASE_DECIMALS = 9;

// Quote mint - USDC, 6 decimals  
const QUOTE_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const QUOTE_DECIMALS = 6;

// Vault nonce (must match the vault you want to withdraw from)
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

  console.log("=== Redemption Vault Withdrawal ===\n");
  console.log("RPC:", RPC_URL);
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin:", wallet.publicKey.toBase58());
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

  // Get vault ATAs
  const vaultQuoteAta = await getAssociatedTokenAddress(QUOTE_MINT, vault, true);
  const vaultBaseAta = await getAssociatedTokenAddress(BASE_MINT, vault, true);

  // Check vault balances
  let quoteBalance = 0;
  let baseBalance = 0;

  try {
    const vaultQuoteBalance = await connection.getTokenAccountBalance(vaultQuoteAta);
    quoteBalance = Number(vaultQuoteBalance.value.amount);
    console.log("Vault USDC Balance:", quoteBalance / 10 ** QUOTE_DECIMALS);
  } catch {
    console.log("Vault USDC Balance: 0 (account doesn't exist)");
  }

  try {
    const vaultBaseBalance = await connection.getTokenAccountBalance(vaultBaseAta);
    baseBalance = Number(vaultBaseBalance.value.amount);
    console.log("Vault FAIR Balance:", baseBalance / 10 ** BASE_DECIMALS);
  } catch {
    console.log("Vault FAIR Balance: 0 (account doesn't exist)");
  }

  if (quoteBalance === 0 && baseBalance === 0) {
    console.log("\n⚠️  Vault is empty, nothing to withdraw.");
    return;
  }

  // Get/create admin ATAs
  const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    QUOTE_MINT,
    wallet.publicKey
  );
  const adminQuoteAta = adminQuoteAccount.address;

  const adminBaseAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    BASE_MINT,
    wallet.publicKey
  );
  const adminBaseAta = adminBaseAccount.address;

  console.log("\nWithdrawing all funds...");

  const tx = await program.methods
    .withdraw(new BN(quoteBalance), new BN(baseBalance))
    .accountsPartial({
      admin: wallet.publicKey,
      vault,
      baseMint: BASE_MINT,
      quoteMint: QUOTE_MINT,
      vaultQuoteAta,
      vaultBaseAta,
      adminQuoteAta,
      adminBaseAta,
      baseTokenProgram: TOKEN_PROGRAM_ID,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("\n✅ Withdrawal complete!");
  console.log("Transaction:", tx);
  console.log("\nWithdrew:");
  if (quoteBalance > 0) console.log(`  ${quoteBalance / 10 ** QUOTE_DECIMALS} USDC`);
  if (baseBalance > 0) console.log(`  ${baseBalance / 10 ** BASE_DECIMALS} FAIR`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
