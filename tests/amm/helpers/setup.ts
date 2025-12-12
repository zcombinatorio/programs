import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

import { AMMClient } from "../../../sdk/src";
import { FUNDING_AMOUNT } from "./constants";

// Minimum SOL balance to maintain for the test wallet
const MIN_WALLET_BALANCE = 10 * LAMPORTS_PER_SOL;
// Amount to airdrop when balance is low
const AIRDROP_AMOUNT = 100 * LAMPORTS_PER_SOL;

export interface TestContext {
  provider: anchor.AnchorProvider;
  wallet: anchor.Wallet;
  client: AMMClient;
}

export interface FundedUser {
  keypair: Keypair;
  wallet: anchor.Wallet;
  mintAAta: PublicKey;
  mintBAta: PublicKey;
}

/**
 * Get the base test context with provider, wallet, and AMM client
 */
export function getTestContext(): TestContext {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const client = new AMMClient(provider);
  return { provider, wallet, client };
}

/**
 * Ensure the wallet has sufficient SOL balance.
 * Airdrops more SOL if balance is below MIN_WALLET_BALANCE.
 * Call this in beforeEach() or before() hooks to prevent tests from failing
 * due to insufficient funds after many operations.
 */
export async function ensureWalletFunded(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet
): Promise<void> {
  const balance = await provider.connection.getBalance(wallet.publicKey);
  if (balance < MIN_WALLET_BALANCE) {
    const sig = await provider.connection.requestAirdrop(
      wallet.publicKey,
      AIRDROP_AMOUNT
    );
    await provider.connection.confirmTransaction(sig);
  }
}

/**
 * Create a test mint with specified decimals (default 6)
 */
export async function createTestMint(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  decimals: number = 6
): Promise<PublicKey> {
  return createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    null,
    decimals
  );
}

/**
 * Create a funded user with SOL and tokens for both mints
 */
export async function createFundedUser(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  mintA: PublicKey,
  mintB: PublicKey,
  amount: number = FUNDING_AMOUNT
): Promise<FundedUser> {
  const keypair = Keypair.generate();
  const userWallet = new anchor.Wallet(keypair);

  // Airdrop SOL for transaction fees
  const sig = await provider.connection.requestAirdrop(
    keypair.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig);

  // Create ATA and fund with mint A tokens
  const mintAAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mintA,
    keypair.publicKey
  );
  await mintTo(
    provider.connection,
    wallet.payer,
    mintA,
    mintAAta.address,
    wallet.publicKey,
    amount
  );

  // Create ATA and fund with mint B tokens
  const mintBAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mintB,
    keypair.publicKey
  );
  await mintTo(
    provider.connection,
    wallet.payer,
    mintB,
    mintBAta.address,
    wallet.publicKey,
    amount
  );

  return {
    keypair,
    wallet: userWallet,
    mintAAta: mintAAta.address,
    mintBAta: mintBAta.address,
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
 * Create a new AMM client for a different user
 */
export function createUserClient(
  provider: anchor.AnchorProvider,
  userKeypair: Keypair
): AMMClient {
  const userWallet = new anchor.Wallet(userKeypair);
  const userProvider = new anchor.AnchorProvider(
    provider.connection,
    userWallet,
    provider.opts
  );
  return new AMMClient(userProvider);
}
