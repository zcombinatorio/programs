import * as anchor from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { FutarchyClient, TWAPConfig } from "../../../sdk/src";
import {
  INITIAL_LIQUIDITY,
  PROPOSAL_LENGTH,
  DEFAULT_FEE,
  DEFAULT_TWAP_CONFIG,
  sleep,
} from "./constants";

export interface ModeratorTestContext {
  moderatorPda: PublicKey;
  moderatorId: number;
  globalConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
}

export interface ProposalTestContext {
  proposalPda: PublicKey;
  proposalId: number;
  vaultPda: PublicKey;
  pools: PublicKey[];
  condBaseMints: PublicKey[];
  condQuoteMints: PublicKey[];
  moderatorPda: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  altAddress?: PublicKey; // Address Lookup Table for versioned transactions
}

export interface CreateModeratorOptions {
  baseMint: PublicKey;
  quoteMint: PublicKey;
}

export interface CreateProposalOptions {
  numOptions?: number; // default: 2 (MIN_OPTIONS)
  length?: number; // default: PROPOSAL_LENGTH
  fee?: number; // default: DEFAULT_FEE
  twapConfig?: TWAPConfig; // default: DEFAULT_TWAP_CONFIG
}

/**
 * Create a new moderator
 */
export async function createModerator(
  client: FutarchyClient,
  wallet: anchor.Wallet,
  options: CreateModeratorOptions
): Promise<ModeratorTestContext> {
  const { baseMint, quoteMint } = options;

  const { builder, globalConfig, moderatorPda, moderatorId } =
    await client.initializeModerator(wallet.publicKey, baseMint, quoteMint);

  await builder.rpc();

  return {
    moderatorPda,
    moderatorId,
    globalConfig,
    baseMint,
    quoteMint,
  };
}

/**
 * Create a proposal in Setup state (not yet launched)
 * For proposals with many options (>2), creates an ALT first for versioned transactions
 */
export async function createProposalInSetupState(
  client: FutarchyClient,
  wallet: anchor.Wallet,
  moderatorCtx: ModeratorTestContext,
  options: CreateProposalOptions = {}
): Promise<ProposalTestContext> {
  const numOptions = options.numOptions ?? 2;
  const length = options.length ?? PROPOSAL_LENGTH;
  const fee = options.fee ?? DEFAULT_FEE;
  const twapConfig = options.twapConfig ?? DEFAULT_TWAP_CONFIG;

  let altAddress: PublicKey | undefined;

  // Create ALT before proposal if needed (for large transactions)
  // ALT must be created BEFORE proposal since it predicts the next proposal ID
  if (numOptions > 2) {
    const { altAddress: alt } = await client.createProposalALT(
      wallet.publicKey,
      moderatorCtx.moderatorPda,
      numOptions
    );
    altAddress = alt;

    // Wait for ALT to be active (need to wait for slot to advance)
    // On localnet this is fast, on mainnet it's ~150 slots
    await sleep(1000);
  }

  // Initialize proposal with 2 options
  const {
    builder,
    proposalPda,
    proposalId,
    vaultPda,
    pools,
    condBaseMints,
    condQuoteMints,
  } = await client.initializeProposal(
    wallet.publicKey,
    moderatorCtx.moderatorPda,
    length,
    fee,
    twapConfig
  );
  await builder.rpc();

  const currentPools = [...pools];
  const currentCondBaseMints = [...condBaseMints];
  const currentCondQuoteMints = [...condQuoteMints];

  // Add additional options if needed
  for (let i = 2; i < numOptions; i++) {
    const { builder: addBuilder, pool, condBaseMint, condQuoteMint } =
      await client.addOption(wallet.publicKey, proposalPda);
    await addBuilder.rpc();
    currentPools.push(pool);
    currentCondBaseMints.push(condBaseMint);
    currentCondQuoteMints.push(condQuoteMint);
  }

  return {
    proposalPda,
    proposalId,
    vaultPda,
    pools: currentPools,
    condBaseMints: currentCondBaseMints,
    condQuoteMints: currentCondQuoteMints,
    moderatorPda: moderatorCtx.moderatorPda,
    baseMint: moderatorCtx.baseMint,
    quoteMint: moderatorCtx.quoteMint,
    altAddress,
  };
}

/**
 * Create a proposal in Pending state (launched)
 */
export async function createProposalInPendingState(
  client: FutarchyClient,
  wallet: anchor.Wallet,
  moderatorCtx: ModeratorTestContext,
  baseAmount: BN | number = INITIAL_LIQUIDITY,
  quoteAmount: BN | number = INITIAL_LIQUIDITY,
  options: CreateProposalOptions = {}
): Promise<ProposalTestContext> {
  const ctx = await createProposalInSetupState(
    client,
    wallet,
    moderatorCtx,
    options
  );

  // Pre-create conditional token ATAs to avoid CPI depth issues during launch
  await preCreateConditionalATAs(client, wallet, ctx);

  // Launch the proposal
  const { builder: launchBuilder } = await client.launchProposal(
    wallet.publicKey,
    ctx.proposalPda,
    baseAmount,
    quoteAmount
  );
  await launchBuilder.rpc();

  return ctx;
}

/**
 * Create a proposal in Resolved state (finalized with winning option)
 */
export async function createProposalInResolvedState(
  client: FutarchyClient,
  wallet: anchor.Wallet,
  moderatorCtx: ModeratorTestContext,
  baseAmount: BN | number = INITIAL_LIQUIDITY,
  quoteAmount: BN | number = INITIAL_LIQUIDITY,
  options: CreateProposalOptions = {}
): Promise<ProposalTestContext> {
  // Use default PROPOSAL_LENGTH to allow TWAP warmup
  const resolvedOptions = {
    ...options,
    length: options.length ?? PROPOSAL_LENGTH,
  };

  const ctx = await createProposalInPendingState(
    client,
    wallet,
    moderatorCtx,
    baseAmount,
    quoteAmount,
    resolvedOptions
  );

  // Warm up TWAP before finalization
  await warmupTwap(client, ctx.proposalPda);

  // Wait for expiration
  await waitForProposalExpiration(client, ctx.proposalPda);

  // Finalize
  const { builder: finalizeBuilder } = await client.finalizeProposal(
    wallet.publicKey,
    ctx.proposalPda
  );
  await finalizeBuilder.rpc();

  return ctx;
}

/**
 * Wait for a proposal to expire
 */
export async function waitForProposalExpiration(
  client: FutarchyClient,
  proposalPda: PublicKey
): Promise<void> {
  const proposal = await client.fetchProposal(proposalPda);
  const remaining = client.getTimeRemaining(proposal);

  if (remaining > 0) {
    // Add buffer for block time variance (Solana slots can lag behind wall clock)
    await sleep((remaining + 4) * 1000);
  }
}

/**
 * Warm up TWAP by cranking all proposal pools after MIN_RECORDING_INTERVAL (60s) has passed.
 * This ensures the TWAP oracle has accumulated observations for finalization.
 */
export async function warmupTwap(
  client: FutarchyClient,
  proposalPda: PublicKey
): Promise<void> {
  const proposal = await client.fetchProposal(proposalPda);
  const numOptions = proposal.numOptions;
  const pools = proposal.pools.slice(0, numOptions);

  // Wait for MIN_RECORDING_INTERVAL (60 seconds) to pass since pool creation
  // This is required for the TWAP oracle to accept updates
  console.log("    Waiting 62s for TWAP warmup (MIN_RECORDING_INTERVAL)...");
  await sleep(62000);

  // Crank TWAP on each pool to record the first observation
  for (const poolPda of pools) {
    const builder = await client.amm.crankTwap(poolPda);
    await builder.rpc();
  }
}

/**
 * Helper to send transaction and log byte/CU usage
 */
export async function sendAndLog(
  builder: any,
  client: FutarchyClient,
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

/**
 * Helper to send a versioned transaction using an Address Lookup Table
 * Use this for large transactions that exceed the 1232 byte limit
 */
export async function sendVersionedTx(
  instructions: TransactionInstruction[],
  client: FutarchyClient,
  wallet: anchor.Wallet,
  altAddress: PublicKey,
  logName?: string
): Promise<string> {
  const provider = client.program.provider as anchor.AnchorProvider;

  // Build versioned transaction with ALT
  const versionedTx = await client.buildVersionedTx(
    wallet.publicKey,
    instructions,
    altAddress
  );

  // Sign the transaction
  versionedTx.sign([wallet.payer]);

  // Send and confirm
  const sig = await provider.connection.sendTransaction(versionedTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await provider.connection.confirmTransaction(sig, "confirmed");

  if (logName) {
    const confirmedTx = await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const cuUsed = confirmedTx?.meta?.computeUnitsConsumed ?? "unknown";
    const size = versionedTx.serialize().length;
    console.log(`    ${logName}: ${size} bytes | ${cuUsed} CUs (versioned)`);
  }

  return sig;
}

/**
 * Pre-create all conditional token ATAs for a user before launching a proposal.
 * This reduces CPI depth during launchProposal by avoiding on-the-fly ATA creation.
 */
export async function preCreateConditionalATAs(
  client: FutarchyClient,
  wallet: anchor.Wallet,
  proposalCtx: ProposalTestContext
): Promise<void> {
  const provider = client.program.provider as anchor.AnchorProvider;

  // Build instructions to create all conditional token ATAs
  const instructions: TransactionInstruction[] = [];
  const allMints = [...proposalCtx.condBaseMints, ...proposalCtx.condQuoteMints];

  for (const mint of allMints) {
    const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);

    // Check if ATA already exists
    const accountInfo = await provider.connection.getAccountInfo(ata);
    if (!accountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          ata,              // ata
          wallet.publicKey, // owner
          mint              // mint
        )
      );
    }
  }

  if (instructions.length === 0) {
    return; // All ATAs already exist
  }

  // Send in batches if needed (max ~20 ATAs per tx due to size limits)
  const BATCH_SIZE = 10;
  for (let i = 0; i < instructions.length; i += BATCH_SIZE) {
    const batch = instructions.slice(i, i + BATCH_SIZE);
    const tx = new Transaction().add(...batch);
    await provider.sendAndConfirm(tx);
  }
}
