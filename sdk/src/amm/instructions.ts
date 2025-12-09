import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { FEE_AUTHORITY } from "./constants";

// =============================================================================
// Instruction Builders
// =============================================================================

export function createPool(
  program: Program,
  signer: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  poolPda: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  feeVault: PublicKey,
  fee: number,
  startingObservation: BN,
  maxObservationDelta: BN,
  warmupDuration: number
) {
  return program.methods
    .createPool(fee, startingObservation, maxObservationDelta, warmupDuration)
    .accounts({
      signer,
      mintA,
      mintB,
      pool: poolPda,
      reserveA,
      reserveB,
      feeAuthority: FEE_AUTHORITY,
      feeVault,
    });
}

export function createPoolWithLiquidity(
  program: Program,
  signer: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  poolPda: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  feeVault: PublicKey,
  signerTokenAccA: PublicKey,
  signerTokenAccB: PublicKey,
  fee: number,
  amountA: BN | number,
  amountB: BN | number,
  startingObservation: BN,
  maxObservationDelta: BN,
  warmupDuration: number
) {
  const amtA = typeof amountA === "number" ? new BN(amountA) : amountA;
  const amtB = typeof amountB === "number" ? new BN(amountB) : amountB;

  return program.methods
    .createPoolWithLiquidity(
      fee,
      amtA,
      amtB,
      startingObservation,
      maxObservationDelta,
      warmupDuration
    )
    .accounts({
      signer,
      mintA,
      mintB,
      pool: poolPda,
      reserveA,
      reserveB,
      feeAuthority: FEE_AUTHORITY,
      feeVault,
      signerTokenAccA,
      signerTokenAccB,
    });
}

export function addLiquidity(
  program: Program,
  depositor: PublicKey,
  poolPda: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  depositorTokenAccA: PublicKey,
  depositorTokenAccB: PublicKey,
  amountA: BN | number,
  amountB: BN | number
) {
  const amtA = typeof amountA === "number" ? new BN(amountA) : amountA;
  const amtB = typeof amountB === "number" ? new BN(amountB) : amountB;

  return program.methods.addLiquidity(amtA, amtB).accounts({
    depositor,
    pool: poolPda,
    reserveA,
    reserveB,
    depositorTokenAccA,
    depositorTokenAccB,
  });
}

export function removeLiquidity(
  program: Program,
  depositor: PublicKey,
  poolPda: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  depositorTokenAccA: PublicKey,
  depositorTokenAccB: PublicKey,
  amountA: BN | number,
  amountB: BN | number
) {
  const amtA = typeof amountA === "number" ? new BN(amountA) : amountA;
  const amtB = typeof amountB === "number" ? new BN(amountB) : amountB;

  return program.methods.removeLiquidity(amtA, amtB).accounts({
    depositor,
    pool: poolPda,
    reserveA,
    reserveB,
    depositorTokenAccA,
    depositorTokenAccB,
  });
}

export function swap(
  program: Program,
  trader: PublicKey,
  poolPda: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey,
  feeVault: PublicKey,
  traderAccountA: PublicKey,
  traderAccountB: PublicKey,
  swapAToB: boolean,
  inputAmount: BN | number,
  minOutputAmount: BN | number
) {
  const input = typeof inputAmount === "number" ? new BN(inputAmount) : inputAmount;
  const minOutput =
    typeof minOutputAmount === "number" ? new BN(minOutputAmount) : minOutputAmount;

  return program.methods.swap(swapAToB, input, minOutput).accounts({
    trader,
    pool: poolPda,
    reserveA,
    reserveB,
    feeVault,
    traderAccountA,
    traderAccountB,
  });
}

export function crankTwap(
  program: Program,
  poolPda: PublicKey,
  reserveA: PublicKey,
  reserveB: PublicKey
) {
  return program.methods.crankTwap().accounts({
    pool: poolPda,
    reserveA,
    reserveB,
  });
}
