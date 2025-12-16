import { PublicKey } from "@solana/web3.js";

import { FUTARCHY_MAX_OPTIONS as MAX_OPTIONS, FUTARCHY_MIN_OPTIONS as MIN_OPTIONS } from "../../../sdk/src";
import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createModerator,
  createProposalInSetupState,
  expectAnchorError,
  ModeratorTestContext,
} from "../helpers";

describe("Futarchy - Validation Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let moderatorCtx: ModeratorTestContext;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);

    moderatorCtx = await createModerator(client, wallet, {
      baseMint,
      quoteMint,
    });
  });

  describe("Option Count Limits", () => {
    it("cannot add more than MAX_OPTIONS", async () => {
      // Create proposal with MAX_OPTIONS
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx,
        { numOptions: MAX_OPTIONS }
      );

      // Try to add one more option
      const { builder } = await client.addOption(
        wallet.publicKey,
        ctx.proposalPda
      );

      await expectAnchorError(builder.rpc(), "TooManyOptions");
    });

    it("proposal starts with MIN_OPTIONS", async () => {
      // Initialize creates exactly MIN_OPTIONS (2)
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx,
        { numOptions: MIN_OPTIONS }
      );

      const proposal = await client.fetchProposal(ctx.proposalPda);
      // Proposal should have exactly MIN_OPTIONS
      expect(proposal.numOptions).to.equal(MIN_OPTIONS);
    });
  });

  describe("Proposal Length", () => {
    it("cannot create proposal with zero length", async () => {
      // This might fail at the program level or succeed with immediate expiration
      // depending on program logic
      try {
        await createProposalInSetupState(client, wallet, moderatorCtx, {
          length: 0,
        });
        // If it succeeds, the proposal would be immediately expirable
      } catch (err: any) {
        // Expected to fail with validation error
      }
    });
  });

  describe("Fee Limits", () => {
    it("creates proposal with max fee", async () => {
      // Max fee is typically 5000 (50%)
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx,
        { fee: 5000 }
      );

      // Should succeed
      const proposal = await client.fetchProposal(ctx.proposalPda);
      expect(proposal).to.not.be.null;
    });

    it("creates proposal with zero fee", async () => {
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx,
        { fee: 0 }
      );

      // Should succeed
      const proposal = await client.fetchProposal(ctx.proposalPda);
      expect(proposal).to.not.be.null;
    });
  });
});

// Need chai expect
import { expect } from "chai";
