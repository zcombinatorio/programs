import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

import { SVaultClient, FEE_AUTHORITY } from "../../../sdk/src";
import {
  DEFAULT_UNSTAKING_PERIOD,
  DEFAULT_VOLUME_WINDOW,
  STAKE_AMOUNT,
} from "./constants";

export interface StakingVaultContext {
  configPda: PublicKey;
  tokenMint: PublicKey;
  nonce: number;
  unstakingPeriod: number;
  volumeWindow: number;
}

export interface CreateVaultOptions {
  nonce?: number;
  unstakingPeriod?: number;
  volumeWindow?: number;
}

// Auto-incrementing counter for unique vaults
let nonceCounter = 100;

/**
 * Reset counter (call in beforeEach if needed)
 */
export function resetCounters(): void {
  nonceCounter = 100;
}

/**
 * Get next nonce value
 */
export function getNextNonce(): number {
  return nonceCounter++;
}

/**
 * Create a staking vault
 */
export async function createStakingVault(
  client: SVaultClient,
  wallet: anchor.Wallet,
  tokenMint: PublicKey,
  options: CreateVaultOptions = {}
): Promise<StakingVaultContext> {
  const nonce = options.nonce ?? getNextNonce();
  const unstakingPeriod = options.unstakingPeriod ?? DEFAULT_UNSTAKING_PERIOD;
  const volumeWindow = options.volumeWindow ?? DEFAULT_VOLUME_WINDOW;

  const { builder, configPda } = client.initializeStakingVault(
    wallet.publicKey,
    tokenMint,
    unstakingPeriod,
    volumeWindow,
    nonce
  );
  await builder.rpc();

  return {
    configPda,
    tokenMint,
    nonce,
    unstakingPeriod,
    volumeWindow,
  };
}

/**
 * Create a staking vault with immediate withdraw (0 unstaking period)
 */
export async function createVaultWithZeroUnstakingPeriod(
  client: SVaultClient,
  wallet: anchor.Wallet,
  tokenMint: PublicKey,
  options: Omit<CreateVaultOptions, "unstakingPeriod"> = {}
): Promise<StakingVaultContext> {
  return createStakingVault(client, wallet, tokenMint, {
    ...options,
    unstakingPeriod: 0,
  });
}

/**
 * Create a vault and stake tokens in one operation
 */
export async function createVaultAndStake(
  client: SVaultClient,
  wallet: anchor.Wallet,
  tokenMint: PublicKey,
  stakeAmount: number = STAKE_AMOUNT,
  options: CreateVaultOptions = {}
): Promise<StakingVaultContext> {
  const ctx = await createStakingVault(client, wallet, tokenMint, options);

  await client
    .stake(wallet.publicKey, tokenMint, ctx.nonce, stakeAmount)
    .rpc();

  return ctx;
}

/**
 * Ensure the FEE_AUTHORITY's ATA exists for the given mint.
 * Required for slash tests.
 */
export async function ensureFeeVaultExists(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
  tokenMint: PublicKey
): Promise<PublicKey> {
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    tokenMint,
    FEE_AUTHORITY
  );
  return ata.address;
}

/**
 * Helper to send transaction and log byte/CU usage
 */
export async function sendAndLog(
  builder: any,
  client: SVaultClient,
  wallet: anchor.Wallet,
  logName?: string
): Promise<string> {
  const provider = client.program.provider as anchor.AnchorProvider;

  const tx = await builder.transaction();
  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;
  tx.feePayer = wallet.publicKey;

  const size = tx.serialize({ requireAllSignatures: false }).length;
  const sig = await builder.rpc();

  if (logName) {
    const confirmedTx = await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
    });
    const cuUsed = confirmedTx?.meta?.computeUnitsConsumed ?? "unknown";
    console.log(`    ${logName}: ${size} bytes | ${cuUsed} CUs`);
  }

  return sig;
}
