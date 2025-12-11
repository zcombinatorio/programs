import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// =============================================================================
// Instruction Builders
// =============================================================================

export function createPool(
  program: Program,
  payer: PublicKey,
  admin: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  pool: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  feeVault: PublicKey,
  fee: number,
  startingObservation: BN,
  maxObservationDelta: BN,
  warmupDuration: number,
  liquidityProvider: PublicKey | null = null
) {
  return program.methods
    .createPool(fee, startingObservation, maxObservationDelta, warmupDuration, liquidityProvider)
    .accounts({
      payer,
      admin,
      mintA,
      mintB,
      pool,
      reserveA,
      reserveB,
      feeVault,
    });
}

export function addLiquidity(
  program: Program,
  depositor: PublicKey,
  pool: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  depositorTokenAccA: PublicKey,
  depositorTokenAccB: PublicKey,
  amountA: BN | number,
  amountB: BN | number
) {
  const amountABN = typeof amountA === "number" ? new BN(amountA) : amountA;
  const amountBBN = typeof amountB === "number" ? new BN(amountB) : amountB;

  return program.methods.addLiquidity(amountABN, amountBBN).accounts({
    depositor,
    pool,
    reserveA,
    reserveB,
    depositorTokenAccA,
    depositorTokenAccB,
  });
}

export function removeLiquidity(
  program: Program,
  depositor: PublicKey,
  pool: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  depositorTokenAccA: PublicKey,
  depositorTokenAccB: PublicKey,
  amountA: BN | number,
  amountB: BN | number
) {
  const amountABN = typeof amountA === "number" ? new BN(amountA) : amountA;
  const amountBBN = typeof amountB === "number" ? new BN(amountB) : amountB;

  return program.methods.removeLiquidity(amountABN, amountBBN).accounts({
    depositor,
    pool,
    reserveA,
    reserveB,
    depositorTokenAccA,
    depositorTokenAccB,
  });
}

export function swap(
  program: Program,
  trader: PublicKey,
  pool: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  feeVault: PublicKey,
  traderAccountA: PublicKey,
  traderAccountB: PublicKey,
  swapAToB: boolean,
  inputAmount: BN | number,
  minOutputAmount: BN | number
) {
  const inputAmountBN = typeof inputAmount === "number" ? new BN(inputAmount) : inputAmount;
  const minOutputAmountBN = typeof minOutputAmount === "number" ? new BN(minOutputAmount) : minOutputAmount;

  return program.methods.swap(swapAToB, inputAmountBN, minOutputAmountBN).accounts({
    trader,
    pool,
    reserveA,
    reserveB,
    feeVault,
    traderAccountA,
    traderAccountB,
  });
}

export function crankTwap(
  program: Program,
  pool: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey
) {
  return program.methods.crankTwap().accounts({
    pool,
    reserveA,
    reserveB,
  });
}

export function ceaseTrading(
  program: Program,
  admin: PublicKey,
  pool: PublicKey
) {
  return program.methods.ceaseTrading().accounts({
    admin,
    pool,
  });
}
