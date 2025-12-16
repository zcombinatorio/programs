import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createModerator,
  expectModeratorExists,
  expectModeratorCount,
  getModeratorCount,
} from "../helpers";

describe("Futarchy - Moderator", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let startingModeratorCount: number;
  let firstModeratorId: number;

  before(async () => {
    // Get starting moderator count (may be non-zero if other tests ran first)
    startingModeratorCount = await getModeratorCount(client);

    // Create fresh mints for this test suite
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);
  });

  describe("Initialize Moderator", () => {
    it("initializes first moderator and creates global config", async () => {
      const ctx = await createModerator(client, wallet, {
        baseMint,
        quoteMint,
      });

      // Store the first moderator ID for later tests
      firstModeratorId = ctx.moderatorId;

      // Verify moderator was created
      await expectModeratorExists(client, ctx.moderatorPda, baseMint, quoteMint);

      // Verify global config counter incremented by 1
      await expectModeratorCount(client, startingModeratorCount + 1);

      // Verify moderator ID matches expected (relative to starting count)
      expect(ctx.moderatorId).to.equal(startingModeratorCount);
    });

    it("initializes second moderator with same mints", async () => {
      const ctx = await createModerator(client, wallet, {
        baseMint,
        quoteMint,
      });

      // Verify moderator was created
      await expectModeratorExists(client, ctx.moderatorPda, baseMint, quoteMint);

      // Verify counter incremented
      await expectModeratorCount(client, startingModeratorCount + 2);

      // Verify moderator ID is sequential
      expect(ctx.moderatorId).to.equal(firstModeratorId + 1);
    });

    it("initializes moderator with different mints", async () => {
      // Create new mints
      const newBaseMint = await createTestMint(provider, wallet);
      const newQuoteMint = await createTestMint(provider, wallet);

      const ctx = await createModerator(client, wallet, {
        baseMint: newBaseMint,
        quoteMint: newQuoteMint,
      });

      // Verify moderator was created with new mints
      await expectModeratorExists(client, ctx.moderatorPda, newBaseMint, newQuoteMint);

      // Verify counter incremented
      await expectModeratorCount(client, startingModeratorCount + 3);
    });

    it("stores correct mints on moderator account", async () => {
      // Use the first moderator ID from this test suite (not hardcoded 0)
      const moderator = await client.fetchModerator(
        client.deriveModeratorPDA(firstModeratorId)[0]
      );

      expect(moderator.baseMint.toBase58()).to.equal(baseMint.toBase58());
      expect(moderator.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
      expect(moderator.proposalIdCounter).to.equal(0);
    });
  });
});
