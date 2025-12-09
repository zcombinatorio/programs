import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

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

export interface PoolAccount {
  admin: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  fee: number;
  oracle: TwapOracle;
  bump: number;
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

export interface CondSwapEvent {
  pool: PublicKey;
  trader: PublicKey;
  swapAToB: boolean;
  inputAmount: BN;
  outputAmount: BN;
  feeAmount: BN;
}

export interface TWAPUpdateEvent {
  unixTime: BN;
  price: BN;
  observation: BN;
  cumulativeObservations: BN;
}

export interface LiquidityAddedEvent {
  pool: PublicKey;
  amountA: BN;
  amountB: BN;
}

export interface LiquidityRemovedEvent {
  pool: PublicKey;
  amountA: BN;
  amountB: BN;
}

export type AMMEvent =
  | { name: "PoolCreated"; data: PoolCreatedEvent }
  | { name: "CondSwap"; data: CondSwapEvent }
  | { name: "TWAPUpdate"; data: TWAPUpdateEvent }
  | { name: "LiquidityAdded"; data: LiquidityAddedEvent }
  | { name: "LiquidityRemoved"; data: LiquidityRemovedEvent };

// =============================================================================
// Quote Types
// =============================================================================

export interface SwapQuote {
  outputAmount: BN;
  feeAmount: BN;
  priceImpact: number;
  minOutputAmount: BN;
}
