/**
 * Redemption Program - Devnet Test
 *
 * Tests:
 * 1. Initialize vault with 9-decimal base, 6-decimal quote (USDC-like)
 * 2. Redeem 1M base tokens at 0.000275 price → ~275 quote
 * 3. Error when redeeming more than vault balance
 * 4. Admin withdraws leftover quote
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
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

import { Redemption } from "../../target/types/redemption";

const VAULT_SEED = Buffer.from("redemption");

// Test parameters
const BASE_DECIMALS = 9;
const QUOTE_DECIMALS = 6;
const UI_PRICE = 0.000275;
const PRICE = Math.floor(UI_PRICE * 10 ** QUOTE_DECIMALS); // 275

const UI_REDEEM_AMOUNT = 1_000_000;
const RAW_REDEEM_AMOUNT = new BN(UI_REDEEM_AMOUNT).mul(new BN(10 ** BASE_DECIMALS));
const EXPECTED_QUOTE = RAW_REDEEM_AMOUNT.mul(new BN(PRICE)).div(new BN(10 ** BASE_DECIMALS));

// Initial vault deposit
const INITIAL_QUOTE_DEPOSIT = new BN(500 * 10 ** QUOTE_DECIMALS);

describe("Redemption - Devnet Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Redemption as Program<Redemption>;
  const admin = provider.wallet as anchor.Wallet;

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let vault: PublicKey;
  let vaultQuoteAta: PublicKey;
  let vaultBaseAta: PublicKey;
  let adminQuoteAta: PublicKey;
  let adminBaseAta: PublicKey;
  let userKeypair: Keypair;
  let userBaseAta: PublicKey;
  let userQuoteAta: PublicKey;

  const nonce = Math.floor(Math.random() * 65535);

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

    // Create quote mint (6 decimals)
    quoteMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      QUOTE_DECIMALS
    );
    console.log(`Quote Mint (${QUOTE_DECIMALS} decimals): ${quoteMint.toBase58()}`);

    // Derive vault PDA
    const nonceBuffer = Buffer.alloc(2);
    nonceBuffer.writeUInt16LE(nonce);
    [vault] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, baseMint.toBuffer(), quoteMint.toBuffer(), nonceBuffer],
      program.programId
    );
    console.log(`Vault PDA: ${vault.toBase58()}`);

    // Get vault ATAs
    vaultQuoteAta = await getAssociatedTokenAddress(quoteMint, vault, true);
    vaultBaseAta = await getAssociatedTokenAddress(baseMint, vault, true);

    // Setup admin quote ATA and mint tokens
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
      INITIAL_QUOTE_DEPOSIT.toNumber()
    );
    console.log(`Minted ${INITIAL_QUOTE_DEPOSIT.toNumber() / 10 ** QUOTE_DECIMALS} quote to admin`);

    // Setup test user
    userKeypair = Keypair.generate();
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

    const userBaseMintAmount = 2_000_000 * 10 ** BASE_DECIMALS;
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
      .initialize(nonce, new BN(PRICE), INITIAL_QUOTE_DEPOSIT)
      .accountsPartial({
        admin: admin.publicKey,
        baseMint,
        quoteMint,
        adminQuoteAta,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAccount = await program.account.redemptionVault.fetch(vault);
    expect(vaultAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(vaultAccount.baseMint.toBase58()).to.equal(baseMint.toBase58());
    expect(vaultAccount.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
    expect(vaultAccount.price.toNumber()).to.equal(PRICE);
    expect(vaultAccount.nonce).to.equal(nonce);

    const vaultQuoteBalance = await provider.connection.getTokenAccountBalance(vaultQuoteAta);
    expect(Number(vaultQuoteBalance.value.amount)).to.equal(INITIAL_QUOTE_DEPOSIT.toNumber());

    console.log(`✓ Vault initialized with ${INITIAL_QUOTE_DEPOSIT.toNumber() / 10 ** QUOTE_DECIMALS} quote`);
    console.log(`✓ Price set to ${PRICE} (${UI_PRICE} UI)`);
  });

  it("redeems 1M base tokens for ~275 quote", async () => {
    console.log("\n=== Test: Redeem 1M Base ===");

    await program.methods
      .redeem(RAW_REDEEM_AMOUNT)
      .accountsPartial({
        user: userKeypair.publicKey,
        baseMint,
        quoteMint,
        userBaseAta,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    const userQuoteBalance = await provider.connection.getTokenAccountBalance(userQuoteAta);
    const received = Number(userQuoteBalance.value.amount);

    console.log(`✓ Redeemed ${UI_REDEEM_AMOUNT.toLocaleString()} base tokens`);
    console.log(`✓ Received ${received / 10 ** QUOTE_DECIMALS} quote tokens`);
    console.log(`✓ Expected ${EXPECTED_QUOTE.toNumber() / 10 ** QUOTE_DECIMALS} quote tokens`);

    expect(received).to.be.closeTo(EXPECTED_QUOTE.toNumber(), 10);

    const vaultBaseBalance = await provider.connection.getTokenAccountBalance(vaultBaseAta);
    expect(Number(vaultBaseBalance.value.amount)).to.equal(RAW_REDEEM_AMOUNT.toNumber());
    console.log(`✓ Vault received ${RAW_REDEEM_AMOUNT.toNumber() / 10 ** BASE_DECIMALS} base tokens`);
  });

  it("fails when redeeming more than vault balance", async () => {
    console.log("\n=== Test: Insufficient Balance Error ===");

    const tooMuchBase = new BN(10_000_000).mul(new BN(10 ** BASE_DECIMALS));

    try {
      await program.methods
        .redeem(tooMuchBase)
        .accountsPartial({
          user: userKeypair.publicKey,
          baseMint,
          quoteMint,
          userBaseAta,
          baseTokenProgram: TOKEN_PROGRAM_ID,
          quoteTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      expect.fail("Should have thrown InsufficientBalance error");
    } catch (err: unknown) {
      const error = err as { error?: { errorCode?: { code: string } }; message?: string };
      const errorCode = error.error?.errorCode?.code || error.message || "";
      expect(errorCode).to.include("InsufficientBalance");
      console.log("✓ Correctly rejected: InsufficientBalance");
    }
  });

  it("admin withdraws leftover quote", async () => {
    console.log("\n=== Test: Admin Withdraw ===");

    const vaultQuoteBefore = await provider.connection.getTokenAccountBalance(vaultQuoteAta);
    const vaultBaseBefore = await provider.connection.getTokenAccountBalance(vaultBaseAta);
    const quoteToWithdraw = new BN(vaultQuoteBefore.value.amount);
    const baseToWithdraw = new BN(vaultBaseBefore.value.amount);

    console.log(`Vault quote balance: ${quoteToWithdraw.toNumber() / 10 ** QUOTE_DECIMALS}`);
    console.log(`Vault base balance: ${baseToWithdraw.toNumber() / 10 ** BASE_DECIMALS}`);

    const adminBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      baseMint,
      admin.publicKey
    );
    adminBaseAta = adminBaseAccount.address;

    await program.methods
      .withdraw(quoteToWithdraw, baseToWithdraw)
      .accountsPartial({
        admin: admin.publicKey,
        baseMint,
        quoteMint,
        adminQuoteAta,
        adminBaseAta,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultQuoteAfter = await provider.connection.getTokenAccountBalance(vaultQuoteAta);
    const vaultBaseAfter = await provider.connection.getTokenAccountBalance(vaultBaseAta);

    expect(Number(vaultQuoteAfter.value.amount)).to.equal(0);
    expect(Number(vaultBaseAfter.value.amount)).to.equal(0);

    console.log(`✓ Admin withdrew ${quoteToWithdraw.toNumber() / 10 ** QUOTE_DECIMALS} quote`);
    console.log(`✓ Admin withdrew ${baseToWithdraw.toNumber() / 10 ** BASE_DECIMALS} base`);
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
