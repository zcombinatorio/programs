import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import { FutarchyClient, ProposalState, parseProposalState } from "../../../sdk/src";

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
 * Assert proposal is in expected state
 */
export async function expectProposalState(
  client: FutarchyClient,
  proposalPda: PublicKey,
  expectedState: ProposalState
): Promise<void> {
  const proposal = await client.fetchProposal(proposalPda);
  const { state: parsedState } = parseProposalState(proposal.state);
  expect(parsedState).to.equal(
    expectedState,
    `Expected proposal state "${expectedState}" but got "${parsedState}"`
  );
}

/**
 * Assert proposal has expected number of options
 */
export async function expectNumOptions(
  client: FutarchyClient,
  proposalPda: PublicKey,
  expectedCount: number
): Promise<void> {
  const proposal = await client.fetchProposal(proposalPda);
  expect(proposal.numOptions).to.equal(
    expectedCount,
    `Expected ${expectedCount} options but got ${proposal.numOptions}`
  );
}

/**
 * Assert winning option index after finalization
 */
export async function expectWinningOption(
  client: FutarchyClient,
  proposalPda: PublicKey,
  expectedIdx: number
): Promise<void> {
  const proposal = await client.fetchProposal(proposalPda);
  const { winningIdx } = parseProposalState(proposal.state);
  expect(winningIdx).to.equal(
    expectedIdx,
    `Expected winning index ${expectedIdx} but got ${winningIdx}`
  );
}

/**
 * Assert moderator exists and has correct properties
 */
export async function expectModeratorExists(
  client: FutarchyClient,
  moderatorPda: PublicKey,
  expectedBaseMint?: PublicKey,
  expectedQuoteMint?: PublicKey
): Promise<void> {
  const moderator = await client.fetchModerator(moderatorPda);
  expect(moderator).to.not.be.null;

  if (expectedBaseMint) {
    expect(moderator.baseMint.toBase58()).to.equal(
      expectedBaseMint.toBase58(),
      "Base mint mismatch"
    );
  }

  if (expectedQuoteMint) {
    expect(moderator.quoteMint.toBase58()).to.equal(
      expectedQuoteMint.toBase58(),
      "Quote mint mismatch"
    );
  }
}

/**
 * Get current moderator count from global config
 */
export async function getModeratorCount(client: FutarchyClient): Promise<number> {
  try {
    const config = await client.fetchGlobalConfig();
    return config.moderatorIdCounter;
  } catch {
    return 0; // Global config doesn't exist yet
  }
}

/**
 * Assert global config has expected moderator count
 */
export async function expectModeratorCount(
  client: FutarchyClient,
  expectedCount: number
): Promise<void> {
  const config = await client.fetchGlobalConfig();
  expect(config.moderatorIdCounter).to.equal(
    expectedCount,
    `Expected moderator count ${expectedCount} but got ${config.moderatorIdCounter}`
  );
}

/**
 * Assert proposal counter for a moderator
 */
export async function expectProposalCount(
  client: FutarchyClient,
  moderatorPda: PublicKey,
  expectedCount: number
): Promise<void> {
  const moderator = await client.fetchModerator(moderatorPda);
  expect(moderator.proposalIdCounter).to.equal(
    expectedCount,
    `Expected proposal count ${expectedCount} but got ${moderator.proposalIdCounter}`
  );
}

/**
 * Assert proposal is expired
 */
export async function expectProposalExpired(
  client: FutarchyClient,
  proposalPda: PublicKey,
  shouldBeExpired: boolean = true
): Promise<void> {
  const proposal = await client.fetchProposal(proposalPda);
  const isExpired = client.isProposalExpired(proposal);
  expect(isExpired).to.equal(
    shouldBeExpired,
    shouldBeExpired
      ? "Expected proposal to be expired"
      : "Expected proposal to NOT be expired"
  );
}
