import { PublicKey } from "@solana/web3.js";

import {
  INITIAL_LIQUIDITY,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createModerator,
  createProposalInSetupState,
  createProposalInPendingState,
  createProposalInResolvedState,
  expectAnchorError,
  expectError,
  ModeratorTestContext,
} from "../helpers";

describe("Futarchy - State Errors", () => {
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

  describe("Setup State Constraints", () => {
    it("cannot finalize proposal in Setup state", async () => {
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx
      );

      const { builder } = await client.finalizeProposal(
        wallet.publicKey,
        ctx.proposalPda
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("cannot redeem liquidity in Setup state", async () => {
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx
      );

      // SDK should reject redemption before finalization
      await expectError(
        client.redeemLiquidity(wallet.publicKey, ctx.proposalPda),
        "not finalized"
      );
    });
  });

  describe("Pending State Constraints", () => {
    it("cannot add option after launch", async () => {
      const ctx = await createProposalInPendingState(
        client,
        wallet,
        moderatorCtx
      );

      const { builder } = await client.addOption(
        wallet.publicKey,
        ctx.proposalPda
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("cannot launch already-launched proposal", async () => {
      const ctx = await createProposalInPendingState(
        client,
        wallet,
        moderatorCtx
      );

      const { builder } = await client.launchProposal(
        wallet.publicKey,
        ctx.proposalPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("cannot finalize before expiration", async () => {
      // Create with long length so it won't expire
      const ctx = await createProposalInPendingState(
        client,
        wallet,
        moderatorCtx,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY,
        { length: 3600 } // 1 hour
      );

      const { builder } = await client.finalizeProposal(
        wallet.publicKey,
        ctx.proposalPda
      );

      await expectAnchorError(builder.rpc(), "ProposalNotExpired");
    });

    it("cannot redeem before finalization", async () => {
      const ctx = await createProposalInPendingState(
        client,
        wallet,
        moderatorCtx
      );

      // SDK should reject redemption before finalization
      await expectError(
        client.redeemLiquidity(wallet.publicKey, ctx.proposalPda),
        "not finalized"
      );
    });
  });

  describe("Resolved State Constraints", () => {
    it("cannot add option after finalization", async () => {
      const ctx = await createProposalInResolvedState(
        client,
        wallet,
        moderatorCtx
      );

      const { builder } = await client.addOption(
        wallet.publicKey,
        ctx.proposalPda
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("cannot launch after finalization", async () => {
      const ctx = await createProposalInResolvedState(
        client,
        wallet,
        moderatorCtx
      );

      const { builder } = await client.launchProposal(
        wallet.publicKey,
        ctx.proposalPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("cannot finalize already-finalized proposal", async () => {
      const ctx = await createProposalInResolvedState(
        client,
        wallet,
        moderatorCtx
      );

      const { builder } = await client.finalizeProposal(
        wallet.publicKey,
        ctx.proposalPda
      );

      await expectAnchorError(builder.rpc(), "InvalidState");
    });
  });
});
