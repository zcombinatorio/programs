/*
 * Type definitions for the Lending program.
 * Manually defined to match Rust structures until IDL is generated.
 */

import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TxOptions } from "../utils";

/* Pool Type Enum */

export enum PoolType {
  CpAmm = 0,
  Dlmm = 1,
}

/* Account Types */

export interface LendingVaultAccount {
  bump: number;
  nonce: number;
  admin: PublicKey;

  // Token Configuration
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;

  // Pool Configuration
  pool: PublicKey;
  poolType: PoolType;
  isPoolBaseTokenA: boolean;

  // Risk Parameters
  ltvBps: number;
  liquidationThresholdBps: number;
  loanDurationSeconds: BN;

  // Accounting
  totalBaseLiquidity: BN;
  totalBaseBorrowed: BN;
  totalQuoteCollateral: BN;
  openPositions: number;

  // Timestamps
  createdAt: BN;
}

export interface PositionAccount {
  bump: number;
  vault: PublicKey;
  user: PublicKey;

  // Position Data
  collateralAmount: BN;
  borrowedAmount: BN;

  // Timestamps
  openedAt: BN;

  // Status
  isActive: boolean;
}

/* Event Types */

export interface VaultInitializedEvent {
  vault: PublicKey;
  admin: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  pool: PublicKey;
  ltvBps: number;
  liquidationThresholdBps: number;
  loanDurationSeconds: BN;
}

export interface LiquidityAddedEvent {
  vault: PublicKey;
  admin: PublicKey;
  amount: BN;
  totalLiquidity: BN;
}

export interface LiquidityRemovedEvent {
  vault: PublicKey;
  admin: PublicKey;
  amount: BN;
  totalLiquidity: BN;
}

export interface PositionOpenedEvent {
  vault: PublicKey;
  position: PublicKey;
  user: PublicKey;
  collateralAmount: BN;
  borrowedAmount: BN;
  basePrice: BN;
  openedAt: BN;
}

export interface PositionRepaidEvent {
  vault: PublicKey;
  position: PublicKey;
  user: PublicKey;
  collateralReturned: BN;
  borrowedRepaid: BN;
}

export interface PositionLiquidatedEvent {
  vault: PublicKey;
  position: PublicKey;
  user: PublicKey;
  liquidator: PublicKey;
  collateralAmount: BN;
  borrowedAmount: BN;
  amountSwapped: BN;
  reason: LiquidationReason;
}

export enum LiquidationReason {
  Undercollateralized = 0,
  Expired = 1,
}

/* Union Event Type */

export type LendingEvent =
  | { name: "VaultInitialized"; data: VaultInitializedEvent }
  | { name: "LiquidityAdded"; data: LiquidityAddedEvent }
  | { name: "LiquidityRemoved"; data: LiquidityRemovedEvent }
  | { name: "PositionOpened"; data: PositionOpenedEvent }
  | { name: "PositionRepaid"; data: PositionRepaidEvent }
  | { name: "PositionLiquidated"; data: PositionLiquidatedEvent };

/* Client Options */

export interface LendingTxOptions extends TxOptions {
  autoWrapUnwrap?: boolean;
}
