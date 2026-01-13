/*
 * Low-level instruction builders for the SVault program.
 * These are thin wrappers around the program methods - use SVaultClient for higher-level operations.
 */

import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Svault } from "./types";
import {
  deriveStakingConfigPDA,
  deriveUserStakePDA,
  deriveStakeVaultPDA,
  deriveRewardVaultPDA,
  deriveDelegatePDA,
} from "./utils";

/* Fee Authority (same as AMM program) */
export const FEE_AUTHORITY = new PublicKey("FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC");

export function initializeStakingVault(
  program: Program<Svault>,
  admin: PublicKey,
  tokenMint: PublicKey,
  unstakingPeriod: BN | number,
  volumeWindow: BN | number,
  nonce: number
) {
  const unstakingPeriodBN = typeof unstakingPeriod === "number" ? new BN(unstakingPeriod) : unstakingPeriod;
  const volumeWindowBN = typeof volumeWindow === "number" ? new BN(volumeWindow) : volumeWindow;

  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [stakeVault] = deriveStakeVaultPDA(configPda, program.programId);
  const [rewardVault] = deriveRewardVaultPDA(configPda, program.programId);

  return program.methods
    .initializeStakingVault(unstakingPeriodBN, volumeWindowBN, nonce)
    .accountsPartial({
      admin,
      tokenMint,
      config: configPda,
      stakeVault,
      rewardVault,
    });
}

export function stake(
  program: Program<Svault>,
  user: PublicKey,
  tokenMint: PublicKey,
  nonce: number,
  amount: BN | number
) {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;

  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [userStakePda] = deriveUserStakePDA(configPda, user, program.programId);
  const [stakeVault] = deriveStakeVaultPDA(configPda, program.programId);
  const userTokenAccount = getAssociatedTokenAddressSync(tokenMint, user);

  return program.methods.stake(amountBN).accountsPartial({
    user,
    tokenMint,
    config: configPda,
    userStake: userStakePda,
    stakeVault,
    userTokenAccount,
  });
}

export function initiateUnstake(
  program: Program<Svault>,
  user: PublicKey,
  tokenMint: PublicKey,
  nonce: number,
  amount: BN | number
) {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;

  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [userStakePda] = deriveUserStakePDA(configPda, user, program.programId);

  return program.methods.initiateUnstake(amountBN).accountsPartial({
    user,
    tokenMint,
    config: configPda,
    userStake: userStakePda,
  });
}

export function withdraw(
  program: Program<Svault>,
  user: PublicKey,
  tokenMint: PublicKey,
  nonce: number
) {
  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [userStakePda] = deriveUserStakePDA(configPda, user, program.programId);
  const [stakeVault] = deriveStakeVaultPDA(configPda, program.programId);
  const userTokenAccount = getAssociatedTokenAddressSync(tokenMint, user);

  return program.methods.withdraw().accountsPartial({
    user,
    tokenMint,
    config: configPda,
    userStake: userStakePda,
    stakeVault,
    userTokenAccount,
  });
}

export function postRewards(
  program: Program<Svault>,
  admin: PublicKey,
  tokenMint: PublicKey,
  nonce: number,
  merkleRoot: number[],
  totalAmount: BN | number
) {
  const merkleRootArray = merkleRoot as number[];
  const totalAmountBN = typeof totalAmount === "number" ? new BN(totalAmount) : totalAmount;

  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [rewardVault] = deriveRewardVaultPDA(configPda, program.programId);
  const adminTokenAccount = getAssociatedTokenAddressSync(tokenMint, admin);

  return program.methods
    .postRewards(merkleRootArray, totalAmountBN)
    .accountsPartial({
      admin,
      tokenMint,
      config: configPda,
      rewardVault,
      adminTokenAccount,
    });
}

export function claimRewards(
  program: Program<Svault>,
  user: PublicKey,
  tokenMint: PublicKey,
  nonce: number,
  cumulativeAmount: BN | number,
  proof: number[][]
) {
  const cumulativeAmountBN = typeof cumulativeAmount === "number" ? new BN(cumulativeAmount) : cumulativeAmount;

  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [userStakePda] = deriveUserStakePDA(configPda, user, program.programId);
  const [rewardVault] = deriveRewardVaultPDA(configPda, program.programId);
  const userTokenAccount = getAssociatedTokenAddressSync(tokenMint, user);

  return program.methods
    .claimRewards(cumulativeAmountBN, proof)
    .accountsPartial({
      user,
      tokenMint,
      config: configPda,
      userStake: userStakePda,
      rewardVault,
      userTokenAccount,
    });
}

export function setConfig(
  program: Program<Svault>,
  admin: PublicKey,
  tokenMint: PublicKey,
  nonce: number,
  unstakingPeriod: BN | number | null,
  volumeWindow: BN | number | null
) {
  const unstakingPeriodArg = unstakingPeriod === null
    ? null
    : typeof unstakingPeriod === "number"
      ? new BN(unstakingPeriod)
      : unstakingPeriod;

  const volumeWindowArg = volumeWindow === null
    ? null
    : typeof volumeWindow === "number"
      ? new BN(volumeWindow)
      : volumeWindow;

  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);

  return program.methods
    .setConfig(unstakingPeriodArg, volumeWindowArg)
    .accountsPartial({
      admin,
      config: configPda,
    });
}

export function slash(
  program: Program<Svault>,
  admin: PublicKey,
  tokenMint: PublicKey,
  nonce: number,
  userStakePda: PublicKey,
  basisPoints: number
) {
  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [stakeVault] = deriveStakeVaultPDA(configPda, program.programId);
  const feeVault = getAssociatedTokenAddressSync(tokenMint, FEE_AUTHORITY);

  return program.methods.slash(basisPoints).accountsPartial({
    admin,
    tokenMint,
    config: configPda,
    userStake: userStakePda,
    stakeVault,
    feeVault,
  });
}

export function addDelegate(
  program: Program<Svault>,
  staker: PublicKey,
  delegateWallet: PublicKey,
  tokenMint: PublicKey,
  nonce: number
) {
  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [userStakePda] = deriveUserStakePDA(configPda, staker, program.programId);
  const [delegatePda] = deriveDelegatePDA(configPda, delegateWallet, program.programId);

  return program.methods.addDelegate().accountsPartial({
    staker,
    delegateWallet,
    config: configPda,
    userStake: userStakePda,
    delegate: delegatePda,
  });
}

export function removeDelegate(
  program: Program<Svault>,
  staker: PublicKey,
  delegateWallet: PublicKey,
  tokenMint: PublicKey,
  nonce: number
) {
  const [configPda] = deriveStakingConfigPDA(tokenMint, nonce, program.programId);
  const [delegatePda] = deriveDelegatePDA(configPda, delegateWallet, program.programId);

  return program.methods.removeDelegate().accountsPartial({
    staker,
    config: configPda,
    delegate: delegatePda,
  });
}
