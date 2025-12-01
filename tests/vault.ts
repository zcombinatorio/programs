import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

import { VaultClient, VaultType } from "../sdk/src";

describe("vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  const client = new VaultClient(provider);

  // Test params
  const proposalId = 1;
  const vaultType = VaultType.Base;

  // Accounts we'll initialize
  let mint: PublicKey;
  let vaultPda: PublicKey;
  let condMint0: PublicKey;
  let condMint1: PublicKey;
  let condMint2: PublicKey;

  const DEPOSIT_AMOUNT = 1_000_000; // 1 token (6 decimals)

  before(async () => {
    // Create a regular mint for the vault
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey, // mint authority
      null, // freeze authority
      6 // decimals
    );

    // Derive vault PDA using SDK
    [vaultPda] = client.deriveVaultPDA(wallet.publicKey, proposalId, vaultType);

    // Create user ATA for regular mint and fund it
    const userAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey
    );

    // Mint some tokens for testing
    await mintTo(
      provider.connection,
      wallet.payer,
      mint,
      userAta.address,
      wallet.publicKey,
      DEPOSIT_AMOUNT * 10 // Mint 10 tokens for testing
    );
  });

  it("initializes vault", async () => {
    const {
      builder,
      vaultPda: pda,
      condMint0: cm0,
      condMint1: cm1,
    } = client.initialize(wallet.publicKey, mint, vaultType, proposalId);

    condMint0 = cm0;
    condMint1 = cm1;

    await builder.rpc();

    // Verify
    const vaultAccount = await client.fetchVault(pda);
    expect(vaultAccount.owner.toBase58()).to.equal(wallet.publicKey.toBase58());
    expect(vaultAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(vaultAccount.numOptions).to.equal(2);
    expect(vaultAccount.state).to.equal("setup");
    expect(vaultAccount.condMints[0].toBase58()).to.equal(condMint0.toBase58());
    expect(vaultAccount.condMints[1].toBase58()).to.equal(condMint1.toBase58());
  });

  it("adds option", async () => {
    const { builder, condMint } = await client.addOption(
      wallet.publicKey,
      vaultPda
    );
    condMint2 = condMint;

    await builder.rpc();

    // Verify
    const vaultAccount = await client.fetchVault(vaultPda);
    expect(vaultAccount.numOptions).to.equal(3);
    expect(vaultAccount.condMints[2].toBase58()).to.equal(condMint2.toBase58());
  });

  it("activates vault", async () => {
    await client.activate(wallet.publicKey, vaultPda).rpc();

    // Verify
    const vaultAccount = await client.fetchVault(vaultPda);
    expect(vaultAccount.state).to.equal("active");
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
    await builder.rpc();

    const { userBalance, condBalances } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );
    const vaultBalance = await client.fetchVaultBalance(vaultPda);

    // Verify user received conditional tokens
    expect(condBalances).to.deep.equal([
      DEPOSIT_AMOUNT,
      DEPOSIT_AMOUNT,
      DEPOSIT_AMOUNT,
    ]);

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
    await builder.rpc();

    const { condBalances } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );
    const vaultBalance = await client.fetchVaultBalance(vaultPda);

    // Verify conditional tokens decreased
    const expectedBalance = DEPOSIT_AMOUNT - withdrawAmount;
    expect(condBalances).to.deep.equal([
      expectedBalance,
      expectedBalance,
      expectedBalance,
    ]);

    // Verify vault balance decreased
    expect(vaultBalance).to.equal(expectedBalance);
  });

  it("finalizes vault with winning option", async () => {
    const winningIdx = 0;

    await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();

    // Verify
    const vaultAccount = await client.fetchVault(vaultPda);
    expect(vaultAccount.state).to.equal("finalized");
    expect(vaultAccount.winningIdx).to.equal(winningIdx);
  });

  it("redeems winnings", async () => {
    const remainingCondTokens = DEPOSIT_AMOUNT / 2; // After withdraw half

    const { userBalance: initialUserBalance } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );

    const builder = await client.redeemWinnings(wallet.publicKey, vaultPda);
    await builder.rpc();

    const { userBalance } = await client.fetchUserBalances(
      vaultPda,
      wallet.publicKey
    );
    const vaultBalance = await client.fetchVaultBalance(vaultPda);

    // Verify user received winnings (winning option was 0)
    expect(userBalance - initialUserBalance).to.equal(remainingCondTokens);

    // Verify vault balance is now 0
    expect(vaultBalance).to.equal(0);
  });
});
