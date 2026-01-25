import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

import { SVaultClient } from "../../../sdk/src";
import { FUNDING_AMOUNT } from "./constants";

export interface TestContext {
  provider: anchor.AnchorProvider;
  wallet: anchor.Wallet;
  client: SVaultClient;
}

export interface FundedUser {
  keypair: Keypair;
  wallet: anchor.Wallet;
  tokenAta: PublicKey;
}

/**
 * Get the base test context with provider, wallet, and client
 */
export function getTestContext(): TestContext {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const client = new SVaultClient(provider);
  return { provider, wallet, client };
}

/**
 * Create a test mint with 6 decimals
 */
export async function createTestMint(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet
): Promise<PublicKey> {
  return createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    null,
    6
  );
}

/**
 * Create a funded user with SOL and tokens
 */
export async function createFundedUser(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  tokenMint: PublicKey,
  amount: number = FUNDING_AMOUNT
): Promise<FundedUser> {
  const keypair = Keypair.generate();
  const userWallet = new anchor.Wallet(keypair);

  // Transfer SOL for transaction fees (avoids devnet airdrop rate limits)
  const transferTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: keypair.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL, // 0.05 SOL is plenty for test fees
    })
  );
  const sig = await provider.sendAndConfirm(transferTx);
  await provider.connection.confirmTransaction(sig);

  // Create ATA and fund with tokens
  const tokenAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    tokenMint,
    keypair.publicKey
  );
  await mintTo(
    provider.connection,
    wallet.payer,
    tokenMint,
    tokenAta.address,
    wallet.publicKey,
    amount
  );

  return {
    keypair,
    wallet: userWallet,
    tokenAta: tokenAta.address,
  };
}

/**
 * Fund the owner wallet's ATA with tokens
 */
export async function fundOwnerWallet(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  mint: PublicKey,
  amount: number = FUNDING_AMOUNT
): Promise<PublicKey> {
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mint,
    wallet.publicKey
  );

  await mintTo(
    provider.connection,
    wallet.payer,
    mint,
    ata.address,
    wallet.publicKey,
    amount
  );

  return ata.address;
}

/**
 * Create a new client for a different user
 */
export function createUserClient(
  provider: anchor.AnchorProvider,
  userKeypair: Keypair
): SVaultClient {
  const userWallet = new anchor.Wallet(userKeypair);
  const userProvider = new anchor.AnchorProvider(
    provider.connection,
    userWallet,
    provider.opts
  );
  return new SVaultClient(userProvider);
}

/**
 * Get token balance for an account
 */
export async function getTokenBalance(
  provider: anchor.AnchorProvider,
  tokenAccount: PublicKey
): Promise<number> {
  const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
  return parseInt(balance.value.amount);
}
