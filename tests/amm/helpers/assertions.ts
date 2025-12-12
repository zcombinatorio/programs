import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";

import { AMMClient, PoolState, parsePoolState } from "../../../sdk/src";

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
 * Assert pool is in expected state
 */
export async function expectPoolState(
  client: AMMClient,
  poolPda: PublicKey,
  expectedState: PoolState
): Promise<void> {
  const pool = await client.fetchPool(poolPda);
  const parsedState = parsePoolState(pool.state);
  expect(parsedState).to.equal(
    expectedState,
    `Expected pool state "${expectedState}" but got "${parsedState}"`
  );
}

/**
 * Assert pool reserves match expected values
 */
export async function expectReserves(
  client: AMMClient,
  poolPda: PublicKey,
  expectedA: number | BN,
  expectedB: number | BN
): Promise<void> {
  const { reserveA, reserveB } = await client.fetchReserves(poolPda);
  const expA = typeof expectedA === "number" ? new BN(expectedA) : expectedA;
  const expB = typeof expectedB === "number" ? new BN(expectedB) : expectedB;

  expect(reserveA.toString()).to.equal(
    expA.toString(),
    `Expected reserve A ${expA.toString()} but got ${reserveA.toString()}`
  );
  expect(reserveB.toString()).to.equal(
    expB.toString(),
    `Expected reserve B ${expB.toString()} but got ${reserveB.toString()}`
  );
}

/**
 * Assert fee vault balance
 */
export async function expectFeeVaultBalance(
  client: AMMClient,
  poolPda: PublicKey,
  expectedBalance: number | BN
): Promise<void> {
  const [feeVault] = client.deriveFeeVaultPDA(poolPda);
  const connection = client.program.provider.connection;
  const account = await getAccount(connection, feeVault);
  const balance = new BN(account.amount.toString());
  const expected =
    typeof expectedBalance === "number"
      ? new BN(expectedBalance)
      : expectedBalance;

  expect(balance.toString()).to.equal(
    expected.toString(),
    `Expected fee vault balance ${expected.toString()} but got ${balance.toString()}`
  );
}

/**
 * Assert that constant product invariant is maintained (k = reserveA * reserveB)
 */
export async function expectInvariantMaintained(
  client: AMMClient,
  poolPda: PublicKey,
  previousK: BN
): Promise<void> {
  const { reserveA, reserveB } = await client.fetchReserves(poolPda);
  const currentK = reserveA.mul(reserveB);

  // Current k should be >= previous k (fees increase k)
  expect(currentK.gte(previousK)).to.be.true;
}

/**
 * Get the current invariant k = reserveA * reserveB
 */
export async function getInvariant(
  client: AMMClient,
  poolPda: PublicKey
): Promise<BN> {
  const { reserveA, reserveB } = await client.fetchReserves(poolPda);
  return reserveA.mul(reserveB);
}

/**
 * Assert pool has expected fee
 */
export async function expectPoolFee(
  client: AMMClient,
  poolPda: PublicKey,
  expectedFee: number
): Promise<void> {
  const pool = await client.fetchPool(poolPda);
  expect(pool.fee).to.equal(
    expectedFee,
    `Expected fee ${expectedFee} but got ${pool.fee}`
  );
}

/**
 * Assert pool has expected liquidity provider
 */
export async function expectLiquidityProvider(
  client: AMMClient,
  poolPda: PublicKey,
  expectedProvider: PublicKey
): Promise<void> {
  const pool = await client.fetchPool(poolPda);
  expect(pool.liquidityProvider.toString()).to.equal(
    expectedProvider.toString(),
    `Expected liquidity provider ${expectedProvider.toString()} but got ${pool.liquidityProvider.toString()}`
  );
}

/**
 * Assert pool has expected admin
 */
export async function expectPoolAdmin(
  client: AMMClient,
  poolPda: PublicKey,
  expectedAdmin: PublicKey
): Promise<void> {
  const pool = await client.fetchPool(poolPda);
  expect(pool.admin.toString()).to.equal(
    expectedAdmin.toString(),
    `Expected admin ${expectedAdmin.toString()} but got ${pool.admin.toString()}`
  );
}

/**
 * Assert token account balance
 */
export async function expectTokenBalance(
  client: AMMClient,
  tokenAccount: PublicKey,
  expectedBalance: number | BN
): Promise<void> {
  const connection = client.program.provider.connection;
  const account = await getAccount(connection, tokenAccount);
  const balance = new BN(account.amount.toString());
  const expected =
    typeof expectedBalance === "number"
      ? new BN(expectedBalance)
      : expectedBalance;

  expect(balance.toString()).to.equal(
    expected.toString(),
    `Expected token balance ${expected.toString()} but got ${balance.toString()}`
  );
}
