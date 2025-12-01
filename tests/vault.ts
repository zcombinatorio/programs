import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  getAccount,
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
  let vaultTokenAcc: PublicKey;
  let condMint0: PublicKey;
  let condMint1: PublicKey;
  let condMint2: PublicKey;

  // User token accounts
  let userAta: PublicKey;

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

    // Derive vault's token account (ATA)
    vaultTokenAcc = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: vaultPda,
    });

    // Create user ATA for regular mint and fund it
    const userAtaAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey
    );
    userAta = userAtaAccount.address;

    // Mint some tokens for testing
    await mintTo(
      provider.connection,
      wallet.payer,
      mint,
      userAta,
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
    const initialUserBalance = (await getAccount(provider.connection, userAta))
      .amount;

    const builder = await client.deposit(
      wallet.publicKey,
      vaultPda,
      DEPOSIT_AMOUNT
    );
    await builder.rpc();

    // Fetch vault to get user conditional token addresses
    const vault = await client.fetchVault(vaultPda);
    const userCondAta0 = anchor.utils.token.associatedAddress({
      mint: vault.condMints[0],
      owner: wallet.publicKey,
    });
    const userCondAta1 = anchor.utils.token.associatedAddress({
      mint: vault.condMints[1],
      owner: wallet.publicKey,
    });
    const userCondAta2 = anchor.utils.token.associatedAddress({
      mint: vault.condMints[2],
      owner: wallet.publicKey,
    });

    // Verify user received conditional tokens
    const userCond0 = await getAccount(provider.connection, userCondAta0);
    const userCond1 = await getAccount(provider.connection, userCondAta1);
    const userCond2 = await getAccount(provider.connection, userCondAta2);

    expect(Number(userCond0.amount)).to.equal(DEPOSIT_AMOUNT);
    expect(Number(userCond1.amount)).to.equal(DEPOSIT_AMOUNT);
    expect(Number(userCond2.amount)).to.equal(DEPOSIT_AMOUNT);

    // Verify user's regular tokens decreased
    const finalUserBalance = (await getAccount(provider.connection, userAta))
      .amount;
    expect(Number(initialUserBalance) - Number(finalUserBalance)).to.equal(
      DEPOSIT_AMOUNT
    );

    // Verify vault received the tokens
    const vaultBalance = (await getAccount(provider.connection, vaultTokenAcc))
      .amount;
    expect(Number(vaultBalance)).to.equal(DEPOSIT_AMOUNT);
  });

  it("withdraws half", async () => {
    const withdrawAmount = DEPOSIT_AMOUNT / 2;

    const builder = await client.withdraw(
      wallet.publicKey,
      vaultPda,
      withdrawAmount
    );
    await builder.rpc();

    // Fetch vault to get user conditional token addresses
    const vault = await client.fetchVault(vaultPda);
    const userCondAta0 = anchor.utils.token.associatedAddress({
      mint: vault.condMints[0],
      owner: wallet.publicKey,
    });
    const userCondAta1 = anchor.utils.token.associatedAddress({
      mint: vault.condMints[1],
      owner: wallet.publicKey,
    });
    const userCondAta2 = anchor.utils.token.associatedAddress({
      mint: vault.condMints[2],
      owner: wallet.publicKey,
    });

    // Verify conditional tokens decreased
    const userCond0 = await getAccount(provider.connection, userCondAta0);
    const userCond1 = await getAccount(provider.connection, userCondAta1);
    const userCond2 = await getAccount(provider.connection, userCondAta2);

    expect(Number(userCond0.amount)).to.equal(DEPOSIT_AMOUNT - withdrawAmount);
    expect(Number(userCond1.amount)).to.equal(DEPOSIT_AMOUNT - withdrawAmount);
    expect(Number(userCond2.amount)).to.equal(DEPOSIT_AMOUNT - withdrawAmount);

    // Verify vault balance decreased
    const vaultBalance = (await getAccount(provider.connection, vaultTokenAcc))
      .amount;
    expect(Number(vaultBalance)).to.equal(DEPOSIT_AMOUNT - withdrawAmount);
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

    const initialUserBalance = (await getAccount(provider.connection, userAta))
      .amount;

    const builder = await client.redeemWinnings(wallet.publicKey, vaultPda);
    await builder.rpc();

    // Verify user received winnings (winning option was 0)
    const finalUserBalance = (await getAccount(provider.connection, userAta))
      .amount;
    expect(Number(finalUserBalance) - Number(initialUserBalance)).to.equal(
      remainingCondTokens
    );

    // Verify vault balance is now 0
    const vaultBalance = (await getAccount(provider.connection, vaultTokenAcc))
      .amount;
    expect(Number(vaultBalance)).to.equal(0);
  });
});
