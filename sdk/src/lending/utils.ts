/*
 * Utility functions for the Lending program.
 * PDA derivation, account fetching, and health calculations.
 */

import { PublicKey, Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  VAULT_SEED,
  VAULT_BASE_ATA_SEED,
  VAULT_QUOTE_ATA_SEED,
  POSITION_SEED,
  PRICE_SCALE,
  BASIS_POINTS_DIVISOR,
} from "./constants";
import { LendingVaultAccount, PositionAccount } from "./types";

/* ============================================================================
 * PDA Derivation
 * ============================================================================ */

/**
 * Derive the lending vault PDA
 */
export function deriveVaultPDA(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  nonce: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(2);
  nonceBuffer.writeUInt16LE(nonce);
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, baseMint.toBuffer(), quoteMint.toBuffer(), nonceBuffer],
    programId
  );
}

/**
 * Derive the vault's base token account PDA
 */
export function deriveBaseVaultPDA(
  vaultPda: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_BASE_ATA_SEED, vaultPda.toBuffer()],
    programId
  );
}

/**
 * Derive the vault's quote token account PDA
 */
export function deriveQuoteVaultPDA(
  vaultPda: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_QUOTE_ATA_SEED, vaultPda.toBuffer()],
    programId
  );
}

/**
 * Derive a user's position PDA
 */
export function derivePositionPDA(
  vaultPda: PublicKey,
  user: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, vaultPda.toBuffer(), user.toBuffer()],
    programId
  );
}

/* ============================================================================
 * Health Calculations
 * ============================================================================ */

/**
 * Calculate the health factor of a position in basis points.
 * Health = (collateral_value / borrowed_value) * 10000
 * 
 * @param collateralAmount - Amount of quote tokens deposited
 * @param borrowedAmount - Amount of base tokens borrowed  
 * @param basePrice - Price of base in quote (scaled by PRICE_SCALE)
 * @returns Health factor in basis points (10000 = 100% = 1:1 collateral to debt)
 */
export function calculateHealthBps(
  collateralAmount: BN,
  borrowedAmount: BN,
  basePrice: BN
): BN | null {
  if (borrowedAmount.isZero()) {
    return null; // Infinite health (no debt)
  }

  // health_bps = (collateral * PRICE_SCALE * 10000) / (borrowed * basePrice)
  const numerator = collateralAmount
    .mul(new BN(PRICE_SCALE.toString()))
    .mul(new BN(BASIS_POINTS_DIVISOR));
  const denominator = borrowedAmount.mul(basePrice);

  if (denominator.isZero()) {
    return null;
  }

  return numerator.div(denominator);
}

/**
 * Calculate the health threshold for a given liquidation threshold.
 * Positions with health below this are liquidatable.
 */
export function calculateHealthThreshold(liquidationThresholdBps: number): BN {
  // threshold = 10000 * 10000 / liquidation_threshold_bps
  return new BN(BASIS_POINTS_DIVISOR)
    .mul(new BN(BASIS_POINTS_DIVISOR))
    .div(new BN(liquidationThresholdBps));
}

/**
 * Check if a position is undercollateralized (liquidatable due to health)
 */
export function isUndercollateralized(
  collateralAmount: BN,
  borrowedAmount: BN,
  basePrice: BN,
  liquidationThresholdBps: number
): boolean {
  const health = calculateHealthBps(collateralAmount, borrowedAmount, basePrice);
  if (health === null) {
    return false; // No debt = not liquidatable
  }
  const threshold = calculateHealthThreshold(liquidationThresholdBps);
  return health.lte(threshold);
}

/**
 * Check if a position is expired (liquidatable due to time)
 */
export function isExpired(openedAt: BN, loanDurationSeconds: BN, currentTime?: BN): boolean {
  const now = currentTime ?? new BN(Math.floor(Date.now() / 1000));
  const expiresAt = openedAt.add(loanDurationSeconds);
  return now.gt(expiresAt);
}

/**
 * Check if a position is liquidatable (either reason)
 */
export function isLiquidatable(
  position: PositionAccount,
  vault: LendingVaultAccount,
  basePrice: BN,
  currentTime?: BN
): { liquidatable: boolean; reason: "undercollateralized" | "expired" | null } {
  if (!position.isActive) {
    return { liquidatable: false, reason: null };
  }

  if (isExpired(position.openedAt, vault.loanDurationSeconds, currentTime)) {
    return { liquidatable: true, reason: "expired" };
  }

  if (
    isUndercollateralized(
      position.collateralAmount,
      position.borrowedAmount,
      basePrice,
      vault.liquidationThresholdBps
    )
  ) {
    return { liquidatable: true, reason: "undercollateralized" };
  }

  return { liquidatable: false, reason: null };
}

/**
 * Calculate the maximum borrow amount for given collateral
 */
export function calculateMaxBorrow(
  collateralAmount: BN,
  ltvBps: number,
  basePrice: BN
): BN {
  // max_borrow = collateral * ltv_bps / 10000 * PRICE_SCALE / basePrice
  const maxValue = collateralAmount.mul(new BN(ltvBps)).div(new BN(BASIS_POINTS_DIVISOR));
  return maxValue.mul(new BN(PRICE_SCALE.toString())).div(basePrice);
}

/**
 * Calculate the current LTV ratio in basis points
 */
export function calculateCurrentLtvBps(
  collateralAmount: BN,
  borrowedAmount: BN,
  basePrice: BN
): BN {
  if (collateralAmount.isZero()) {
    return new BN(BASIS_POINTS_DIVISOR * 100); // Max LTV if no collateral
  }

  // ltv = (borrowed * basePrice / PRICE_SCALE) / collateral * 10000
  const borrowedValue = borrowedAmount.mul(basePrice).div(new BN(PRICE_SCALE.toString()));
  return borrowedValue.mul(new BN(BASIS_POINTS_DIVISOR)).div(collateralAmount);
}

/**
 * Get time remaining until loan expires
 */
export function getTimeRemaining(
  openedAt: BN,
  loanDurationSeconds: BN,
  currentTime?: BN
): { expired: boolean; secondsRemaining: BN } {
  const now = currentTime ?? new BN(Math.floor(Date.now() / 1000));
  const expiresAt = openedAt.add(loanDurationSeconds);

  if (now.gte(expiresAt)) {
    return { expired: true, secondsRemaining: new BN(0) };
  }

  return { expired: false, secondsRemaining: expiresAt.sub(now) };
}

/**
 * Calculate available liquidity for borrowing
 */
export function getAvailableLiquidity(vault: LendingVaultAccount): BN {
  return vault.totalBaseLiquidity.sub(vault.totalBaseBorrowed);
}

/**
 * Calculate vault utilization rate in basis points
 */
export function getUtilizationBps(vault: LendingVaultAccount): BN {
  if (vault.totalBaseLiquidity.isZero()) {
    return new BN(0);
  }
  return vault.totalBaseBorrowed
    .mul(new BN(BASIS_POINTS_DIVISOR))
    .div(vault.totalBaseLiquidity);
}
