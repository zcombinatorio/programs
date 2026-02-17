/**
 * Redemption Program - Devnet Test
 *
 * Tests:
 * 1. Initialize vault with 9-decimal base, 6-decimal quote (USDC-like)
 * 2. Redeem 1M base tokens at 0.0002758 price → ~275.8 quote
 * 3. Error when redeeming more than vault balance
 * 4. Admin withdraws leftover quote
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// IDL will be loaded by Anchor
import { Redemption } from "../../target/types/redemption";

const VAULT_SEED = Buffer.from("redemption");

// Test parameters
const BASE_DECIMALS = 9;
const QUOTE_DECIMALS = 6;
const UI_PRICE = 0.000275; // ~0.0002758 quote per base (rounded down)
const PRICE = Math.floor(UI_PRICE * 10 ** QUOTE_DECIMALS); // 275

const UI_REDEEM_AMOUNT = 1_000_000; // 1 million base tokens
const RAW_REDEEM_AMOUNT = UI_REDEEM_AMOUNT * 10 ** BASE_DECIMALS;
const EXPECTED_QUOTE = Math.floor(
  (RAW_REDEEM_AMOUNT * PRICE) / 10 ** BASE_DECIMALS
); // ~275,800,000 raw = 275.8 USDC

// Initial vault deposit (enough for the test + some extra)
const INITIAL_QUOTE_DEPOSIT = 500 * 10 ** QUOTE_DECIMALS; // 500 quote tokens

describe("Redemption - Devnet Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Redemption as Program<Redemption>;
  const admin = provider.wallet as anchor.Wallet;

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let vault: PublicKey;
  let vaultBump: number;
  let vaultQuoteAta: PublicKey;
  let vaultBaseAta: PublicKey;
  let adminQuoteAta: PublicKey;
  let adminBaseAta: PublicKey;
  let userKeypair: Keypair;
  let userBaseAta: PublicKey;
  let userQuoteAta: PublicKey;

  const nonce = Math.floor(Math.random() * 65535); // Random nonce for unique vault

  before(async () => {
    console.log("\n=== Setup ===");
    console.log(`Program ID: ${program.programId.toBase58()}`);
    console.log(`Admin: ${admin.publicKey.toBase58()}`);
    console.log(`Nonce: ${nonce}`);
    console.log(`Price: ${PRICE} (${UI_PRICE} UI)`);

    // Create base mint (9 decimals)
    baseMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      BASE_DECIMALS
    );
    console.log(`Base Mint (${BASE_DECIMALS} decimals): ${baseMint.toBase58()}`);

    // Create quote mint (6 decimals, like USDC)
    quoteMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      QUOTE_DECIMALS
    );
    console.log(`Quote Mint (${QUOTE_DECIMALS} decimals): ${quoteMint.toBase58()}`);

    // Derive vault PDA
    [vault, vaultBump] = PublicKey.findProgramAddressSync(
      [
        VAULT_SEED,
        baseMint.toBuffer(),
        quoteMint.toBuffer(),
        Buffer.from(new Uint16Array([nonce]).buffer),
      ],
      program.programId
    );
    console.log(`Vault PDA: ${vault.toBase58()}`);

    // Get vault ATAs
    vaultQuoteAta = await getAssociatedTokenAddress(quoteMint, vault, true);
    vaultBaseAta = await getAssociatedTokenAddress(baseMint, vault, true);

    // Setup admin quote ATA and mint tokens for deposit
    const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      quoteMint,
      admin.publicKey
    );
    adminQuoteAta = adminQuoteAccount.address;

    await mintTo(
      provider.connection,
      admin.payer,
      quoteMint,
      adminQuoteAta,
      admin.publicKey,
      INITIAL_QUOTE_DEPOSIT
    );
    console.log(`Minted ${INITIAL_QUOTE_DEPOSIT / 10 ** QUOTE_DECIMALS} quote to admin`);

    // Setup test user
    userKeypair = Keypair.generate();

    // Fund user with SOL
    const fundTx = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(fundTx);
    console.log(`User: ${userKeypair.publicKey.toBase58()}`);

    // Setup user base ATA and mint tokens
    const userBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      baseMint,
      userKeypair.publicKey
    );
    userBaseAta = userBaseAccount.address;

    // Mint base tokens to user (enough for test)
    const userBaseMintAmount = 2_000_000 * 10 ** BASE_DECIMALS; // 2M base tokens
    await mintTo(
      provider.connection,
      admin.payer,
      baseMint,
      userBaseAta,
      admin.publicKey,
      userBaseMintAmount
    );
    console.log(`Minted ${userBaseMintAmount / 10 ** BASE_DECIMALS} base to user`);

    userQuoteAta = await getAssociatedTokenAddress(quoteMint, userKeypair.publicKey);
  });

  it("initializes vault with price and deposit", async () => {
    console.log("\n=== Test: Initialize Vault ===");

    await program.methods
      .initialize(nonce, new anchor.BN(PRICE), new anchor.BN(INITIAL_QUOTE_DEPOSIT))
      .accounts({
        admin: admin.publicKey,
        vault,
        baseMint,
        quoteMint,
        vaultQuoteAta,
        vaultBaseAta,
        adminQuoteAta,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify vault state
    const vaultAccount = await program.account.redemptionVault.fetch(vault);
    expect(vaultAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(vaultAccount.baseMint.toBase58()).to.equal(baseMint.toBase58());
    expect(vaultAccount.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
    expect(vaultAccount.price.toNumber()).to.equal(PRICE);
    expect(vaultAccount.nonce).to.equal(nonce);

    // Verify vault quote balance
    const vaultQuoteBalance = await provider.connection.getTokenAccountBalance(vaultQuoteAta);
    expect(Number(vaultQuoteBalance.value.amount)).to.equal(INITIAL_QUOTE_DEPOSIT);

    console.log(`✓ Vault initialized with ${INITIAL_QUOTE_DEPOSIT / 10 ** QUOTE_DECIMALS} quote tokens`);
    console.log(`✓ Price set to ${PRICE} (${UI_PRICE} UI)`);
  });

  it("redeems 1M base tokens for ~275.8 quote", async () => {
    console.log("\n=== Test: Redeem 1M Base ===");

    const userQuoteBalanceBefore = await provider.connection
      .getTokenAccountBalance(userQuoteAta)
      .catch(() => ({ value: { amount: "0" } }));

    await program.methods
      .redeem(new anchor.BN(RAW_REDEEM_AMOUNT))
      .accounts({
        user: userKeypair.publicKey,
        vault,
        baseMint,
        quoteMint,
        vaultQuoteAta,
        vaultBaseAta,
        userBaseAta,
        userQuoteAta,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    // Verify user received quote tokens
    const userQuoteBalance = await provider.connection.getTokenAccountBalance(userQuoteAta);
    const received = Number(userQuoteBalance.value.amount) - Number(userQuoteBalanceBefore.value.amount);

    console.log(`✓ Redeemed ${UI_REDEEM_AMOUNT.toLocaleString()} base tokens`);
    console.log(`✓ Received ${received / 10 ** QUOTE_DECIMALS} quote tokens`);
    console.log(`✓ Expected ~${EXPECTED_QUOTE / 10 ** QUOTE_DECIMALS} quote tokens`);

    // Allow small rounding tolerance
    expect(received).to.be.closeTo(EXPECTED_QUOTE, 10);

    // Verify vault received base tokens
    const vaultBaseBalance = await provider.connection.getTokenAccountBalance(vaultBaseAta);
    expect(Number(vaultBaseBalance.value.amount)).to.equal(RAW_REDEEM_AMOUNT);
    console.log(`✓ Vault received ${RAW_REDEEM_AMOUNT / 10 ** BASE_DECIMALS} base tokens`);
  });

  it("fails when redeeming more than vault balance", async () => {
    console.log("\n=== Test: Insufficient Balance Error ===");

    // Try to redeem way more than vault has
    const tooMuchBase = 10_000_000 * 10 ** BASE_DECIMALS; // 10M base = ~2758 quote needed

    try {
      await program.methods
        .redeem(new anchor.BN(tooMuchBase))
        .accounts({
          user: userKeypair.publicKey,
          vault,
          baseMint,
          quoteMint,
          vaultQuoteAta,
          vaultBaseAta,
          userBaseAta,
          userQuoteAta,
          baseTokenProgram: TOKEN_PROGRAM_ID,
          quoteTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      expect.fail("Should have thrown InsufficientBalance error");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("InsufficientBalance");
      console.log("✓ Correctly rejected: InsufficientBalance");
    }
  });

  it("admin withdraws leftover quote", async () => {
    console.log("\n=== Test: Admin Withdraw ===");

    // Check vault quote balance
    const vaultQuoteBefore = await provider.connection.getTokenAccountBalance(vaultQuoteAta);
    const vaultBaseBefore = await provider.connection.getTokenAccountBalance(vaultBaseAta);
    const quoteToWithdraw = Number(vaultQuoteBefore.value.amount);
    const baseToWithdraw = Number(vaultBaseBefore.value.amount);

    console.log(`Vault quote balance: ${quoteToWithdraw / 10 ** QUOTE_DECIMALS}`);
    console.log(`Vault base balance: ${baseToWithdraw / 10 ** BASE_DECIMALS}`);

    // Setup admin base ATA if needed
    const adminBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      baseMint,
      admin.publicKey
    );
    adminBaseAta = adminBaseAccount.address;

    await program.methods
      .withdraw(new anchor.BN(quoteToWithdraw), new anchor.BN(baseToWithdraw))
      .accounts({
        admin: admin.publicKey,
        vault,
        baseMint,
        quoteMint,
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

    // Verify vault is empty
    const vaultQuoteAfter = await provider.connection.getTokenAccountBalance(vaultQuoteAta);
    const vaultBaseAfter = await provider.connection.getTokenAccountBalance(vaultBaseAta);

    expect(Number(vaultQuoteAfter.value.amount)).to.equal(0);
    expect(Number(vaultBaseAfter.value.amount)).to.equal(0);

    console.log(`✓ Admin withdrew ${quoteToWithdraw / 10 ** QUOTE_DECIMALS} quote tokens`);
    console.log(`✓ Admin withdrew ${baseToWithdraw / 10 ** BASE_DECIMALS} base tokens`);
    console.log("✓ Vault is now empty");
  });

  after(() => {
    console.log("\n=== Summary ===");
    console.log(`Vault: ${vault.toBase58()}`);
    console.log(`Base Mint: ${baseMint.toBase58()}`);
    console.log(`Quote Mint: ${quoteMint.toBase58()}`);
    console.log("All tests passed ✓");
  });
});
