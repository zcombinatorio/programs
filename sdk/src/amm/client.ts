import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PROGRAM_ID, FEE_AUTHORITY } from "./constants";
import { Amm, PoolAccount, SwapQuote } from "./types";
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
  createPool,
  addLiquidity,
  removeLiquidity,
  swap,
  crankTwap,
  ceaseTrading,
} from "./instructions";

import { AmmIDL } from "./generated";

const MAX_COMPUTE_UNITS = 300_000;

export class AMMClient {
  public program: Program<Amm>;
  public programId: PublicKey;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.programId = programId ?? PROGRAM_ID;
    this.program = new Program(AmmIDL as Amm, provider);
  }

  // ===========================================================================
  // PDA Helpers
  // ===========================================================================

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

  // ===========================================================================
  // Fetch Methods
  // ===========================================================================

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

  // ===========================================================================
  // Quote
  // ===========================================================================

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
      slippagePercent,
    );
  }

  // ===========================================================================
  // Instruction Builders
  // ===========================================================================

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

    const builder = createPool(
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
    amountB: BN | number
  ) {
    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const depositorTokenAccA = getAssociatedTokenAddressSync(pool.mintA, depositor);
    const depositorTokenAccB = getAssociatedTokenAddressSync(pool.mintB, depositor);

    return addLiquidity(
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
  }

  async removeLiquidity(
    depositor: PublicKey,
    poolPda: PublicKey,
    amountA: BN | number,
    amountB: BN | number
  ) {
    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const depositorTokenAccA = getAssociatedTokenAddressSync(pool.mintA, depositor);
    const depositorTokenAccB = getAssociatedTokenAddressSync(pool.mintB, depositor);

    return removeLiquidity(
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
  }

  async swap(
    trader: PublicKey,
    poolPda: PublicKey,
    swapAToB: boolean,
    inputAmount: BN | number,
    minOutputAmount: BN | number
  ) {
    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);
    const [feeVault] = this.deriveFeeVaultPDA(poolPda);
    const traderAccountA = getAssociatedTokenAddressSync(pool.mintA, trader);
    const traderAccountB = getAssociatedTokenAddressSync(pool.mintB, trader);

    return swap(
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
  }

  async crankTwap(poolPda: PublicKey) {
    const pool = await this.fetchPool(poolPda);
    const [reserveA] = this.deriveReservePDA(poolPda, pool.mintA);
    const [reserveB] = this.deriveReservePDA(poolPda, pool.mintB);

    return crankTwap(this.program, poolPda, reserveA, reserveB);
  }

  ceaseTrading(admin: PublicKey, poolPda: PublicKey) {
    return ceaseTrading(this.program, admin, poolPda);
  }

  // ===========================================================================
  // High-Level Swap with Slippage
  // ===========================================================================

  /**
   * High-level swap function that:
   * - Fetches current reserves and computes quote
   * - Calculates minOutput based on slippage tolerance
   * - Adds compute budget instruction
   * - Creates token accounts if they don't exist
   * - Handles WSOL wrapping/unwrapping if needed
   */
  async swapWithSlippage(
    trader: PublicKey,
    poolPda: PublicKey,
    swapAToB: boolean,
    inputAmount: BN | number,
    slippagePercent: number = 0.5
  ) {
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
    const builder = swap(
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

    // Pre-instructions: compute budget + token account creation
    const preIxs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS }),
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
      ),
    ];

    const postIxs: any[] = [];

    // Handle WSOL for input/output tokens
    const inputMint = swapAToB ? pool.mintA : pool.mintB;
    const outputMint = swapAToB ? pool.mintB : pool.mintA;
    const inputAta = swapAToB ? traderAccountA : traderAccountB;
    const outputAta = swapAToB ? traderAccountB : traderAccountA;

    if (inputMint.equals(NATIVE_MINT)) {
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

    if (outputMint.equals(NATIVE_MINT)) {
      // Unwrap SOL after swap
      postIxs.push(createCloseAccountInstruction(outputAta, trader, trader));
    }

    let result = builder.preInstructions(preIxs);
    if (postIxs.length > 0) {
      result = result.postInstructions(postIxs);
    }

    return {
      builder: result,
      quote: quoteResult,
    };
  }
}
