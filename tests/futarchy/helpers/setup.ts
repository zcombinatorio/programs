import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

import { FutarchyClient } from "../../../sdk/src";
import { FUNDING_AMOUNT } from "./constants";

export interface TestContext {
  provider: anchor.AnchorProvider;
  wallet: anchor.Wallet;
  client: FutarchyClient;
}

export interface FundedUser {
  keypair: Keypair;
  wallet: anchor.Wallet;
  baseAta: PublicKey;
  quoteAta: PublicKey;
}

/**
 * Get the base test context with provider, wallet, and client
 */
export function getTestContext(): TestContext {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const client = new FutarchyClient(provider);
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
 * Create a funded user with SOL and tokens for both base and quote mints
 */
export async function createFundedUser(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  baseMint: PublicKey,
  quoteMint: PublicKey,
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

  // Create ATA and fund with base tokens
  const baseAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    baseMint,
    keypair.publicKey
  );
  await mintTo(
    provider.connection,
    wallet.payer,
    baseMint,
    baseAta.address,
    wallet.publicKey,
    amount
  );

  // Create ATA and fund with quote tokens
  const quoteAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    quoteMint,
    keypair.publicKey
  );
  await mintTo(
    provider.connection,
    wallet.payer,
    quoteMint,
    quoteAta.address,
    wallet.publicKey,
    amount
  );

  return {
    keypair,
    wallet: userWallet,
    baseAta: baseAta.address,
    quoteAta: quoteAta.address,
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
): FutarchyClient {
  const userWallet = new anchor.Wallet(userKeypair);
  const userProvider = new anchor.AnchorProvider(
    provider.connection,
    userWallet,
    provider.opts
  );
  return new FutarchyClient(userProvider);
}
