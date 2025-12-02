import * as anchor from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";

import { VaultClient, VaultType } from "../../../sdk/src";
import { getComputeUnitsForOptions, DEPOSIT_AMOUNT } from "./constants";

export interface VaultTestContext {
  vaultPda: PublicKey;
  mint: PublicKey;
  numOptions: number;
  vaultType: VaultType;
  nonce: number;
  proposalId: number;
  condMints: PublicKey[];
}

export interface CreateVaultOptions {
  numOptions?: number; // default: 2 (MIN_OPTIONS)
  vaultType?: VaultType; // default: Base
  nonce?: number; // default: auto-generated
  proposalId?: number; // default: auto-generated
}

// Auto-incrementing counters for unique vaults
// Start at 150 to avoid collisions with hardcoded values (which use 100-130 range)
let nonceCounter = 150;
let proposalIdCounter = 150;

/**
 * Reset counters (call in beforeEach if needed)
 */
export function resetCounters(): void {
  nonceCounter = 150;
  proposalIdCounter = 150;
}

/**
 * Create a vault in Setup state with specified number of options
 */
export async function createVaultInSetupState(
  client: VaultClient,
  wallet: anchor.Wallet,
  mint: PublicKey,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const numOptions = options.numOptions ?? 2;
  const vaultType = options.vaultType ?? VaultType.Base;
  const nonce = options.nonce ?? nonceCounter++;
  const proposalId = options.proposalId ?? proposalIdCounter++;

  // Initialize vault (creates 2 options)
  const { builder, vaultPda, condMint0, condMint1 } = client.initialize(
    wallet.publicKey,
    mint,
    vaultType,
    nonce,
    proposalId
  );
  await builder.rpc();

  const condMints: PublicKey[] = [condMint0, condMint1];

  // Add additional options to reach target
  for (let i = 2; i < numOptions; i++) {
    const { builder: addBuilder, condMint } = await client.addOption(
      wallet.publicKey,
      vaultPda
    );
    await addBuilder.rpc();
    condMints.push(condMint);
  }

  return {
    vaultPda,
    mint,
    numOptions,
    vaultType,
    nonce,
    proposalId,
    condMints,
  };
}

/**
 * Create a vault in Active state
 */
export async function createVaultInActiveState(
  client: VaultClient,
  wallet: anchor.Wallet,
  mint: PublicKey,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const ctx = await createVaultInSetupState(client, wallet, mint, options);

  await client.activate(wallet.publicKey, ctx.vaultPda).rpc();

  return ctx;
}

/**
 * Create a vault in Finalized state
 */
export async function createVaultInFinalizedState(
  client: VaultClient,
  wallet: anchor.Wallet,
  mint: PublicKey,
  winningIdx: number,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const ctx = await createVaultInActiveState(client, wallet, mint, options);

  await client.finalize(wallet.publicKey, ctx.vaultPda, winningIdx).rpc();

  return ctx;
}

/**
 * Create a vault with a deposit already made
 */
export async function createVaultWithDeposit(
  client: VaultClient,
  wallet: anchor.Wallet,
  mint: PublicKey,
  depositAmount: number = DEPOSIT_AMOUNT,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const ctx = await createVaultInActiveState(client, wallet, mint, options);

  const builder = await client.deposit(
    wallet.publicKey,
    ctx.vaultPda,
    depositAmount
  );
  await sendWithComputeBudget(
    builder,
    client,
    wallet,
    ctx.numOptions
  );

  return ctx;
}

/**
 * Helper to send transaction with appropriate compute budget
 */
export async function sendWithComputeBudget(
  builder: any,
  client: VaultClient,
  wallet: anchor.Wallet,
  numOptions: number,
  logName?: string
): Promise<string> {
  const computeUnits = getComputeUnitsForOptions(numOptions);
  const provider = client.program.provider as anchor.AnchorProvider;

  const withBudget = builder.preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
  ]);

  const tx = await withBudget.transaction();
  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;
  tx.feePayer = wallet.publicKey;

  const size = tx.serialize({ requireAllSignatures: false }).length;
  const sig = await withBudget.rpc();

  if (logName) {
    const confirmedTx = await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
    });
    const cuUsed = confirmedTx?.meta?.computeUnitsConsumed ?? "unknown";
    console.log(`    ${logName}: ${size} bytes | ${cuUsed} CUs`);
  }

  return sig;
}
