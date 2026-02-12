/*
 * Low-level instruction builders for the Lending program.
 * These are thin wrappers around the program methods.
 * Use LendingClient for higher-level operations.
 */

import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolType } from "./types";

/**
 * Initialize a new lending vault
 */
export function initializeVault(
  program: Program,
  admin: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  pool: PublicKey,
  vaultPda: PublicKey,
  baseVault: PublicKey,
  quoteVault: PublicKey,
  nonce: number,
  ltvBps: number,
  liquidationThresholdBps: number,
  loanDurationSeconds: BN,
  poolType: PoolType
) {
  const poolTypeArg = poolType === PoolType.CpAmm ? { cpAmm: {} } : { dlmm: {} };

  return program.methods
    .initializeVault(
      nonce,
      ltvBps,
      liquidationThresholdBps,
      loanDurationSeconds,
      poolTypeArg
    )
    .accountsPartial({
      admin,
      baseMint,
      quoteMint,
      pool,
      vault: vaultPda,
      baseVault,
      quoteVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
}

/**
 * Add liquidity to the vault
 */
export function addLiquidity(
  program: Program,
  admin: PublicKey,
  vaultPda: PublicKey,
  baseMint: PublicKey,
  baseVault: PublicKey,
  adminBaseAta: PublicKey,
  amount: BN
) {
  return program.methods.addLiquidity(amount).accountsPartial({
    admin,
    vault: vaultPda,
    baseMint,
    baseVault,
    adminBaseAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  });
}

/**
 * Remove liquidity from the vault
 */
export function removeLiquidity(
  program: Program,
  admin: PublicKey,
  vaultPda: PublicKey,
  baseMint: PublicKey,
  baseVault: PublicKey,
  adminBaseAta: PublicKey,
  amount: BN
) {
  return program.methods.removeLiquidity(amount).accountsPartial({
    admin,
    vault: vaultPda,
    baseMint,
    baseVault,
    adminBaseAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  });
}

/**
 * Open a borrowing position
 */
export function openPosition(
  program: Program,
  user: PublicKey,
  vaultPda: PublicKey,
  positionPda: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  baseVault: PublicKey,
  quoteVault: PublicKey,
  userBaseAta: PublicKey,
  userQuoteAta: PublicKey,
  pool: PublicKey,
  collateralAmount: BN,
  borrowAmount: BN
) {
  return program.methods
    .openPosition(collateralAmount, borrowAmount)
    .accountsPartial({
      user,
      vault: vaultPda,
      position: positionPda,
      baseMint,
      quoteMint,
      baseVault,
      quoteVault,
      userBaseAta,
      userQuoteAta,
      pool,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
}

/**
 * Repay a position
 */
export function repay(
  program: Program,
  user: PublicKey,
  vaultPda: PublicKey,
  positionPda: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  baseVault: PublicKey,
  quoteVault: PublicKey,
  userBaseAta: PublicKey,
  userQuoteAta: PublicKey
) {
  return program.methods.repay().accountsPartial({
    user,
    vault: vaultPda,
    position: positionPda,
    baseMint,
    quoteMint,
    baseVault,
    quoteVault,
    userBaseAta,
    userQuoteAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  });
}

// Note: Liquidation instructions require many pool-specific accounts
// and are best handled by the LendingClient which can fetch pool state
