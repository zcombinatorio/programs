/*
 * High-level client for the SVault program.
 * Provides ergonomic methods for staking operations with automatic PDA derivation
 * and compute budget management.
 */

import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import {
  Svault,
  SVaultTxOptions,
  StakingConfigAccount,
  UserStakeAccount,
  DelegateAccount,
} from "./types";
import {
  deriveStakingConfigPDA,
  deriveUserStakePDA,
  deriveDelegatePDA,
  deriveStakeVaultPDA,
  deriveRewardVaultPDA,
  fetchStakingConfigAccount,
  fetchUserStakeAccount,
  fetchDelegateAccount,
} from "./utils";
import {
  initializeStakingVault,
  stake,
  initiateUnstake,
  withdraw,
  postRewards,
  claimRewards,
  setConfig,
  slash,
  addDelegate,
  removeDelegate,
} from "./instructions";

import { SvaultIDL } from "../generated/idls";

const DEFAULT_COMPUTE_UNITS = 200_000;

export class SVaultClient {
  public program: Program<Svault>;
  public programId: PublicKey;
  public computeUnits: number;

  constructor(
    provider: AnchorProvider,
    programId?: PublicKey,
    computeUnits?: number
  ) {
    this.programId = programId ?? PROGRAM_ID;
    this.computeUnits = computeUnits ?? DEFAULT_COMPUTE_UNITS;
    this.program = new Program(SvaultIDL as Svault, provider);
  }

  /* PDA Helpers */

  deriveStakingConfigPDA(tokenMint: PublicKey): [PublicKey, number] {
    return deriveStakingConfigPDA(tokenMint, this.programId);
  }

  deriveUserStakePDA(
    stakingConfig: PublicKey,
    user: PublicKey
  ): [PublicKey, number] {
    return deriveUserStakePDA(stakingConfig, user, this.programId);
  }

  deriveDelegatePDA(
    stakingConfig: PublicKey,
    delegate: PublicKey
  ): [PublicKey, number] {
    return deriveDelegatePDA(stakingConfig, delegate, this.programId);
  }

  deriveStakeVaultPDA(stakingConfig: PublicKey): [PublicKey, number] {
    return deriveStakeVaultPDA(stakingConfig, this.programId);
  }

  deriveRewardVaultPDA(stakingConfig: PublicKey): [PublicKey, number] {
    return deriveRewardVaultPDA(stakingConfig, this.programId);
  }

  /* State Fetching */

  async fetchStakingConfig(pda: PublicKey): Promise<StakingConfigAccount> {
    return fetchStakingConfigAccount(this.program, pda);
  }

  async fetchUserStake(pda: PublicKey): Promise<UserStakeAccount> {
    return fetchUserStakeAccount(this.program, pda);
  }

  async fetchDelegate(pda: PublicKey): Promise<DelegateAccount> {
    return fetchDelegateAccount(this.program, pda);
  }

  /**
   * Convenience method: Derive staking config PDA from mint, then fetch user stake.
   */
  async fetchUserStakeByMint(
    tokenMint: PublicKey,
    user: PublicKey
  ): Promise<UserStakeAccount> {
    const [configPda] = this.deriveStakingConfigPDA(tokenMint);
    const [userStakePda] = this.deriveUserStakePDA(configPda, user);
    return this.fetchUserStake(userStakePda);
  }

  /**
   * Convenience method: Derive staking config PDA from mint, then fetch config.
   */
  async fetchStakingConfigByMint(
    tokenMint: PublicKey
  ): Promise<StakingConfigAccount> {
    const [configPda] = this.deriveStakingConfigPDA(tokenMint);
    return this.fetchStakingConfig(configPda);
  }

  /* Instruction Builders */

  initializeStakingVault(
    admin: PublicKey,
    tokenMint: PublicKey,
    unstakingPeriod: BN | number,
    volumeWindow: BN | number,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = initializeStakingVault(
      this.program,
      admin,
      tokenMint,
      unstakingPeriod,
      volumeWindow
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    const [configPda] = this.deriveStakingConfigPDA(tokenMint);
    return { builder, configPda };
  }

  stake(
    user: PublicKey,
    tokenMint: PublicKey,
    amount: BN | number,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = stake(this.program, user, tokenMint, amount);

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  initiateUnstake(
    user: PublicKey,
    tokenMint: PublicKey,
    amount: BN | number,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = initiateUnstake(this.program, user, tokenMint, amount);

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  withdraw(user: PublicKey, tokenMint: PublicKey, options?: SVaultTxOptions) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = withdraw(this.program, user, tokenMint);

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  postRewards(
    admin: PublicKey,
    tokenMint: PublicKey,
    merkleRoot: number[],
    totalAmount: BN | number,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = postRewards(
      this.program,
      admin,
      tokenMint,
      merkleRoot,
      totalAmount
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  claimRewards(
    user: PublicKey,
    tokenMint: PublicKey,
    cumulativeAmount: BN | number,
    proof: number[][],
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = claimRewards(
      this.program,
      user,
      tokenMint,
      cumulativeAmount,
      proof
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  setConfig(
    admin: PublicKey,
    tokenMint: PublicKey,
    params: { unstakingPeriod?: BN | number; volumeWindow?: BN | number },
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = setConfig(
      this.program,
      admin,
      tokenMint,
      params.unstakingPeriod ?? null,
      params.volumeWindow ?? null
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  slash(
    admin: PublicKey,
    tokenMint: PublicKey,
    userToSlash: PublicKey,
    basisPoints: number,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    // Derive user stake PDA from user pubkey
    const [configPda] = this.deriveStakingConfigPDA(tokenMint);
    const [userStakePda] = this.deriveUserStakePDA(configPda, userToSlash);

    let builder = slash(
      this.program,
      admin,
      tokenMint,
      userStakePda,
      basisPoints
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  addDelegate(
    staker: PublicKey,
    delegateWallet: PublicKey,
    tokenMint: PublicKey,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = addDelegate(
      this.program,
      staker,
      delegateWallet,
      tokenMint
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }

  removeDelegate(
    staker: PublicKey,
    delegateWallet: PublicKey,
    tokenMint: PublicKey,
    options?: SVaultTxOptions
  ) {
    const { includeCuBudget = true, computeUnits } = options ?? {};

    let builder = removeDelegate(
      this.program,
      staker,
      delegateWallet,
      tokenMint
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    return builder;
  }
}
