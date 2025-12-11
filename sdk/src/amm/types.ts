import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// =============================================================================
// Enums
// =============================================================================

export enum PoolState {
  Trading = "trading",
  Finalized = "finalized",
}

// =============================================================================
// Account Types
// =============================================================================

export interface TwapOracle {
  cumulativeObservations: BN;
  lastUpdateUnixTime: BN;
  createdAtUnixTime: BN;
  lastPrice: BN;
  lastObservation: BN;
  maxObservationDelta: BN;
  startingObservation: BN;
  warmupDuration: number;
}

export interface PoolBumps {
  pool: number;
  reserveA: number;
  reserveB: number;
  feeVault: number;
}

export interface PoolAccount {
  admin: PublicKey;
  liquidityProvider: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  fee: number;
  oracle: TwapOracle;
  state: PoolState;
  bumps: PoolBumps;
}

// =============================================================================
// Quote Types
// =============================================================================

export interface SwapQuote {
  inputAmount: BN;
  outputAmount: BN;
  minOutputAmount: BN;
  feeAmount: BN;
  priceImpact: number;
  spotPriceBefore: BN;
  spotPriceAfter: BN;
}

// =============================================================================
// Event Types
// =============================================================================

export interface PoolCreatedEvent {
  pool: PublicKey;
  admin: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  fee: number;
}

export interface LiquidityAddedEvent {
  pool: PublicKey;
  amountA: bigint;
  amountB: bigint;
}

export interface LiquidityRemovedEvent {
  pool: PublicKey;
  amountA: bigint;
  amountB: bigint;
}

export interface CondSwapEvent {
  pool: PublicKey;
  trader: PublicKey;
  swapAToB: boolean;
  inputAmount: bigint;
  outputAmount: bigint;
  feeAmount: bigint;
}

export interface TWAPUpdateEvent {
  unixTime: bigint;
  price: BN;
  observation: BN;
  cumulativeObservations: BN;
  twap: BN;
}

export type AMMEvent =
  | { name: "PoolCreated"; data: PoolCreatedEvent }
  | { name: "LiquidityAdded"; data: LiquidityAddedEvent }
  | { name: "LiquidityRemoved"; data: LiquidityRemovedEvent }
  | { name: "CondSwap"; data: CondSwapEvent }
  | { name: "TWAPUpdate"; data: TWAPUpdateEvent };
