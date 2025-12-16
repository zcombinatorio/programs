import { PublicKey } from "@solana/web3.js";

import {
  INITIAL_LIQUIDITY,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createFundedUser,
  createUserClient,
  createModerator,
  createProposalInSetupState,
  expectAnchorError,
  expectError,
  ModeratorTestContext,
  FundedUser,
} from "../helpers";

describe("Futarchy - Authorization Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let moderatorCtx: ModeratorTestContext;
  let nonOwner: FundedUser;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);

    moderatorCtx = await createModerator(client, wallet, {
      baseMint,
      quoteMint,
    });

    // Create a non-owner user
    nonOwner = await createFundedUser(provider, wallet, baseMint, quoteMint);
  });

  describe("Proposal Operations", () => {
    it("non-creator cannot add options", async () => {
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx
      );

      // Create client for non-owner
      const nonOwnerClient = createUserClient(provider, nonOwner.keypair);

      const { builder } = await nonOwnerClient.addOption(
        nonOwner.keypair.publicKey,
        ctx.proposalPda
      );

      await expectError(builder.rpc());
    });

    it("non-creator cannot launch proposal", async () => {
      const ctx = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx
      );

      // Create client for non-owner
      const nonOwnerClient = createUserClient(provider, nonOwner.keypair);

      const { builder } = await nonOwnerClient.launchProposal(
        nonOwner.keypair.publicKey,
        ctx.proposalPda,
        INITIAL_LIQUIDITY,
        INITIAL_LIQUIDITY
      );

      await expectError(builder.rpc());
    });
  });

  describe("Moderator Operations", () => {
    it("anyone can create a moderator", async () => {
      // Create a new user who will create their own moderator
      const newUser = await createFundedUser(provider, wallet, baseMint, quoteMint);
      const newUserClient = createUserClient(provider, newUser.keypair);

      // Create new mints for the new user
      const newBaseMint = await createTestMint(provider, wallet);
      const newQuoteMint = await createTestMint(provider, wallet);

      // This should succeed - anyone can create moderators
      const { builder } = await newUserClient.initializeModerator(
        newUser.keypair.publicKey,
        newBaseMint,
        newQuoteMint
      );

      await builder.rpc();
    });
  });
});
