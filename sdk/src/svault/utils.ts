/*
 * Utility functions for the SVault program.
 * PDA derivation, state parsing, and account fetching.
 */

import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  STAKING_CONFIG_SEED,
  USER_STAKE_SEED,
  STAKE_VAULT_SEED,
  REWARD_VAULT_SEED,
  PROGRAM_ID,
  SECONDS_PER_DAY,
} from "./constants";
import { Svault, StakingConfigAccount, UserStakeAccount, DelegateAccount } from "./types";

/* PDA Derivation */

export function deriveStakingConfigPDA(
  tokenMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STAKING_CONFIG_SEED, tokenMint.toBuffer()],
    programId
  );
}

export function deriveUserStakePDA(
  stakingConfig: PublicKey,
  user: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [USER_STAKE_SEED, stakingConfig.toBuffer(), user.toBuffer()],
    programId
  );
}

export function deriveDelegatePDA(
  stakingConfig: PublicKey,
  delegate: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  // Uses USER_STAKE_SEED to prevent delegate from also being a staker
  return PublicKey.findProgramAddressSync(
    [USER_STAKE_SEED, stakingConfig.toBuffer(), delegate.toBuffer()],
    programId
  );
}

export function deriveStakeVaultPDA(
  stakingConfig: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STAKE_VAULT_SEED, stakingConfig.toBuffer()],
    programId
  );
}

export function deriveRewardVaultPDA(
  stakingConfig: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REWARD_VAULT_SEED, stakingConfig.toBuffer()],
    programId
  );
}

/* Fetchers */

export async function fetchStakingConfigAccount(
  program: Program<Svault>,
  pda: PublicKey
): Promise<StakingConfigAccount> {
  return program.account.stakingConfig.fetch(pda);
}

export async function fetchUserStakeAccount(
  program: Program<Svault>,
  pda: PublicKey
): Promise<UserStakeAccount> {
  return program.account.userStake.fetch(pda);
}

export async function fetchDelegateAccount(
  program: Program<Svault>,
  pda: PublicKey
): Promise<DelegateAccount> {
  return program.account.delegate.fetch(pda);
}

/* Helpers */

/**
 * Compute when withdrawal will be available based on unstake initiation time.
 * @param unstakeInitiatedAt Unix timestamp when unstake was initiated (seconds)
 * @param unstakingPeriodDays Number of days in unstaking period
 * @returns Date when withdrawal becomes available
 */
export function computeWithdrawAvailableAt(
  unstakeInitiatedAt: number,
  unstakingPeriodDays: number
): Date {
  const availableAtSeconds = unstakeInitiatedAt + unstakingPeriodDays * SECONDS_PER_DAY;
  return new Date(availableAtSeconds * 1000);
}

/**
 * Check if withdrawal is currently available.
 * @param unstakeInitiatedAt Unix timestamp when unstake was initiated (seconds)
 * @param unstakingPeriodDays Number of days in unstaking period
 * @returns true if unstaking period has elapsed
 */
export function isWithdrawAvailable(
  unstakeInitiatedAt: number,
  unstakingPeriodDays: number
): boolean {
  if (unstakeInitiatedAt === 0) return false;
  const now = Math.floor(Date.now() / 1000);
  const availableAt = unstakeInitiatedAt + unstakingPeriodDays * SECONDS_PER_DAY;
  return now >= availableAt;
}

/**
 * Compute the time remaining until withdrawal is available.
 * @param unstakeInitiatedAt Unix timestamp when unstake was initiated (seconds)
 * @param unstakingPeriodDays Number of days in unstaking period
 * @returns Seconds remaining, or 0 if already available
 */
export function getTimeUntilWithdraw(
  unstakeInitiatedAt: number,
  unstakingPeriodDays: number
): number {
  if (unstakeInitiatedAt === 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  const availableAt = unstakeInitiatedAt + unstakingPeriodDays * SECONDS_PER_DAY;
  return Math.max(0, availableAt - now);
}
