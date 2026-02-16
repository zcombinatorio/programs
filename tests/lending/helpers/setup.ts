import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  Account,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

import { LendingClient, PoolType } from "../../../sdk/src";
import {
  SOL_AIRDROP,
  TOKEN_FUNDING,
  DEFAULT_LTV_BPS,
  DEFAULT_LIQUIDATION_THRESHOLD_BPS,
  DEFAULT_LOAN_DURATION_SECONDS,
} from "./constants";

export interface TestContext {
  provider: anchor.AnchorProvider;
  wallet: anchor.Wallet;
  client: LendingClient;
}

export interface TestVault {
  vaultPda: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  pool: PublicKey;
  nonce: number;
}

export interface FundedUser {
  keypair: Keypair;
  wallet: anchor.Wallet;
  baseAta: PublicKey;
  quoteAta: PublicKey;
}

/**
 * Get the base test context with provider, wallet, and Lending client
 */
export function getTestContext(): TestContext {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const client = new LendingClient(provider);
  return { provider, wallet, client };
}

/**
 * Ensure the wallet has sufficient SOL balance.
 */
export async function ensureWalletFunded(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  minBalance: number = 5 * LAMPORTS_PER_SOL
): Promise<void> {
  const balance = await provider.connection.getBalance(wallet.publicKey);
  if (balance < minBalance) {
    const sig = await provider.connection.requestAirdrop(
      wallet.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    const { blockhash, lastValidBlockHeight } =
      await provider.connection.getLatestBlockhash("confirmed");
    await provider.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  }
}

/**
 * Create a test mint with specified decimals
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
 * Create a funded user with SOL and tokens
 */
export async function createFundedUser(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  baseAmount: number | BN = TOKEN_FUNDING,
  quoteAmount: number | BN = TOKEN_FUNDING
): Promise<FundedUser> {
  const keypair = Keypair.generate();
  const userWallet = new anchor.Wallet(keypair);

  // Airdrop SOL
  const sig = await provider.connection.requestAirdrop(
    keypair.publicKey,
    SOL_AIRDROP
  );
  const { blockhash, lastValidBlockHeight } =
    await provider.connection.getLatestBlockhash("confirmed");
  await provider.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  // Create and fund base ATA
  const baseAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    baseMint,
    keypair.publicKey
  );
  const baseAmountBN = typeof baseAmount === "number" ? new BN(baseAmount) : baseAmount;
  if (baseAmountBN.gt(new BN(0))) {
    await mintTo(
      provider.connection,
      wallet.payer,
      baseMint,
      baseAta.address,
      wallet.publicKey,
      BigInt(baseAmountBN.toString())
    );
  }

  // Create and fund quote ATA
  const quoteAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    quoteMint,
    keypair.publicKey
  );
  const quoteAmountBN = typeof quoteAmount === "number" ? new BN(quoteAmount) : quoteAmount;
  if (quoteAmountBN.gt(new BN(0))) {
    await mintTo(
      provider.connection,
      wallet.payer,
      quoteMint,
      quoteAta.address,
      wallet.publicKey,
      BigInt(quoteAmountBN.toString())
    );
  }

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
export async function fundWalletAta(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  mint: PublicKey,
  amount: number | BN = TOKEN_FUNDING
): Promise<PublicKey> {
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mint,
    wallet.publicKey
  );

  const amountBN = typeof amount === "number" ? new BN(amount) : amount;
  await mintTo(
    provider.connection,
    wallet.payer,
    mint,
    ata.address,
    wallet.publicKey,
    BigInt(amountBN.toString())
  );

  return ata.address;
}

/**
 * Create a new Lending client for a different user
 */
export function createUserClient(
  provider: anchor.AnchorProvider,
  userKeypair: Keypair
): LendingClient {
  const userWallet = new anchor.Wallet(userKeypair);
  const userProvider = new anchor.AnchorProvider(
    provider.connection,
    userWallet,
    provider.opts
  );
  return new LendingClient(userProvider);
}

/**
 * Initialize a test vault with a mock pool
 * For actual devnet tests, use initializeVaultWithDlmm or initializeVaultWithCpAmm
 */
export async function initializeTestVault(
  ctx: TestContext,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  pool: PublicKey,
  poolType: PoolType,
  nonce: number = 0,
  ltvBps: number = DEFAULT_LTV_BPS,
  liquidationThresholdBps: number = DEFAULT_LIQUIDATION_THRESHOLD_BPS,
  loanDurationSeconds: number = DEFAULT_LOAN_DURATION_SECONDS
): Promise<TestVault> {
  const { client, wallet } = ctx;

  const { builder, vaultPda, baseVault, quoteVault } = client.initializeVault(
    wallet.publicKey,
    baseMint,
    quoteMint,
    pool,
    nonce,
    ltvBps,
    liquidationThresholdBps,
    new BN(loanDurationSeconds),
    poolType
  );

  await builder.rpc();

  return {
    vaultPda,
    baseVault,
    quoteVault,
    baseMint,
    quoteMint,
    pool,
    nonce,
  };
}

/**
 * Get token account balance
 */
export async function getTokenBalance(
  provider: anchor.AnchorProvider,
  tokenAccount: PublicKey
): Promise<BN> {
  try {
    const account = await getAccount(provider.connection, tokenAccount);
    return new BN(account.amount.toString());
  } catch {
    return new BN(0);
  }
}
