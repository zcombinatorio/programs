import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { AMM_PROGRAM_ID, POOL_SEED, RESERVE_SEED, FEE_VAULT_SEED, PRICE_SCALE } from "./constants";
import { PoolAccount, TwapOracle, SwapQuote } from "./types";

// =============================================================================
// PDA Helpers
// =============================================================================

export function derivePoolPDA(
  admin: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  programId: PublicKey = AMM_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, admin.toBuffer(), mintA.toBuffer(), mintB.toBuffer()],
    programId
  );
}

export function deriveReservePDA(
  pool: PublicKey,
  mint: PublicKey,
  programId: PublicKey = AMM_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [RESERVE_SEED, pool.toBuffer(), mint.toBuffer()],
    programId
  );
}

export function deriveFeeVaultPDA(
  pool: PublicKey,
  programId: PublicKey = AMM_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED, pool.toBuffer()],
    programId
  );
}

// =============================================================================
// Parsers
// =============================================================================

function parseTwapOracle(raw: any): TwapOracle {
  return {
    cumulativeObservations: raw.cumulativeObservations,
    lastUpdateUnixTime: raw.lastUpdateUnixTime,
    createdAtUnixTime: raw.createdAtUnixTime,
    lastPrice: raw.lastPrice,
    lastObservation: raw.lastObservation,
    maxObservationDelta: raw.maxObservationDelta,
    startingObservation: raw.startingObservation,
    warmupDuration: raw.warmupDuration,
  };
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
    mintA: raw.mintA,
    mintB: raw.mintB,
    fee: raw.fee,
    oracle: parseTwapOracle(raw.oracle),
    bump: raw.bump,
  };
}

// =============================================================================
// Quote / Swap Math
// =============================================================================

/**
 * Computes the output amount for a swap using constant product formula.
 * Formula: output = (input * reserve_out) / (reserve_in + input)
 */
export function computeSwapOutput(
  inputAmount: BN | number,
  reserveIn: BN | number,
  reserveOut: BN | number,
  feeBps: number,
  swapAToB: boolean
): { output: BN; fee: BN } {
  const input = new BN(inputAmount);
  const resIn = new BN(reserveIn);
  const resOut = new BN(reserveOut);

  if (swapAToB) {
    // A -> B: fee on input
    let fee = input.mul(new BN(feeBps)).div(new BN(10000));
    if (feeBps > 0 && fee.isZero()) {
      fee = new BN(1);
    }
    const taxedInput = input.sub(fee);
    const numerator = taxedInput.mul(resOut);
    const denominator = resIn.add(taxedInput);
    const output = numerator.div(denominator);
    return { output, fee };
  } else {
    // B -> A: fee on output
    const numerator = input.mul(resIn);
    const denominator = resOut.add(input);
    const grossOutput = numerator.div(denominator);
    let fee = grossOutput.mul(new BN(feeBps)).div(new BN(10000));
    if (feeBps > 0 && fee.isZero()) {
      fee = new BN(1);
    }
    const output = grossOutput.sub(fee);
    return { output, fee };
  }
}

/**
 * Computes the input amount needed to receive a specific output.
 * Inverse of computeSwapOutput.
 */
export function computeSwapInput(
  outputAmount: BN | number,
  reserveIn: BN | number,
  reserveOut: BN | number,
  feeBps: number,
  swapAToB: boolean
): { input: BN; fee: BN } {
  const output = new BN(outputAmount);
  const resIn = new BN(reserveIn);
  const resOut = new BN(reserveOut);

  if (swapAToB) {
    // A -> B: output from reserve_b
    // output = (taxedInput * resOut) / (resIn + taxedInput)
    // taxedInput = (output * resIn) / (resOut - output)
    const numerator = output.mul(resIn);
    const denominator = resOut.sub(output);
    const taxedInput = numerator.div(denominator).add(new BN(1)); // Round up

    // taxedInput = input - fee, fee = input * feeBps / 10000
    // taxedInput = input * (1 - feeBps/10000) = input * (10000 - feeBps) / 10000
    // input = taxedInput * 10000 / (10000 - feeBps)
    const input = taxedInput.mul(new BN(10000)).div(new BN(10000 - feeBps)).add(new BN(1));
    let fee = input.mul(new BN(feeBps)).div(new BN(10000));
    if (feeBps > 0 && fee.isZero()) {
      fee = new BN(1);
    }
    return { input, fee };
  } else {
    // B -> A: fee on output
    // netOutput = grossOutput - fee, fee = grossOutput * feeBps / 10000
    // netOutput = grossOutput * (10000 - feeBps) / 10000
    // grossOutput = netOutput * 10000 / (10000 - feeBps)
    const grossOutput = output.mul(new BN(10000)).div(new BN(10000 - feeBps)).add(new BN(1));
    let fee = grossOutput.mul(new BN(feeBps)).div(new BN(10000));
    if (feeBps > 0 && fee.isZero()) {
      fee = new BN(1);
    }

    // grossOutput = (input * resIn) / (resOut + input)
    // input = (grossOutput * resOut) / (resIn - grossOutput)
    const numerator = grossOutput.mul(resOut);
    const denominator = resIn.sub(grossOutput);
    const input = numerator.div(denominator).add(new BN(1)); // Round up
    return { input, fee };
  }
}

/**
 * Calculates price impact as a percentage.
 * Price impact = 1 - (actualRate / spotRate)
 */
export function calculatePriceImpact(
  inputAmount: BN,
  outputAmount: BN,
  reserveIn: BN,
  reserveOut: BN
): number {
  // Spot rate = reserveOut / reserveIn
  // Actual rate = outputAmount / inputAmount
  // Price impact = 1 - (actualRate / spotRate)
  //              = 1 - (outputAmount * reserveIn) / (inputAmount * reserveOut)

  const spotNumerator = reserveOut.mul(new BN(10000));
  const spotRate = spotNumerator.div(reserveIn);

  const actualNumerator = outputAmount.mul(new BN(10000));
  const actualRate = actualNumerator.div(inputAmount);

  // Impact = (spotRate - actualRate) / spotRate * 100
  if (spotRate.isZero()) return 0;
  const impact = spotRate.sub(actualRate).mul(new BN(10000)).div(spotRate);
  return impact.toNumber() / 100; // Return as percentage
}

/**
 * Creates a full swap quote with output, fee, price impact, and minimum output.
 */
export function createSwapQuote(
  inputAmount: BN | number,
  reserveIn: BN | number,
  reserveOut: BN | number,
  feeBps: number,
  swapAToB: boolean,
  slippagePercent: number = 0.5
): SwapQuote {
  const input = new BN(inputAmount);
  const resIn = new BN(reserveIn);
  const resOut = new BN(reserveOut);

  const { output, fee } = computeSwapOutput(input, resIn, resOut, feeBps, swapAToB);

  const priceImpact = calculatePriceImpact(input, output, resIn, resOut);

  // Calculate minimum output with slippage tolerance
  // minOutput = output * (100 - slippage) / 100
  const slippageBps = Math.floor(slippagePercent * 100);
  const minOutputAmount = output.mul(new BN(10000 - slippageBps)).div(new BN(10000));

  return {
    outputAmount: output,
    feeAmount: fee,
    priceImpact,
    minOutputAmount,
  };
}

// =============================================================================
// TWAP Helpers
// =============================================================================

/**
 * Calculates the TWAP from oracle state (client-side replication of on-chain logic).
 * Returns null if not enough time has passed since warmup.
 */
export function calculateTwap(oracle: TwapOracle): BN | null {
  const accumulationStart = oracle.createdAtUnixTime.add(new BN(oracle.warmupDuration));

  if (oracle.lastUpdateUnixTime.lte(accumulationStart)) {
    return null; // Still in warmup
  }

  const elapsed = oracle.lastUpdateUnixTime.sub(accumulationStart);

  if (elapsed.isZero() || oracle.cumulativeObservations.isZero()) {
    return null;
  }

  return oracle.cumulativeObservations.div(elapsed);
}

/**
 * Gets the current spot price from reserves (scaled by PRICE_SCALE).
 */
export function calculateSpotPrice(reserveA: BN | number, reserveB: BN | number): BN {
  const resA = new BN(reserveA);
  const resB = new BN(reserveB);

  if (resB.isZero()) {
    return new BN(0);
  }

  return resA.mul(new BN(PRICE_SCALE.toString())).div(resB);
}
