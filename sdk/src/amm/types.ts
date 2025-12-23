import { BN, IdlAccounts, IdlEvents, IdlTypes } from "@coral-xyz/anchor";

// Re-export the generated IDL type
export { Amm } from "../programs/types";
import type { Amm } from "../programs/types";

// =============================================================================
// IDL-derived Types (primary account/state types)
// =============================================================================

export type PoolAccount = IdlAccounts<Amm>["poolAccount"];
export type PoolStateRaw = IdlTypes<Amm>["poolState"];
export type TwapOracle = IdlTypes<Amm>["twapOracle"];
export type PoolBumps = IdlTypes<Amm>["poolBumps"];

// Event types from IDL
export type PoolCreatedEvent = IdlEvents<Amm>["poolCreated"];
export type LiquidityAddedEvent = IdlEvents<Amm>["liquidityAdded"];
export type LiquidityRemovedEvent = IdlEvents<Amm>["liquidityRemoved"];
export type CondSwapEvent = IdlEvents<Amm>["condSwap"];
export type TWAPUpdateEvent = IdlEvents<Amm>["twapUpdate"];

// =============================================================================
// Enums (user-friendly for parsing)
// =============================================================================

export enum PoolState {
  Trading = "trading",
  Finalized = "finalized",
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
// Event Union Type
// =============================================================================

export type AMMEvent =
  | { name: "PoolCreated"; data: PoolCreatedEvent }
  | { name: "LiquidityAdded"; data: LiquidityAddedEvent }
  | { name: "LiquidityRemoved"; data: LiquidityRemovedEvent }
  | { name: "CondSwap"; data: CondSwapEvent }
  | { name: "TWAPUpdate"; data: TWAPUpdateEvent };
