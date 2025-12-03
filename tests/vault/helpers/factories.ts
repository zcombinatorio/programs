import * as anchor from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";

import { VaultClient, VaultType } from "../../../sdk/src";
import { getComputeUnitsForOptions, DEPOSIT_AMOUNT } from "./constants";

export interface VaultTestContext {
  vaultPda: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  numOptions: number;
  nonce: number;
  proposalId: number;
  condBaseMints: PublicKey[];
  condQuoteMints: PublicKey[];
}

export interface CreateVaultOptions {
  numOptions?: number; // default: 2 (MIN_OPTIONS)
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
  baseMint: PublicKey,
  quoteMint: PublicKey,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const numOptions = options.numOptions ?? 2;
  const nonce = options.nonce ?? nonceCounter++;
  const proposalId = options.proposalId ?? proposalIdCounter++;

  // Initialize vault (creates 2 base + 2 quote options)
  const {
    builder,
    vaultPda,
    condBaseMint0,
    condBaseMint1,
    condQuoteMint0,
    condQuoteMint1,
  } = client.initialize(wallet.publicKey, baseMint, quoteMint, nonce, proposalId);
  await builder.rpc();

  const condBaseMints: PublicKey[] = [condBaseMint0, condBaseMint1];
  const condQuoteMints: PublicKey[] = [condQuoteMint0, condQuoteMint1];

  // Add additional options to reach target
  for (let i = 2; i < numOptions; i++) {
    const { builder: addBuilder, condBaseMint, condQuoteMint } =
      await client.addOption(wallet.publicKey, vaultPda);
    await addBuilder.rpc();
    condBaseMints.push(condBaseMint);
    condQuoteMints.push(condQuoteMint);
  }

  return {
    vaultPda,
    baseMint,
    quoteMint,
    numOptions,
    nonce,
    proposalId,
    condBaseMints,
    condQuoteMints,
  };
}

/**
 * Create a vault in Active state
 */
export async function createVaultInActiveState(
  client: VaultClient,
  wallet: anchor.Wallet,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint, options);

  await client.activate(wallet.publicKey, ctx.vaultPda).rpc();

  return ctx;
}

/**
 * Create a vault in Finalized state
 */
export async function createVaultInFinalizedState(
  client: VaultClient,
  wallet: anchor.Wallet,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  winningIdx: number,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, options);

  await client.finalize(wallet.publicKey, ctx.vaultPda, winningIdx).rpc();

  return ctx;
}

/**
 * Create a vault with a deposit already made (defaults to base vault type)
 */
export async function createVaultWithDeposit(
  client: VaultClient,
  wallet: anchor.Wallet,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  depositAmount: number = DEPOSIT_AMOUNT,
  vaultType: VaultType = VaultType.Base,
  options: CreateVaultOptions = {}
): Promise<VaultTestContext> {
  const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, options);

  const builder = await client.deposit(
    wallet.publicKey,
    ctx.vaultPda,
    vaultType,
    depositAmount
  );
  await sendAndLog(builder, client, wallet);

  return ctx;
}

/**
 * Helper to send transaction and log byte/CU usage
 * Note: SDK already includes compute budget, so we just send and log
 */
export async function sendAndLog(
  builder: any,
  client: VaultClient,
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
