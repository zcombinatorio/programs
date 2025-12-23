/*
 * High-level client for the AMM program.
 * Provides ergonomic methods for pool operations with automatic PDA derivation,
 * native SOL wrapping/unwrapping, and compute budget management.
 */

import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  ComputeBudgetProgram,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PROGRAM_ID } from "./constants";
import { Amm, PoolAccount, SwapQuote, AmmActionOptions } from "./types";
import {
  derivePoolPDA,
  deriveReservePDA,
  deriveFeeVaultPDA,
  fetchPoolAccount,
  createSwapQuote,
  calculateSpotPrice,
  calculateTwap,
} from "./utils";
import {
  createPool as createPoolIx,
  addLiquidity as addLiquidityIx,
  removeLiquidity as removeLiquidityIx,
  swap as swapIx,
  crankTwap as crankTwapIx,
  ceaseTrading as ceaseTradingIx,
} from "./instructions";

import { AmmIDL } from "../generated/idls";

const DEFAULT_COMPUTE_UNITS = 300_000;

export class AMMClient {
  public program: Program<Amm>;
  public programId: PublicKey;
  public computeUnits: number;

  constructor(
    provider: AnchorProvider,
    programId?: PublicKey,
    computeUnits?: number
  ) {
    this.programId = programId ?? PROGRAM_ID;
    this.computeUnits = computeUnits ?? DEFAULT_COMPUTE_UNITS;
    this.program = new Program(AmmIDL as Amm, provider);
  }

  /* PDA Helpers */

  derivePoolPDA(
    admin: PublicKey,
    mintA: PublicKey,
    mintB: PublicKey
  ): [PublicKey, number] {
    return derivePoolPDA(admin, mintA, mintB, this.programId);
  }

  deriveReservePDA(pool: PublicKey, mint: PublicKey): [PublicKey, number] {
    return deriveReservePDA(pool, mint, this.programId);
  }

  deriveFeeVaultPDA(pool: PublicKey): [PublicKey, number] {
    return deriveFeeVaultPDA(pool, this.programId);
  }

  /* State Fetching */

  async fetchPool(poolPda: PublicKey): Promise<PoolAccount> {
    return fetchPoolAccount(this.program, poolPda);
  }

  async fetchReserves(poolPda: PublicKey): Promise<{ reserveA: BN; reserveB: BN }> {
    const pool = await this.fetchPool(poolPda);
    const [reserveAPda] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveBPda] = this.deriveReservePDA(poolPda, pool.mintB);

    const connection = this.program.provider.connection;

    const [reserveAAccount, reserveBAccount] = await Promise.all([
      getAccount(connection, reserveAPda),
      getAccount(connection, reserveBPda),
    ]);

    return {
      reserveA: new BN(reserveAAccount.amount.toString()),
      reserveB: new BN(reserveBAccount.amount.toString()),
    };
  }

  async fetchMintDecimals(poolPda: PublicKey): Promise<{ decimalsA: number; decimalsB: number }> {
    const pool = await this.fetchPool(poolPda);
    const connection = this.program.provider.connection;
    const [mintA, mintB] = await Promise.all([
      getMint(connection, pool.mintA),
      getMint(connection, pool.mintB),
    ]);
    return { decimalsA: mintA.decimals, decimalsB: mintB.decimals };
  }

  async fetchSpotPrice(poolPda: PublicKey): Promise<BN> {
    const { reserveA, reserveB } = await this.fetchReserves(poolPda);
    const { decimalsA, decimalsB } = await this.fetchMintDecimals(poolPda);
    return calculateSpotPrice(reserveA, reserveB, decimalsA, decimalsB);
  }

  async fetchTwap(poolPda: PublicKey): Promise<BN | null> {
    const pool = await this.fetchPool(poolPda);
    return calculateTwap(pool.oracle);
  }

  /* Quote */

  async quote(
    poolPda: PublicKey,
    swapAToB: boolean,
    inputAmount: BN | number,
    slippagePercent: number = 0.5,
  ): Promise<SwapQuote> {
    const pool = await this.fetchPool(poolPda);
    const { reserveA, reserveB } = await this.fetchReserves(poolPda);
    const { decimalsA, decimalsB } = await this.fetchMintDecimals(poolPda);

    const [reserveIn, reserveOut] = swapAToB
      ? [reserveA, reserveB]
      : [reserveB, reserveA];

    const [decimalsIn, decimalsOut] = swapAToB
      ? [decimalsA, decimalsB]
      : [decimalsB, decimalsA];

    return createSwapQuote(
      inputAmount,
      reserveIn,
      reserveOut,
      pool.fee,
      decimalsIn,
      decimalsOut,
      swapAToB,
      slippagePercent,
    );
  }

  /* Instruction Builders */

  createPool(
    payer: PublicKey,
    admin: PublicKey,
    mintA: PublicKey,
    mintB: PublicKey,
    fee: number,
    startingObservation: BN,
    maxObservationDelta: BN,
    warmupDuration: number,
    liquidityProvider: PublicKey | null = null
  ) {
    const [poolPda] = this.derivePoolPDA(admin, mintA, mintB);
    const [reserveA] = this.deriveReservePDA(poolPda, mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, mintB);
    const [feeVault] = this.deriveFeeVaultPDA(poolPda);

    const builder = createPoolIx(
      this.program,
      payer,
      admin,
      mintA,
      mintB,
      poolPda,
      reserveA,
      reserveB,
      feeVault,
      fee,
      startingObservation,
      maxObservationDelta,
      warmupDuration,
      liquidityProvider
    );

    return {
      builder,
      poolPda,
      reserveA,
      reserveB,
      feeVault,
    };
  }

  async addLiquidity(
    depositor: PublicKey,
    poolPda: PublicKey,
    amountA: BN | number,
    amountB: BN | number,
    options?: AmmActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const depositorTokenAccA = getAssociatedTokenAddressSync(pool.mintA, depositor);
    const depositorTokenAccB = getAssociatedTokenAddressSync(pool.mintB, depositor);

    const preIxs: TransactionInstruction[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        })
      );
    }

    if (autoWrapUnwrap && pool.mintA.equals(NATIVE_MINT)) {
      const amountABN = typeof amountA === "number" ? new BN(amountA) : amountA;
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          depositor,
          depositorTokenAccA,
          depositor,
          pool.mintA
        ),
        SystemProgram.transfer({
          fromPubkey: depositor,
          toPubkey: depositorTokenAccA,
          lamports: BigInt(amountABN.toString()),
        }),
        createSyncNativeInstruction(depositorTokenAccA)
      );
    }

    if (autoWrapUnwrap && pool.mintB.equals(NATIVE_MINT)) {
      const amountBBN = typeof amountB === "number" ? new BN(amountB) : amountB;
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          depositor,
          depositorTokenAccB,
          depositor,
          pool.mintB
        ),
        SystemProgram.transfer({
          fromPubkey: depositor,
          toPubkey: depositorTokenAccB,
          lamports: BigInt(amountBBN.toString()),
        }),
        createSyncNativeInstruction(depositorTokenAccB)
      );
    }

    let builder = addLiquidityIx(
      this.program,
      depositor,
      poolPda,
      reserveA,
      reserveB,
      depositorTokenAccA,
      depositorTokenAccB,
      amountA,
      amountB
    );

    return preIxs.length > 0 ? builder.preInstructions(preIxs) : builder;
  }

  async removeLiquidity(
    depositor: PublicKey,
    poolPda: PublicKey,
    amountA: BN | number,
    amountB: BN | number,
    options?: AmmActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const depositorTokenAccA = getAssociatedTokenAddressSync(pool.mintA, depositor);
    const depositorTokenAccB = getAssociatedTokenAddressSync(pool.mintB, depositor);

    let builder = removeLiquidityIx(
      this.program,
      depositor,
      poolPda,
      reserveA,
      reserveB,
      depositorTokenAccA,
      depositorTokenAccB,
      amountA,
      amountB
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    const postIxs: TransactionInstruction[] = [];

    if (autoWrapUnwrap && pool.mintA.equals(NATIVE_MINT)) {
      postIxs.push(createCloseAccountInstruction(depositorTokenAccA, depositor, depositor));
    }

    if (autoWrapUnwrap && pool.mintB.equals(NATIVE_MINT)) {
      postIxs.push(createCloseAccountInstruction(depositorTokenAccB, depositor, depositor));
    }

    return postIxs.length > 0 ? builder.postInstructions(postIxs) : builder;
  }

  async swap(
    trader: PublicKey,
    poolPda: PublicKey,
    swapAToB: boolean,
    inputAmount: BN | number,
    minOutputAmount: BN | number,
    options?: AmmActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const [feeVault] = this.deriveFeeVaultPDA(poolPda);
    const traderAccountA = getAssociatedTokenAddressSync(pool.mintA, trader);
    const traderAccountB = getAssociatedTokenAddressSync(pool.mintB, trader);

    const preIxs: TransactionInstruction[] = [];
    const postIxs: TransactionInstruction[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        })
      );
    }

    const inputMint = swapAToB ? pool.mintA : pool.mintB;
    const outputMint = swapAToB ? pool.mintB : pool.mintA;
    const inputAta = swapAToB ? traderAccountA : traderAccountB;
    const outputAta = swapAToB ? traderAccountB : traderAccountA;

    if (autoWrapUnwrap) {
      // Create ATAs idempotently
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          trader,
          traderAccountA,
          trader,
          pool.mintA
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          trader,
          traderAccountB,
          trader,
          pool.mintB
        )
      );

      // Wrap input SOL if needed
      if (inputMint.equals(NATIVE_MINT)) {
        const input = typeof inputAmount === "number" ? new BN(inputAmount) : inputAmount;
        preIxs.push(
          SystemProgram.transfer({
            fromPubkey: trader,
            toPubkey: inputAta,
            lamports: BigInt(input.toString()),
          }),
          createSyncNativeInstruction(inputAta)
        );
      }

      // Unwrap output SOL if needed
      if (outputMint.equals(NATIVE_MINT)) {
        postIxs.push(createCloseAccountInstruction(outputAta, trader, trader));
      }
    }

    let builder = swapIx(
      this.program,
      trader,
      poolPda,
      reserveA,
      reserveB,
      feeVault,
      traderAccountA,
      traderAccountB,
      swapAToB,
      inputAmount,
      minOutputAmount
    );

    if (preIxs.length > 0) {
      builder = builder.preInstructions(preIxs);
    }
    if (postIxs.length > 0) {
      builder = builder.postInstructions(postIxs);
    }

    return builder;
  }

  async crankTwap(poolPda: PublicKey) {
    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);

    return crankTwapIx(this.program, poolPda, reserveA, reserveB);
  }

  ceaseTrading(admin: PublicKey, poolPda: PublicKey) {
    return ceaseTradingIx(this.program, admin, poolPda);
  }

  /* High-Level Swap with Slippage */

  /**
   * High-level swap function that:
   * - Fetches current reserves and computes quote
   * - Calculates minOutput based on slippage tolerance
   * - Adds compute budget instruction (if includeCuBudget is true)
   * - Creates token accounts if they don't exist (if autoWrapUnwrap is true)
   * - Handles WSOL wrapping/unwrapping if needed (if autoWrapUnwrap is true)
   */
  async swapWithSlippage(
    trader: PublicKey,
    poolPda: PublicKey,
    swapAToB: boolean,
    inputAmount: BN | number,
    slippagePercent: number = 0.5,
    options?: AmmActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const pool = await this.fetchPool(poolPda);
    const input = typeof inputAmount === "number" ? new BN(inputAmount) : inputAmount;

    // Get quote with slippage
    const quoteResult = await this.quote(poolPda, swapAToB, input, slippagePercent);

    // Derive accounts
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const [feeVault] = this.deriveFeeVaultPDA(poolPda);
    const traderAccountA = getAssociatedTokenAddressSync(pool.mintA, trader);
    const traderAccountB = getAssociatedTokenAddressSync(pool.mintB, trader);

    // Build base swap instruction
    let builder = swapIx(
      this.program,
      trader,
      poolPda,
      reserveA,
      reserveB,
      feeVault,
      traderAccountA,
      traderAccountB,
      swapAToB,
      input,
      quoteResult.minOutputAmount
    );

    const preIxs: TransactionInstruction[] = [];
    const postIxs: TransactionInstruction[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        })
      );
    }

    if (autoWrapUnwrap) {
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          trader,
          traderAccountA,
          trader,
          pool.mintA
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          trader,
          traderAccountB,
          trader,
          pool.mintB
        )
      );
    }

    // Handle WSOL for input/output tokens
    const inputMint = swapAToB ? pool.mintA : pool.mintB;
    const outputMint = swapAToB ? pool.mintB : pool.mintA;
    const inputAta = swapAToB ? traderAccountA : traderAccountB;
    const outputAta = swapAToB ? traderAccountB : traderAccountA;

    if (autoWrapUnwrap && inputMint.equals(NATIVE_MINT)) {
      // Wrap SOL before swap
      preIxs.push(
        SystemProgram.transfer({
          fromPubkey: trader,
          toPubkey: inputAta,
          lamports: BigInt(input.toString()),
        }),
        createSyncNativeInstruction(inputAta)
      );
    }

    if (autoWrapUnwrap && outputMint.equals(NATIVE_MINT)) {
      // Unwrap SOL after swap
      postIxs.push(createCloseAccountInstruction(outputAta, trader, trader));
    }

    if (preIxs.length > 0) {
      builder = builder.preInstructions(preIxs);
    }
    if (postIxs.length > 0) {
      builder = builder.postInstructions(postIxs);
    }

    return {
      builder,
      quote: quoteResult,
    };
  }
}
