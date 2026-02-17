/**
 * Initialize Redemption Vault Script
 * 
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/init-vault.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

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
// SCRIPT
// ============================================

const VAULT_SEED = Buffer.from("redemption");

async function main() {
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Redemption as Program<Redemption>;
  const admin = provider.wallet;

  console.log("=== Redemption Vault Initialization ===\n");
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin:", admin.publicKey.toBase58());
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
    provider.connection,
    (admin as anchor.Wallet).payer,
    QUOTE_MINT,
    admin.publicKey
  );
  const adminQuoteAta = adminQuoteAccount.address;
  console.log("Admin Quote ATA:", adminQuoteAta.toBase58());

  // Check admin has enough quote tokens
  const adminQuoteBalance = await provider.connection.getTokenAccountBalance(adminQuoteAta);
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
      admin: admin.publicKey,
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
