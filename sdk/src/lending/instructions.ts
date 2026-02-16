/*
 * Low-level instruction builders for the Lending program.
 * These are thin wrappers around the program methods.
 * Use LendingClient for higher-level operations.
 */

import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolType, Lending } from "./types";

/**
 * Helper to convert pool type to Anchor IDL format.
 * Handles both numeric enum (PoolType.CpAmm) and raw format ({ cpAmm: {} }).
 */
function toPoolTypeArg(poolType: PoolType | { cpAmm?: {}; dlmm?: {} }): { cpAmm: {} } | { dlmm: {} } {
  // Handle raw Anchor format
  if (typeof poolType === 'object' && poolType !== null) {
    if ('cpAmm' in poolType) return { cpAmm: {} };
    if ('dlmm' in poolType) return { dlmm: {} };
  }
  // Handle numeric enum
  return poolType === PoolType.CpAmm ? { cpAmm: {} } : { dlmm: {} };
}

/**
 * Initialize a new lending vault
 */
export function initializeVault(
  program: Program<Lending>,
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
  poolType: PoolType | { cpAmm?: {}; dlmm?: {} }
) {
  const poolTypeArg = toPoolTypeArg(poolType);

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
  program: Program<Lending>,
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
  program: Program<Lending>,
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
  program: Program<Lending>,
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
  program: Program<Lending>,
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

/**
 * Liquidate a position via DLMM swap
 * 
 * Requires fetching pool state to derive all accounts.
 * binArrays should be passed as remaining accounts.
 */
export function liquidateDlmm(
  program: Program<Lending>,
  liquidator: PublicKey,
  user: PublicKey,
  vaultPda: PublicKey,
  positionPda: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  baseVault: PublicKey,
  quoteVault: PublicKey,
  // DLMM pool accounts
  lbPair: PublicKey,
  binArrayBitmapExtension: PublicKey | null,
  reserveX: PublicKey,
  reserveY: PublicKey,
  tokenXMint: PublicKey,
  tokenYMint: PublicKey,
  oracle: PublicKey,
  hostFeeIn: PublicKey | null,
  dlmmProgram: PublicKey,
  eventAuthority: PublicKey,
  tokenXProgram: PublicKey,
  tokenYProgram: PublicKey,
  // Slippage
  minAmountOut: BN,
  // Remaining accounts (bin arrays)
  binArrays: PublicKey[] = []
) {
  const builder = program.methods
    .liquidateDlmm(minAmountOut)
    .accountsPartial({
      liquidator,
      user,
      vault: vaultPda,
      position: positionPda,
      baseMint,
      quoteMint,
      baseVault,
      quoteVault,
      lbPair,
      binArrayBitmapExtension,
      reserveX,
      reserveY,
      tokenXMint,
      tokenYMint,
      oracle,
      hostFeeIn,
      dlmmProgram,
      eventAuthority,
      tokenXProgram,
      tokenYProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

  // Add bin arrays as remaining accounts
  if (binArrays.length > 0) {
    return builder.remainingAccounts(
      binArrays.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: true,
      }))
    );
  }

  return builder;
}
