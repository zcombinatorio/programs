import * as anchor from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { AMMClient } from "../../../sdk/src";
import {
  INITIAL_LIQUIDITY,
  DEFAULT_FEE,
  DEFAULT_STARTING_OBSERVATION,
  DEFAULT_MAX_OBSERVATION_DELTA,
  DEFAULT_WARMUP_DURATION,
  COMPUTE_UNITS,
} from "./constants";

export interface PoolTestContext {
  poolPda: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  reserveA: PublicKey;
  reserveB: PublicKey;
  feeVault: PublicKey;
  admin: PublicKey;
  liquidityProvider: PublicKey;
  fee: number;
}

export interface CreatePoolOptions {
  fee?: number;
  startingObservation?: bigint;
  maxObservationDelta?: bigint;
  warmupDuration?: number;
  liquidityProvider?: PublicKey | null;
}

/**
 * Create a pool with specified configuration
 */
export async function createPool(
  client: AMMClient,
  wallet: anchor.Wallet,
  mintA: PublicKey,
  mintB: PublicKey,
  options: CreatePoolOptions = {}
): Promise<PoolTestContext> {
  const fee = options.fee ?? DEFAULT_FEE;
  const startingObservation = new BN(
    (options.startingObservation ?? DEFAULT_STARTING_OBSERVATION).toString()
  );
  const maxObservationDelta = new BN(
    (options.maxObservationDelta ?? DEFAULT_MAX_OBSERVATION_DELTA).toString()
  );
  const warmupDuration = options.warmupDuration ?? DEFAULT_WARMUP_DURATION;
  const liquidityProvider = options.liquidityProvider ?? null;

  const { builder, poolPda, reserveA, reserveB, feeVault } = client.createPool(
    wallet.publicKey,
    wallet.publicKey, // admin
    mintA,
    mintB,
    fee,
    startingObservation,
    maxObservationDelta,
    warmupDuration,
    liquidityProvider
  );

  await builder
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ])
    .rpc();

  return {
    poolPda,
    mintA,
    mintB,
    reserveA,
    reserveB,
    feeVault,
    admin: wallet.publicKey,
    liquidityProvider: liquidityProvider ?? wallet.publicKey,
    fee,
  };
}

/**
 * Create a pool and add initial liquidity
 */
export async function createPoolWithLiquidity(
  client: AMMClient,
  wallet: anchor.Wallet,
  mintA: PublicKey,
  mintB: PublicKey,
  amountA: number = INITIAL_LIQUIDITY,
  amountB: number = INITIAL_LIQUIDITY,
  options: CreatePoolOptions = {}
): Promise<PoolTestContext> {
  const ctx = await createPool(client, wallet, mintA, mintB, options);

  const builder = await client.addLiquidity(
    wallet.publicKey,
    ctx.poolPda,
    amountA,
    amountB
  );

  await builder
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ])
    .rpc();

  return ctx;
}

/**
 * Create a pool in Finalized state
 */
export async function createFinalizedPool(
  client: AMMClient,
  wallet: anchor.Wallet,
  mintA: PublicKey,
  mintB: PublicKey,
  amountA: number = INITIAL_LIQUIDITY,
  amountB: number = INITIAL_LIQUIDITY,
  options: CreatePoolOptions = {}
): Promise<PoolTestContext> {
  const ctx = await createPoolWithLiquidity(
    client,
    wallet,
    mintA,
    mintB,
    amountA,
    amountB,
    options
  );

  await client.ceaseTrading(wallet.publicKey, ctx.poolPda).rpc();

  return ctx;
}

/**
 * Helper to send transaction with compute budget and logging
 */
export async function sendAndLog(
  builder: any,
  client: AMMClient,
  wallet: anchor.Wallet,
  logName?: string
): Promise<string> {
  const provider = client.program.provider as anchor.AnchorProvider;

  const tx = await builder
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ])
    .transaction();

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;
  tx.feePayer = wallet.publicKey;

  const size = tx.serialize({ requireAllSignatures: false }).length;
  const sig = await builder
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ])
    .rpc();

  if (logName) {
    const confirmedTx = await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
    });
    const cuUsed = confirmedTx?.meta?.computeUnitsConsumed ?? "unknown";
    console.log(`    ${logName}: ${size} bytes | ${cuUsed} CUs`);
  }

  return sig;
}
