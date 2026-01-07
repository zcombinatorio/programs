/*
 * Type definitions for the AMM program.
 * Exports IDL-derived types and SDK-friendly enums.
 */

import { BN, IdlAccounts, IdlEvents, IdlTypes } from "@coral-xyz/anchor";
import { TxOptions } from "../utils";

/* IDL Type Re-export */

export { Amm } from "../generated/types";
import type { Amm } from "../generated/types";

/* IDL-derived Types */

export type PoolAccount = IdlAccounts<Amm>["poolAccount"];
export type PoolStateRaw = IdlTypes<Amm>["poolState"];
export type TwapOracle = IdlTypes<Amm>["twapOracle"];
export type PoolBumps = IdlTypes<Amm>["poolBumps"];

/* Event Types */

export type PoolCreatedEvent = IdlEvents<Amm>["poolCreated"];
export type LiquidityAddedEvent = IdlEvents<Amm>["liquidityAdded"];
export type LiquidityRemovedEvent = IdlEvents<Amm>["liquidityRemoved"];
export type CondSwapEvent = IdlEvents<Amm>["condSwap"];
export type TWAPUpdateEvent = IdlEvents<Amm>["twapUpdate"];

/* Enums */

export enum PoolState {
  Trading = "trading",
  Finalized = "finalized",
}

/* Quote Types */

export interface SwapQuote {
  inputAmount: BN;
  outputAmount: BN;
  minOutputAmount: BN;
  feeAmount: BN;
  priceImpact: number;
  spotPriceBefore: BN;
  spotPriceAfter: BN;
}

/* Event Union Type */

export type AMMEvent =
  | { name: "PoolCreated"; data: PoolCreatedEvent }
  | { name: "LiquidityAdded"; data: LiquidityAddedEvent }
  | { name: "LiquidityRemoved"; data: LiquidityRemovedEvent }
  | { name: "CondSwap"; data: CondSwapEvent }
  | { name: "TWAPUpdate"; data: TWAPUpdateEvent };

/* Options */

export interface AmmActionOptions extends TxOptions {
  autoWrapUnwrap?: boolean; // Auto wrap/unwrap native SOL (default: true) - for liquidity operations
  autoCreateTokenAccounts?: boolean; // Auto create token accounts (default: true) - for swaps
}
