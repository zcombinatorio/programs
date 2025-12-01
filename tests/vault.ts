import * as anchor from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

import { VaultClient, VaultType } from "../sdk/src";

/*
 * max 5 options w/ 200k CU budget (default)
 * max 10 options w/ 400k CU budget (deposit reached ~385k CUs)
 * @ 11-12 options tx too large for user vault actions
 */
const NUM_OPTIONS = 10;
const COMPUTE_UNITS = 450_000; // Default is 200k, increase for more options

describe("vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  const client = new VaultClient(provider);

  // Test params
  const nonce = 0; // unique identifier (e.g. protocol_id)
  const proposalId = 1;
  const vaultType = VaultType.Base;

  // Accounts
  let mint: PublicKey;
  let vaultPda: PublicKey;

  const DEPOSIT_AMOUNT = 1_000_000; // 1 token (6 decimals)

  // Helper to prepend compute budget, log tx size and CUs used
  async function sendWithComputeBudget(builder: any, name: string) {
    const withBudget = builder.preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ]);
    const tx = await withBudget.transaction();
    tx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    tx.feePayer = wallet.publicKey;
    const size = tx.serialize({ requireAllSignatures: false }).length;
    const sig = await withBudget.rpc();
    const confirmedTx = await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
    });
    const cuUsed = confirmedTx?.meta?.computeUnitsConsumed ?? "unknown";
    console.log(`    ${name}: ${size} bytes | ${cuUsed} CUs`);
    return sig;
  }

  before(async () => {
    // Create a regular mint for the vault
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // Derive vault PDA using SDK
    [vaultPda] = client.deriveVaultPDA(
      wallet.publicKey,
      nonce,
      proposalId,
      vaultType
    );

    // Create user ATA for regular mint and fund it
    const userAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey
    );

    // Mint tokens for testing
    await mintTo(
      provider.connection,
      wallet.payer,
      mint,
      userAta.address,
      wallet.publicKey,
      DEPOSIT_AMOUNT * 10
    );
  });

  it("initializes vault", async () => {
    const { builder, vaultPda: pda } = client.initialize(
      wallet.publicKey,
      mint,
      vaultType,
      nonce,
      proposalId
    );

    await builder.rpc();

    const vault = await client.fetchVault(pda);
    expect(vault.owner.toBase58()).to.equal(wallet.publicKey.toBase58());
    expect(vault.mint.toBase58()).to.equal(mint.toBase58());
    expect(vault.numOptions).to.equal(2);
    expect(vault.state).to.equal("setup");
  });

  it("adds options", async () => {
    // Initialize creates 2 options, add more to reach NUM_OPTIONS
    for (let i = 2; i < NUM_OPTIONS; i++) {
      const { builder } = await client.addOption(wallet.publicKey, vaultPda);
      await builder.rpc();
    }

    const vault = await client.fetchVault(vaultPda);
    expect(vault.numOptions).to.equal(NUM_OPTIONS);
  });

  it("activates vault", async () => {
    await client.activate(wallet.publicKey, vaultPda).rpc();

    const vault = await client.fetchVault(vaultPda);
    expect(vault.state).to.equal("active");
  });

  it("deposits and receives conditional tokens", async () => {
    const { userBalance: initialUserBalance } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );

    const builder = await client.deposit(
      wallet.publicKey,
      vaultPda,
      DEPOSIT_AMOUNT
    );
    await sendWithComputeBudget(builder, "deposit");

    const { userBalance, condBalances } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );
    const vaultBalance = await client.fetchVaultBalance(vaultPda);

    // Verify user received conditional tokens for all options
    expect(condBalances).to.deep.equal(Array(NUM_OPTIONS).fill(DEPOSIT_AMOUNT));

    // Verify user's regular tokens decreased
    expect(initialUserBalance - userBalance).to.equal(DEPOSIT_AMOUNT);

    // Verify vault received the tokens
    expect(vaultBalance).to.equal(DEPOSIT_AMOUNT);
  });

  it("withdraws half", async () => {
    const withdrawAmount = DEPOSIT_AMOUNT / 2;

    const builder = await client.withdraw(
      wallet.publicKey,
      vaultPda,
      withdrawAmount
    );
    await sendWithComputeBudget(builder, "withdraw");

    const { condBalances } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );
    const vaultBalance = await client.fetchVaultBalance(vaultPda);

    const expectedBalance = DEPOSIT_AMOUNT - withdrawAmount;
    expect(condBalances).to.deep.equal(
      Array(NUM_OPTIONS).fill(expectedBalance)
    );
    expect(vaultBalance).to.equal(expectedBalance);
  });

  it("finalizes vault with winning option", async () => {
    const winningIdx = 0;

    await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();

    const vault = await client.fetchVault(vaultPda);
    expect(vault.state).to.equal("finalized");
    expect(vault.winningIdx).to.equal(winningIdx);
  });

  it("redeems winnings", async () => {
    const remainingCondTokens = DEPOSIT_AMOUNT / 2;

    const { userBalance: initialUserBalance } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );

    const builder = await client.redeemWinnings(wallet.publicKey, vaultPda);
    await sendWithComputeBudget(builder, "redeemWinnings");

    const { userBalance } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );
    const vaultBalance = await client.fetchVaultBalance(vaultPda);

    expect(userBalance - initialUserBalance).to.equal(remainingCondTokens);
    expect(vaultBalance).to.equal(0);
  });
});
