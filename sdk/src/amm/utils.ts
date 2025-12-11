import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { POOL_SEED, RESERVE_SEED, FEE_VAULT_SEED, PROGRAM_ID, PRICE_SCALE } from "./constants";
import { PoolState, PoolAccount, TwapOracle, SwapQuote } from "./types";

// =============================================================================
// PDA Derivation
// =============================================================================

export function derivePoolPDA(
  admin: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, admin.toBuffer(), mintA.toBuffer(), mintB.toBuffer()],
    programId
  );
}

export function deriveReservePDA(
  pool: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [RESERVE_SEED, pool.toBuffer(), mint.toBuffer()],
    programId
  );
}

export function deriveFeeVaultPDA(
  pool: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED, pool.toBuffer()],
    programId
  );
}

// =============================================================================
// Parsers
// =============================================================================

export function parsePoolState(state: any): PoolState {
  if ("trading" in state) return PoolState.Trading;
  if ("finalized" in state) return PoolState.Finalized;
  throw new Error("Unknown pool state");
}

// =============================================================================
// Fetch
// =============================================================================

export async function fetchPoolAccount(
  program: Program,
  poolPda: PublicKey
): Promise<PoolAccount> {
  const raw = await (program.account as any).poolAccount.fetch(poolPda);

  return {
    admin: raw.admin,
    liquidityProvider: raw.liquidityProvider,
    mintA: raw.mintA,
    mintB: raw.mintB,
    fee: raw.fee,
    oracle: {
      cumulativeObservations: raw.oracle.cumulativeObservations,
      lastUpdateUnixTime: raw.oracle.lastUpdateUnixTime,
      createdAtUnixTime: raw.oracle.createdAtUnixTime,
      lastPrice: raw.oracle.lastPrice,
      lastObservation: raw.oracle.lastObservation,
      maxObservationDelta: raw.oracle.maxObservationDelta,
      startingObservation: raw.oracle.startingObservation,
      warmupDuration: raw.oracle.warmupDuration,
    },
    state: parsePoolState(raw.state),
    bumps: {
      pool: raw.bumps.pool,
      reserveA: raw.bumps.reserveA,
      reserveB: raw.bumps.reserveB,
      feeVault: raw.bumps.feeVault,
    },
  };
}

// =============================================================================
// Math Utilities
// =============================================================================

const PRICE_SCALE_BN = new BN(PRICE_SCALE.toString());

export function calculateSpotPrice(
  reserveA: BN,
  reserveB: BN,
  decimalsA: number,
  decimalsB: number,
): BN {
  if (reserveB.isZero()) return new BN(0);

  const decimalDiff = decimalsB - decimalsA;

  if (decimalDiff >= 0) {
    const multiplier = new BN(10).pow(new BN(decimalDiff));
    return reserveA.mul(multiplier).mul(PRICE_SCALE_BN).div(reserveB);
  } else {
    const divisor = new BN(10).pow(new BN(-decimalDiff));
    return reserveA.mul(PRICE_SCALE_BN).div(reserveB).div(divisor);
  }
}

/**
 * Compute swap output using constant product formula with fees
 */
export function computeSwapOutput(
  inputAmount: BN | number,
  reserveIn: BN,
  reserveOut: BN,
  feeBps: number
): { outputAmount: BN; feeAmount: BN } {
  const input = typeof inputAmount === "number" ? new BN(inputAmount) : inputAmount;

  if (reserveIn.isZero() || reserveOut.isZero()) {
    return { outputAmount: new BN(0), feeAmount: new BN(0) };
  }

  // Fee is collected from input token
  const feeAmount = input.mul(new BN(feeBps)).div(new BN(10000));
  const inputAfterFee = input.sub(feeAmount);

  // Constant product: (reserveIn + inputAfterFee) * (reserveOut - output) = reserveIn * reserveOut
  // output = reserveOut * inputAfterFee / (reserveIn + inputAfterFee)
  const numerator = reserveOut.mul(inputAfterFee);
  const denominator = reserveIn.add(inputAfterFee);
  const outputAmount = numerator.div(denominator);

  return { outputAmount, feeAmount };
}

/**
 * Compute swap input needed to get a specific output
 */
export function computeSwapInput(
  outputAmount: BN | number,
  reserveIn: BN,
  reserveOut: BN,
  feeBps: number
): { inputAmount: BN; feeAmount: BN } {
  const output = typeof outputAmount === "number" ? new BN(outputAmount) : outputAmount;

  if (reserveIn.isZero() || reserveOut.isZero() || output.gte(reserveOut)) {
    return { inputAmount: new BN(0), feeAmount: new BN(0) };
  }

  // inputAfterFee = reserveIn * output / (reserveOut - output)
  const numerator = reserveIn.mul(output);
  const denominator = reserveOut.sub(output);
  const inputAfterFee = numerator.div(denominator).add(new BN(1)); // Round up

  // inputAmount = inputAfterFee * 10000 / (10000 - feeBps)
  const inputAmount = inputAfterFee.mul(new BN(10000)).div(new BN(10000 - feeBps)).add(new BN(1));
  const feeAmount = inputAmount.mul(new BN(feeBps)).div(new BN(10000));

  return { inputAmount, feeAmount };
}

export function calculatePriceImpact(
  inputAmount: BN,
  outputAmount: BN,
  reserveIn: BN,
  reserveOut: BN,
  decimalsIn: number,
  decimalsOut: number,
): number {
  if (reserveIn.isZero() || reserveOut.isZero() || inputAmount.isZero()) {
    return 0;
  }

  const spotPrice = calculateSpotPrice(reserveIn, reserveOut, decimalsIn, decimalsOut);
  const executionPrice = calculateSpotPrice(inputAmount, outputAmount, decimalsIn, decimalsOut);

  if (spotPrice.isZero()) return 0;

  const impact = executionPrice.sub(spotPrice).mul(new BN(10000)).div(spotPrice);
  return Math.abs(impact.toNumber()) / 100;
}

export function createSwapQuote(
  inputAmount: BN | number,
  reserveIn: BN,
  reserveOut: BN,
  feeBps: number,
  decimalsIn: number,
  decimalsOut: number,
  slippagePercent: number = 0.5,
): SwapQuote {
  const input = typeof inputAmount === "number" ? new BN(inputAmount) : inputAmount;

  const { outputAmount, feeAmount } = computeSwapOutput(input, reserveIn, reserveOut, feeBps);

  const slippageBps = Math.floor(slippagePercent * 100);
  const minOutputAmount = outputAmount.mul(new BN(10000 - slippageBps)).div(new BN(10000));

  const spotPriceBefore = calculateSpotPrice(reserveIn, reserveOut, decimalsIn, decimalsOut);
  const newReserveIn = reserveIn.add(input);
  const newReserveOut = reserveOut.sub(outputAmount);
  const spotPriceAfter = calculateSpotPrice(newReserveIn, newReserveOut, decimalsIn, decimalsOut);

  const priceImpact = calculatePriceImpact(input, outputAmount, reserveIn, reserveOut, decimalsIn, decimalsOut);

  return {
    inputAmount: input,
    outputAmount,
    minOutputAmount,
    feeAmount,
    priceImpact,
    spotPriceBefore,
    spotPriceAfter,
  };
}

// =============================================================================
// TWAP Utilities
// =============================================================================

export function calculateTwap(oracle: TwapOracle): BN | null {
  const warmupEnd = oracle.createdAtUnixTime.add(new BN(oracle.warmupDuration));

  if (oracle.lastUpdateUnixTime.lte(warmupEnd)) {
    return null;
  }

  const elapsed = oracle.lastUpdateUnixTime.sub(warmupEnd);

  if (elapsed.isZero() || oracle.cumulativeObservations.isZero()) {
    return null;
  }

  return oracle.cumulativeObservations.div(elapsed);
}

export function isOracleInWarmup(oracle: TwapOracle, currentTime?: BN): boolean {
  const now = currentTime ?? new BN(Math.floor(Date.now() / 1000));
  const warmupEnd = oracle.createdAtUnixTime.add(new BN(oracle.warmupDuration));
  return now.lt(warmupEnd);
}
