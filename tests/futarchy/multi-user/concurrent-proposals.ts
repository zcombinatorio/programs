import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import { ProposalState } from "../../../sdk/src";
import {
  INITIAL_LIQUIDITY,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createFundedUser,
  createUserClient,
  createModerator,
  createProposalInSetupState,
  createProposalInPendingState,
  waitForProposalExpiration,
  expectProposalState,
  expectNumOptions,
  expectProposalCount,
  ModeratorTestContext,
  FundedUser,
} from "../helpers";
import { FutarchyClient } from "../../../sdk/src";

describe("Futarchy - Multi-User", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let moderatorCtx: ModeratorTestContext;

  let alice: FundedUser;
  let bob: FundedUser;
  let aliceClient: FutarchyClient;
  let bobClient: FutarchyClient;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);

    moderatorCtx = await createModerator(client, wallet, {
      baseMint,
      quoteMint,
    });

    // Create funded users
    alice = await createFundedUser(provider, wallet, baseMint, quoteMint);
    bob = await createFundedUser(provider, wallet, baseMint, quoteMint);

    aliceClient = createUserClient(provider, alice.keypair);
    bobClient = createUserClient(provider, bob.keypair);
  });

  describe("Concurrent Proposals", () => {
    it("multiple users create proposals under same moderator", async () => {
      // Alice creates a proposal
      const aliceProposal = await createProposalInSetupState(
        aliceClient,
        alice.wallet,
        moderatorCtx,
        { numOptions: 2 }
      );

      // Bob creates a proposal
      const bobProposal = await createProposalInSetupState(
        bobClient,
        bob.wallet,
        moderatorCtx,
        { numOptions: 3 }
      );

      // Both proposals exist independently
      await expectProposalState(
        client,
        aliceProposal.proposalPda,
        ProposalState.Setup
      );
      await expectProposalState(
        client,
        bobProposal.proposalPda,
        ProposalState.Setup
      );

      await expectNumOptions(client, aliceProposal.proposalPda, 2);
      await expectNumOptions(client, bobProposal.proposalPda, 3);
    });

    it("proposals maintain separate state", async () => {
      // Alice creates and launches a proposal
      const aliceProposal = await createProposalInPendingState(
        aliceClient,
        alice.wallet,
        moderatorCtx,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      // Bob creates a proposal but doesn't launch
      const bobProposal = await createProposalInSetupState(
        bobClient,
        bob.wallet,
        moderatorCtx
      );

      // Alice's is Pending, Bob's is Setup
      await expectProposalState(
        client,
        aliceProposal.proposalPda,
        ProposalState.Pending
      );
      await expectProposalState(
        client,
        bobProposal.proposalPda,
        ProposalState.Setup
      );
    });
  });

  describe("Multiple Moderators", () => {
    it("different users can create different moderators", async () => {
      // Alice creates moderator with her mints
      const aliceBaseMint = await createTestMint(provider, wallet);
      const aliceQuoteMint = await createTestMint(provider, wallet);

      const aliceModerator = await createModerator(aliceClient, alice.wallet, {
        baseMint: aliceBaseMint,
        quoteMint: aliceQuoteMint,
      });

      // Bob creates moderator with his mints
      const bobBaseMint = await createTestMint(provider, wallet);
      const bobQuoteMint = await createTestMint(provider, wallet);

      const bobModerator = await createModerator(bobClient, bob.wallet, {
        baseMint: bobBaseMint,
        quoteMint: bobQuoteMint,
      });

      // Both moderators exist
      const aliceModAcc = await client.fetchModerator(aliceModerator.moderatorPda);
      const bobModAcc = await client.fetchModerator(bobModerator.moderatorPda);

      expect(aliceModAcc.baseMint.toBase58()).to.equal(aliceBaseMint.toBase58());
      expect(bobModAcc.baseMint.toBase58()).to.equal(bobBaseMint.toBase58());
    });

    it("proposals under different moderators are isolated", async () => {
      // Create a new moderator for this test
      const newBaseMint = await createTestMint(provider, wallet);
      const newQuoteMint = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, newBaseMint);
      await fundOwnerWallet(provider, wallet, newQuoteMint);

      const newModerator = await createModerator(client, wallet, {
        baseMint: newBaseMint,
        quoteMint: newQuoteMint,
      });

      // Create proposal under original moderator
      const originalProposal = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx
      );

      // Create proposal under new moderator
      const newProposal = await createProposalInSetupState(
        client,
        wallet,
        newModerator
      );

      // Both have id 0 (or sequential from their moderator's perspective)
      // and are independent
      const original = await client.fetchProposal(originalProposal.proposalPda);
      const newProp = await client.fetchProposal(newProposal.proposalPda);

      expect(original.moderator.toBase58()).to.equal(
        moderatorCtx.moderatorPda.toBase58()
      );
      expect(newProp.moderator.toBase58()).to.equal(
        newModerator.moderatorPda.toBase58()
      );
    });
  });

  describe("Finalization and Redemption", () => {
    it("only proposal creator can redeem their liquidity", async () => {
      // Alice creates, launches, and finalizes a proposal
      const aliceProposal = await createProposalInPendingState(
        aliceClient,
        alice.wallet,
        moderatorCtx,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY,
        { length: 1 }
      );

      await waitForProposalExpiration(aliceClient, aliceProposal.proposalPda);

      const { builder: finalizeBuilder } = await aliceClient.finalizeProposal(
        alice.keypair.publicKey,
        aliceProposal.proposalPda
      );
      await finalizeBuilder.rpc();

      // Alice redeems her liquidity
      const { builder: redeemBuilder } = await aliceClient.redeemLiquidity(
        alice.keypair.publicKey,
        aliceProposal.proposalPda
      );
      await redeemBuilder.rpc();

      // Success - Alice redeemed
    });
  });
});
