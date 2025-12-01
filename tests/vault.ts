import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vault } from "../target/types/vault";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  getAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Vault as Program<Vault>;
  const wallet = provider.wallet as anchor.Wallet;

  // Seeds (must match Rust constants)
  const VAULT_SEED = Buffer.from("vault");
  const CONDITIONAL_MINT_SEED = Buffer.from("cmint");

  // Test params
  const proposalId = 1;
  const vaultType = { base: {} }; // or { quote: {} }

  // Accounts we'll initialize
  let mint: PublicKey;
  let vaultBump: number;
  let vaultPda: PublicKey;
  let vaultTokenAcc: PublicKey;
  let condMint0: PublicKey;
  let condMint1: PublicKey;
  let condMint2: PublicKey;

  // User token accounts
  let userAta: PublicKey;
  let userCondAta0: PublicKey;
  let userCondAta1: PublicKey;
  let userCondAta2: PublicKey;

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

    // Derive vault PDA
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [
        VAULT_SEED,
        wallet.publicKey.toBuffer(),
        Buffer.from([proposalId]),
        Buffer.from([0]), // vaultType as u8 (Base = 0)
      ],
      program.programId
    );

    // Derive vault's token account (ATA)
    vaultTokenAcc = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: vaultPda,
    });

    // Derive conditional mints
    [condMint0] = PublicKey.findProgramAddressSync(
      [CONDITIONAL_MINT_SEED, vaultPda.toBuffer(), Buffer.from([0])],
      program.programId
    );
    [condMint1] = PublicKey.findProgramAddressSync(
      [CONDITIONAL_MINT_SEED, vaultPda.toBuffer(), Buffer.from([1])],
      program.programId
    );
    [condMint2] = PublicKey.findProgramAddressSync(
      [CONDITIONAL_MINT_SEED, vaultPda.toBuffer(), Buffer.from([2])],
      program.programId
    );

    // Derive user ATAs for conditional mints (created later by deposit)
    userCondAta0 = await getAssociatedTokenAddress(condMint0, wallet.publicKey);
    userCondAta1 = await getAssociatedTokenAddress(condMint1, wallet.publicKey);
    userCondAta2 = await getAssociatedTokenAddress(condMint2, wallet.publicKey);

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
    await program.methods
      .initialize(vaultType, proposalId)
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
        mint: mint,
        condMint0: condMint0,
        condMint1: condMint1,
      })
      .rpc();

    // Verify
    const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
    expect(vaultAccount.owner.toBase58()).to.equal(wallet.publicKey.toBase58());
    expect(vaultAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(vaultAccount.numOptions).to.equal(2);
    expect(vaultAccount.state).to.deep.equal({ setup: {} });
    expect(vaultAccount.condMints[0].toBase58()).to.equal(condMint0.toBase58());
    expect(vaultAccount.condMints[1].toBase58()).to.equal(condMint1.toBase58());
  });

  it("adds option", async () => {
    await program.methods
      .addOption()
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
        mint: mint,
        condMint: condMint2,
      })
      .rpc();

    // Verify
    const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
    expect(vaultAccount.numOptions).to.equal(3);
    expect(vaultAccount.condMints[2].toBase58()).to.equal(condMint2.toBase58());
  });

  it("activates vault", async () => {
    await program.methods
      .activate()
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
      })
      .rpc();

    // Verify
    const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
    expect(vaultAccount.state).to.deep.equal({ active: {} });
  });

  it("deposits and receives conditional tokens", async () => {
    const initialUserBalance = (await getAccount(provider.connection, userAta))
      .amount;

    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
        mint: mint,
      })
      .remainingAccounts([
        { pubkey: condMint0, isSigner: false, isWritable: true },
        { pubkey: userCondAta0, isSigner: false, isWritable: true },
        { pubkey: condMint1, isSigner: false, isWritable: true },
        { pubkey: userCondAta1, isSigner: false, isWritable: true },
        { pubkey: condMint2, isSigner: false, isWritable: true },
        { pubkey: userCondAta2, isSigner: false, isWritable: true },
      ])
      .rpc();

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

    await program.methods
      .withdraw(new anchor.BN(withdrawAmount))
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
        mint: mint,
      })
      .remainingAccounts([
        { pubkey: condMint0, isSigner: false, isWritable: true },
        { pubkey: userCondAta0, isSigner: false, isWritable: true },
        { pubkey: condMint1, isSigner: false, isWritable: true },
        { pubkey: userCondAta1, isSigner: false, isWritable: true },
        { pubkey: condMint2, isSigner: false, isWritable: true },
        { pubkey: userCondAta2, isSigner: false, isWritable: true },
      ])
      .rpc();

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

    await program.methods
      .finalize(winningIdx)
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
      })
      .rpc();

    // Verify
    const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
    expect(vaultAccount.state).to.deep.equal({ finalized: {} });
    expect(vaultAccount.winningIdx).to.equal(winningIdx);
  });

  it("redeems winnings", async () => {
    const remainingCondTokens = DEPOSIT_AMOUNT / 2; // After withdraw half

    const initialUserBalance = (await getAccount(provider.connection, userAta))
      .amount;

    await program.methods
      .redeemWinnings()
      .accounts({
        signer: wallet.publicKey,
        vault: vaultPda,
        mint: mint,
      })
      .remainingAccounts([
        { pubkey: condMint0, isSigner: false, isWritable: true },
        { pubkey: userCondAta0, isSigner: false, isWritable: true },
        { pubkey: condMint1, isSigner: false, isWritable: true },
        { pubkey: userCondAta1, isSigner: false, isWritable: true },
        { pubkey: condMint2, isSigner: false, isWritable: true },
        { pubkey: userCondAta2, isSigner: false, isWritable: true },
      ])
      .rpc();

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
