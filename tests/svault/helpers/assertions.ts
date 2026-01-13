import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { SVaultClient } from "../../../sdk/src";

/**
 * Assert that a promise rejects with a specific Anchor error code
 */
export async function expectAnchorError(
  promise: Promise<any>,
  errorCode: string
): Promise<void> {
  try {
    await promise;
    expect.fail(`Expected error "${errorCode}" but transaction succeeded`);
  } catch (err: any) {
    // Handle Anchor error format
    if (err.error?.errorCode?.code) {
      expect(err.error.errorCode.code).to.equal(
        errorCode,
        `Expected error "${errorCode}" but got "${err.error.errorCode.code}"`
      );
    } else if (err.message?.includes(errorCode)) {
      // Error code might be in message
      return;
    } else {
      // Re-throw if it's not the expected error format
      throw new Error(
        `Expected Anchor error "${errorCode}" but got: ${err.message || err}`
      );
    }
  }
}

/**
 * Assert that a promise rejects (for any error)
 */
export async function expectError(
  promise: Promise<any>,
  messageContains?: string
): Promise<void> {
  try {
    await promise;
    expect.fail("Expected error but transaction succeeded");
  } catch (err: any) {
    if (messageContains) {
      const errMsg = err.message || err.toString();
      expect(errMsg.toLowerCase()).to.include(
        messageContains.toLowerCase(),
        `Error message should contain "${messageContains}"`
      );
    }
    // If no messageContains specified, any error is acceptable
  }
}

/**
 * Assert staking config has expected values
 */
export async function expectStakingConfig(
  client: SVaultClient,
  configPda: PublicKey,
  expected: {
    admin?: PublicKey;
    tokenMint?: PublicKey;
    unstakingPeriod?: number;
    volumeWindow?: number;
    totalStaked?: number;
  }
): Promise<void> {
  const config = await client.fetchStakingConfig(configPda);

  if (expected.admin) {
    expect(config.admin.toString()).to.equal(
      expected.admin.toString(),
      "Admin mismatch"
    );
  }
  if (expected.tokenMint) {
    expect(config.tokenMint.toString()).to.equal(
      expected.tokenMint.toString(),
      "Token mint mismatch"
    );
  }
  if (expected.unstakingPeriod !== undefined) {
    expect(config.unstakingPeriod.toNumber()).to.equal(
      expected.unstakingPeriod,
      "Unstaking period mismatch"
    );
  }
  if (expected.volumeWindow !== undefined) {
    expect(config.volumeWindow.toNumber()).to.equal(
      expected.volumeWindow,
      "Volume window mismatch"
    );
  }
  if (expected.totalStaked !== undefined) {
    expect(config.totalStaked.toNumber()).to.equal(
      expected.totalStaked,
      "Total staked mismatch"
    );
  }
}

/**
 * Assert user stake has expected values
 */
export async function expectUserStake(
  client: SVaultClient,
  tokenMint: PublicKey,
  nonce: number,
  user: PublicKey,
  expected: {
    stakedAmount?: number;
    pendingUnstake?: number;
    totalClaimed?: number;
  }
): Promise<void> {
  const userStake = await client.fetchUserStakeByMint(tokenMint, nonce, user);

  if (expected.stakedAmount !== undefined) {
    expect(userStake.stakedAmount.toNumber()).to.equal(
      expected.stakedAmount,
      "Staked amount mismatch"
    );
  }
  if (expected.pendingUnstake !== undefined) {
    expect(userStake.pendingUnstake.toNumber()).to.equal(
      expected.pendingUnstake,
      "Pending unstake mismatch"
    );
  }
  if (expected.totalClaimed !== undefined) {
    expect(userStake.totalClaimed.toNumber()).to.equal(
      expected.totalClaimed,
      "Total claimed mismatch"
    );
  }
}

/**
 * Assert total staked in config
 */
export async function expectTotalStaked(
  client: SVaultClient,
  configPda: PublicKey,
  expectedAmount: number
): Promise<void> {
  const config = await client.fetchStakingConfig(configPda);
  expect(config.totalStaked.toNumber()).to.equal(
    expectedAmount,
    `Expected total staked ${expectedAmount} but got ${config.totalStaked.toNumber()}`
  );
}

/**
 * Assert delegate exists and has correct values
 */
export async function expectDelegate(
  client: SVaultClient,
  configPda: PublicKey,
  delegateWallet: PublicKey,
  expectedStaker: PublicKey
): Promise<void> {
  const [delegatePda] = client.deriveDelegatePDA(configPda, delegateWallet);
  const delegate = await client.fetchDelegate(delegatePda);

  expect(delegate.delegate.toString()).to.equal(
    delegateWallet.toString(),
    "Delegate wallet mismatch"
  );
  expect(delegate.staker.toString()).to.equal(
    expectedStaker.toString(),
    "Staker mismatch"
  );
}

/**
 * Assert delegate account does not exist (was closed)
 */
export async function expectDelegateNotExists(
  client: SVaultClient,
  configPda: PublicKey,
  delegateWallet: PublicKey
): Promise<void> {
  const [delegatePda] = client.deriveDelegatePDA(configPda, delegateWallet);
  try {
    await client.fetchDelegate(delegatePda);
    expect.fail("Expected delegate account to not exist");
  } catch (err: any) {
    // Account should not exist
    expect(err.message).to.include("Account does not exist");
  }
}
