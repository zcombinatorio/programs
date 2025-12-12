import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { VaultClient, VaultState, VaultType, parseVaultState } from "../../../sdk/src";

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
 * Assert vault is in expected state
 */
export async function expectVaultState(
  client: VaultClient,
  vaultPda: PublicKey,
  expectedState: VaultState
): Promise<void> {
  const vault = await client.fetchVault(vaultPda);
  const { state: parsedState } = parseVaultState(vault.state);
  expect(parsedState).to.equal(
    expectedState,
    `Expected vault state "${expectedState}" but got "${parsedState}"`
  );
}

/**
 * Assert vault has expected number of options
 */
export async function expectNumOptions(
  client: VaultClient,
  vaultPda: PublicKey,
  expectedCount: number
): Promise<void> {
  const vault = await client.fetchVault(vaultPda);
  expect(vault.numOptions).to.equal(
    expectedCount,
    `Expected ${expectedCount} options but got ${vault.numOptions}`
  );
}

/**
 * Assert user's conditional token balances
 */
export async function expectCondBalances(
  client: VaultClient,
  vaultPda: PublicKey,
  user: PublicKey,
  vaultType: VaultType,
  expectedBalances: number[]
): Promise<void> {
  const { condBalances } = await client.fetchUserBalances(vaultPda, user, vaultType);
  const actualBalances = condBalances.map((b: BN) => b.toNumber());
  expect(actualBalances).to.deep.equal(
    expectedBalances,
    `Conditional balances mismatch`
  );
}

/**
 * Assert vault's token balance
 */
export async function expectVaultBalance(
  client: VaultClient,
  vaultPda: PublicKey,
  vaultType: VaultType,
  expectedBalance: number
): Promise<void> {
  const balance = await client.fetchVaultBalance(vaultPda, vaultType);
  expect(balance.toNumber()).to.equal(
    expectedBalance,
    `Expected vault balance ${expectedBalance} but got ${balance.toNumber()}`
  );
}

/**
 * Assert winning index after finalization
 */
export async function expectWinningIndex(
  client: VaultClient,
  vaultPda: PublicKey,
  expectedIdx: number
): Promise<void> {
  const vault = await client.fetchVault(vaultPda);
  const { winningIdx } = parseVaultState(vault.state);
  expect(winningIdx).to.equal(
    expectedIdx,
    `Expected winning index ${expectedIdx} but got ${winningIdx}`
  );
}

/**
 * Verify all balances in one call
 */
export interface BalanceExpectation {
  user: PublicKey;
  condBalances: number[];
}

export async function expectAllBalances(
  client: VaultClient,
  vaultPda: PublicKey,
  vaultType: VaultType,
  expectations: BalanceExpectation[],
  expectedVaultBalance: number
): Promise<void> {
  // Check vault balance
  await expectVaultBalance(client, vaultPda, vaultType, expectedVaultBalance);

  // Check each user's conditional balances
  for (const exp of expectations) {
    await expectCondBalances(client, vaultPda, exp.user, vaultType, exp.condBalances);
  }
}
