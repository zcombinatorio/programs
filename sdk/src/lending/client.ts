/*
 * High-level client for the Lending program.
 * Handles account derivation, instruction building, and transaction composition.
 */

import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  PublicKey,
  ComputeBudgetProgram,
  SystemProgram,
  Connection,
  AccountInfo,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import {
  PROGRAM_ID,
  PRICE_SCALE,
  BASIS_POINTS_DIVISOR,
} from "./constants";
import {
  PoolType,
  LendingVaultAccount,
  PositionAccount,
  LendingTxOptions,
} from "./types";
import {
  deriveVaultPDA,
  deriveBaseVaultPDA,
  deriveQuoteVaultPDA,
  derivePositionPDA,
  calculateHealthBps,
  calculateMaxBorrow,
  calculateCurrentLtvBps,
  getAvailableLiquidity,
  getUtilizationBps,
  isLiquidatable,
  getTimeRemaining,
} from "./utils";
import {
  initializeVault,
  addLiquidity,
  removeLiquidity,
  openPosition,
  repay,
} from "./instructions";

const DEFAULT_COMPUTE_UNITS = 400_000;

export class LendingClient {
  public program: Program;
  public programId: PublicKey;
  private defaultComputeUnits: number;

  constructor(
    provider: AnchorProvider,
    idl: Idl,
    programId?: PublicKey,
    computeUnits?: number
  ) {
    this.programId = programId ?? PROGRAM_ID;
    this.program = new Program(idl, provider);
    this.defaultComputeUnits = computeUnits ?? DEFAULT_COMPUTE_UNITS;
  }

  /* ==========================================================================
   * PDA Derivation
   * ========================================================================== */

  deriveVaultPDA(
    baseMint: PublicKey,
    quoteMint: PublicKey,
    nonce: number
  ): [PublicKey, number] {
    return deriveVaultPDA(baseMint, quoteMint, nonce, this.programId);
  }

  deriveBaseVaultPDA(vaultPda: PublicKey): [PublicKey, number] {
    return deriveBaseVaultPDA(vaultPda, this.programId);
  }

  deriveQuoteVaultPDA(vaultPda: PublicKey): [PublicKey, number] {
    return deriveQuoteVaultPDA(vaultPda, this.programId);
  }

  derivePositionPDA(vaultPda: PublicKey, user: PublicKey): [PublicKey, number] {
    return derivePositionPDA(vaultPda, user, this.programId);
  }

  /* ==========================================================================
   * Account Fetching
   * ========================================================================== */

  async fetchVault(vaultPda: PublicKey): Promise<LendingVaultAccount> {
    // @ts-ignore - Account type available after IDL generation
    return this.program.account.lendingVault.fetch(vaultPda) as Promise<LendingVaultAccount>;
  }

  async fetchPosition(positionPda: PublicKey): Promise<PositionAccount> {
    // @ts-ignore - Account type available after IDL generation
    return this.program.account.position.fetch(positionPda) as Promise<PositionAccount>;
  }

  async fetchPositionOrNull(positionPda: PublicKey): Promise<PositionAccount | null> {
    try {
      return await this.fetchPosition(positionPda);
    } catch {
      return null;
    }
  }

  async fetchUserPosition(
    vaultPda: PublicKey,
    user: PublicKey
  ): Promise<PositionAccount | null> {
    const [positionPda] = this.derivePositionPDA(vaultPda, user);
    return this.fetchPositionOrNull(positionPda);
  }

  /* ==========================================================================
   * Health & Analytics
   * ========================================================================== */

  /**
   * Get vault statistics
   */
  async getVaultStats(vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    return {
      totalLiquidity: vault.totalBaseLiquidity,
      totalBorrowed: vault.totalBaseBorrowed,
      availableLiquidity: getAvailableLiquidity(vault),
      utilizationBps: getUtilizationBps(vault),
      openPositions: vault.openPositions,
      ltvBps: vault.ltvBps,
      liquidationThresholdBps: vault.liquidationThresholdBps,
      loanDurationSeconds: vault.loanDurationSeconds,
    };
  }

  /**
   * Get position health information
   */
  async getPositionHealth(
    positionPda: PublicKey,
    basePrice: BN
  ): Promise<{
    healthBps: BN | null;
    currentLtvBps: BN;
    maxBorrow: BN;
    liquidatable: boolean;
    reason: "undercollateralized" | "expired" | null;
    timeRemaining: { expired: boolean; secondsRemaining: BN };
  }> {
    const position = await this.fetchPosition(positionPda);
    const vault = await this.fetchVault(position.vault);

    const healthBps = calculateHealthBps(
      position.collateralAmount,
      position.borrowedAmount,
      basePrice
    );

    const currentLtvBps = calculateCurrentLtvBps(
      position.collateralAmount,
      position.borrowedAmount,
      basePrice
    );

    const maxBorrow = calculateMaxBorrow(
      position.collateralAmount,
      vault.ltvBps,
      basePrice
    );

    const { liquidatable, reason } = isLiquidatable(position, vault, basePrice);
    const timeRemaining = getTimeRemaining(position.openedAt, vault.loanDurationSeconds);

    return {
      healthBps,
      currentLtvBps,
      maxBorrow,
      liquidatable,
      reason,
      timeRemaining,
    };
  }

  /* ==========================================================================
   * Instructions
   * ========================================================================== */

  /**
   * Initialize a new lending vault
   */
  initializeVault(
    admin: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    pool: PublicKey,
    nonce: number,
    ltvBps: number,
    liquidationThresholdBps: number,
    loanDurationSeconds: BN | number,
    poolType: PoolType,
    options?: LendingTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    const [vaultPda] = this.deriveVaultPDA(baseMint, quoteMint, nonce);
    const [baseVault] = this.deriveBaseVaultPDA(vaultPda);
    const [quoteVault] = this.deriveQuoteVaultPDA(vaultPda);

    const durationBN =
      typeof loanDurationSeconds === "number"
        ? new BN(loanDurationSeconds)
        : loanDurationSeconds;

    let builder = initializeVault(
      this.program,
      admin,
      baseMint,
      quoteMint,
      pool,
      vaultPda,
      baseVault,
      quoteVault,
      nonce,
      ltvBps,
      liquidationThresholdBps,
      durationBN,
      poolType
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.defaultComputeUnits,
        }),
      ]);
    }

    return { builder, vaultPda, baseVault, quoteVault };
  }

  /**
   * Add liquidity to a vault (admin only)
   */
  async addLiquidity(
    admin: PublicKey,
    vaultPda: PublicKey,
    amount: BN | number,
    options?: LendingTxOptions
  ) {
    const { includeCuBudget = true, computeUnits, autoWrapUnwrap = true } = options ?? {};
    const vault = await this.fetchVault(vaultPda);
    const amountBN = typeof amount === "number" ? new BN(amount) : amount;

    const adminBaseAta = getAssociatedTokenAddressSync(vault.baseMint, admin);

    let builder = addLiquidity(
      this.program,
      admin,
      vaultPda,
      vault.baseMint,
      vault.baseVault,
      adminBaseAta,
      amountBN
    );

    const preIxs: any[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.defaultComputeUnits,
        })
      );
    }

    if (autoWrapUnwrap && vault.baseMint.equals(NATIVE_MINT)) {
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          admin,
          adminBaseAta,
          admin,
          NATIVE_MINT
        ),
        SystemProgram.transfer({
          fromPubkey: admin,
          toPubkey: adminBaseAta,
          lamports: BigInt(amountBN.toString()),
        }),
        createSyncNativeInstruction(adminBaseAta)
      );
    }

    if (preIxs.length > 0) {
      builder = builder.preInstructions(preIxs);
    }

    return builder;
  }

  /**
   * Remove liquidity from a vault (admin only)
   */
  async removeLiquidity(
    admin: PublicKey,
    vaultPda: PublicKey,
    amount: BN | number,
    options?: LendingTxOptions
  ) {
    const { includeCuBudget = true, computeUnits, autoWrapUnwrap = true } = options ?? {};
    const vault = await this.fetchVault(vaultPda);
    const amountBN = typeof amount === "number" ? new BN(amount) : amount;

    const adminBaseAta = getAssociatedTokenAddressSync(vault.baseMint, admin);

    let builder = removeLiquidity(
      this.program,
      admin,
      vaultPda,
      vault.baseMint,
      vault.baseVault,
      adminBaseAta,
      amountBN
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.defaultComputeUnits,
        }),
      ]);
    }

    if (autoWrapUnwrap && vault.baseMint.equals(NATIVE_MINT)) {
      builder = builder.postInstructions([
        createCloseAccountInstruction(adminBaseAta, admin, admin),
      ]);
    }

    return builder;
  }

  /**
   * Open a borrowing position
   */
  async openPosition(
    user: PublicKey,
    vaultPda: PublicKey,
    collateralAmount: BN | number,
    borrowAmount: BN | number,
    options?: LendingTxOptions
  ) {
    const { includeCuBudget = true, computeUnits, autoWrapUnwrap = true } = options ?? {};
    const vault = await this.fetchVault(vaultPda);

    const collateralBN =
      typeof collateralAmount === "number" ? new BN(collateralAmount) : collateralAmount;
    const borrowBN = typeof borrowAmount === "number" ? new BN(borrowAmount) : borrowAmount;

    const [positionPda] = this.derivePositionPDA(vaultPda, user);
    const userBaseAta = getAssociatedTokenAddressSync(vault.baseMint, user);
    const userQuoteAta = getAssociatedTokenAddressSync(vault.quoteMint, user);

    let builder = openPosition(
      this.program,
      user,
      vaultPda,
      positionPda,
      vault.baseMint,
      vault.quoteMint,
      vault.baseVault,
      vault.quoteVault,
      userBaseAta,
      userQuoteAta,
      vault.pool,
      collateralBN,
      borrowBN
    );

    const preIxs: any[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.defaultComputeUnits,
        })
      );
    }

    // Ensure user has ATAs
    preIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        user,
        userBaseAta,
        user,
        vault.baseMint
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        user,
        userQuoteAta,
        user,
        vault.quoteMint
      )
    );

    // Wrap SOL if collateral is native SOL
    if (autoWrapUnwrap && vault.quoteMint.equals(NATIVE_MINT)) {
      preIxs.push(
        SystemProgram.transfer({
          fromPubkey: user,
          toPubkey: userQuoteAta,
          lamports: BigInt(collateralBN.toString()),
        }),
        createSyncNativeInstruction(userQuoteAta)
      );
    }

    if (preIxs.length > 0) {
      builder = builder.preInstructions(preIxs);
    }

    // Unwrap SOL if borrowed asset is native SOL
    if (autoWrapUnwrap && vault.baseMint.equals(NATIVE_MINT)) {
      builder = builder.postInstructions([
        createCloseAccountInstruction(userBaseAta, user, user),
      ]);
    }

    return { builder, positionPda };
  }

  /**
   * Repay a position and retrieve collateral
   */
  async repay(
    user: PublicKey,
    vaultPda: PublicKey,
    options?: LendingTxOptions
  ) {
    const { includeCuBudget = true, computeUnits, autoWrapUnwrap = true } = options ?? {};
    const vault = await this.fetchVault(vaultPda);
    const [positionPda] = this.derivePositionPDA(vaultPda, user);
    const position = await this.fetchPosition(positionPda);

    const userBaseAta = getAssociatedTokenAddressSync(vault.baseMint, user);
    const userQuoteAta = getAssociatedTokenAddressSync(vault.quoteMint, user);

    let builder = repay(
      this.program,
      user,
      vaultPda,
      positionPda,
      vault.baseMint,
      vault.quoteMint,
      vault.baseVault,
      vault.quoteVault,
      userBaseAta,
      userQuoteAta
    );

    const preIxs: any[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.defaultComputeUnits,
        })
      );
    }

    // Wrap SOL if repaying native SOL
    if (autoWrapUnwrap && vault.baseMint.equals(NATIVE_MINT)) {
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          userBaseAta,
          user,
          NATIVE_MINT
        ),
        SystemProgram.transfer({
          fromPubkey: user,
          toPubkey: userBaseAta,
          lamports: BigInt(position.borrowedAmount.toString()),
        }),
        createSyncNativeInstruction(userBaseAta)
      );
    }

    if (preIxs.length > 0) {
      builder = builder.preInstructions(preIxs);
    }

    // Unwrap SOL if collateral is native SOL
    if (autoWrapUnwrap && vault.quoteMint.equals(NATIVE_MINT)) {
      builder = builder.postInstructions([
        createCloseAccountInstruction(userQuoteAta, user, user),
      ]);
    }

    return builder;
  }

  // Note: Liquidation methods would require significant additional logic
  // to handle pool-specific accounts (CP-AMM vs DLMM bin arrays).
  // These are best implemented with dedicated liquidation bots.
}
