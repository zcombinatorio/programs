import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { LendingClient } from "../../../sdk/src";
import { getTokenBalance } from "./setup";
import * as anchor from "@coral-xyz/anchor";

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
    if (err.error?.errorCode?.code) {
      expect(err.error.errorCode.code).to.equal(
        errorCode,
        `Expected error "${errorCode}" but got "${err.error.errorCode.code}"`
      );
    } else if (err.message?.includes(errorCode)) {
      return;
    } else {
      throw new Error(
        `Expected Anchor error "${errorCode}" but got: ${err.message || err}`
      );
    }
  }
}

/**
 * Assert that a promise rejects
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
  }
}

/**
 * Assert vault state matches expectations
 */
export async function expectVaultState(
  client: LendingClient,
  vaultPda: PublicKey,
  expected: {
    totalLiquidity?: BN | number;
    totalBorrowed?: BN | number;
    openPositions?: number;
  }
): Promise<void> {
  const vault = await client.fetchVault(vaultPda);

  if (expected.totalLiquidity !== undefined) {
    const exp =
      typeof expected.totalLiquidity === "number"
        ? new BN(expected.totalLiquidity)
        : expected.totalLiquidity;
    expect(vault.totalBaseLiquidity.toString()).to.equal(
      exp.toString(),
      "Total liquidity mismatch"
    );
  }

  if (expected.totalBorrowed !== undefined) {
    const exp =
      typeof expected.totalBorrowed === "number"
        ? new BN(expected.totalBorrowed)
        : expected.totalBorrowed;
    expect(vault.totalBaseBorrowed.toString()).to.equal(
      exp.toString(),
      "Total borrowed mismatch"
    );
  }

  if (expected.openPositions !== undefined) {
    expect(vault.openPositions).to.equal(
      expected.openPositions,
      "Open positions count mismatch"
    );
  }
}

/**
 * Assert position state matches expectations
 */
export async function expectPositionState(
  client: LendingClient,
  positionPda: PublicKey,
  expected: {
    collateralAmount?: BN | number;
    borrowedAmount?: BN | number;
    isActive?: boolean;
  }
): Promise<void> {
  const position = await client.fetchPosition(positionPda);

  if (expected.collateralAmount !== undefined) {
    const exp =
      typeof expected.collateralAmount === "number"
        ? new BN(expected.collateralAmount)
        : expected.collateralAmount;
    expect(position.collateralAmount.toString()).to.equal(
      exp.toString(),
      "Collateral amount mismatch"
    );
  }

  if (expected.borrowedAmount !== undefined) {
    const exp =
      typeof expected.borrowedAmount === "number"
        ? new BN(expected.borrowedAmount)
        : expected.borrowedAmount;
    expect(position.borrowedAmount.toString()).to.equal(
      exp.toString(),
      "Borrowed amount mismatch"
    );
  }

  if (expected.isActive !== undefined) {
    expect(position.isActive).to.equal(expected.isActive, "Active state mismatch");
  }
}

/**
 * Assert position was closed (account doesn't exist)
 */
export async function expectPositionClosed(
  client: LendingClient,
  positionPda: PublicKey
): Promise<void> {
  const position = await client.fetchPositionOrNull(positionPda);
  expect(position).to.be.null;
}

/**
 * Assert token balance equals expected value
 */
export async function expectTokenBalance(
  provider: anchor.AnchorProvider,
  tokenAccount: PublicKey,
  expected: BN | number
): Promise<void> {
  const balance = await getTokenBalance(provider, tokenAccount);
  const exp = typeof expected === "number" ? new BN(expected) : expected;
  expect(balance.toString()).to.equal(exp.toString(), "Token balance mismatch");
}

/**
 * Assert token balance is approximately expected (within tolerance)
 */
export async function expectTokenBalanceApprox(
  provider: anchor.AnchorProvider,
  tokenAccount: PublicKey,
  expected: BN | number,
  toleranceBps: number = 100 // 1% default tolerance
): Promise<void> {
  const balance = await getTokenBalance(provider, tokenAccount);
  const exp = typeof expected === "number" ? new BN(expected) : expected;

  const tolerance = exp.mul(new BN(toleranceBps)).div(new BN(10000));
  const min = exp.sub(tolerance);
  const max = exp.add(tolerance);

  expect(balance.gte(min)).to.be.true;
  expect(balance.lte(max)).to.be.true;
}
