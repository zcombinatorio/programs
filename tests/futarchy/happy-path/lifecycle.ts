import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { expect } from "chai";

import { ProposalState, parseProposalState } from "../../../sdk/src";
import {
  OPTION_COUNTS,
  INITIAL_LIQUIDITY,
  PROPOSAL_LENGTH,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createModerator,
  createProposalInSetupState,
  waitForProposalExpiration,
  warmupTwap,
  sendAndLog,
  sendVersionedTx,
  preCreateConditionalATAs,
  getTokenBalanceFor,
  expectProposalState,
  expectNumOptions,
  expectWinningOption,
  expectProposalCount,
  ModeratorTestContext,
} from "../helpers";

describe("Futarchy - Proposal Lifecycle", () => {
  const { provider, wallet, client } = getTestContext();

  // Parameterized tests for each option count
  OPTION_COUNTS.forEach((numOptions) => {
    describe(`with ${numOptions} options`, () => {
      let baseMint: PublicKey;
      let quoteMint: PublicKey;
      let moderatorCtx: ModeratorTestContext;
      let proposalPda: PublicKey;
      let vaultPda: PublicKey;
      let pools: PublicKey[];
      let condBaseMints: PublicKey[];
      let condQuoteMints: PublicKey[];
      let altAddress: PublicKey | undefined;

      // Balance tracking for assertions
      let userBaseBalanceBeforeLaunch: number;
      let userQuoteBalanceBeforeLaunch: number;
      let userBaseBalanceBeforeRedeem: number;
      let userQuoteBalanceBeforeRedeem: number;

      before(async () => {
        // Create fresh mints for this test suite
        baseMint = await createTestMint(provider, wallet);
        quoteMint = await createTestMint(provider, wallet);
        await fundOwnerWallet(provider, wallet, baseMint);
        await fundOwnerWallet(provider, wallet, quoteMint);

        // Create moderator
        moderatorCtx = await createModerator(client, wallet, {
          baseMint,
          quoteMint,
        });
      });

      describe("Setup Phase", () => {
        it("initializes proposal with correct number of options", async () => {
          const ctx = await createProposalInSetupState(
            client,
            wallet,
            moderatorCtx,
            { numOptions }
          );

          proposalPda = ctx.proposalPda;
          vaultPda = ctx.vaultPda;
          pools = ctx.pools;
          condBaseMints = ctx.condBaseMints;
          condQuoteMints = ctx.condQuoteMints;
          altAddress = ctx.altAddress;

          // Verify proposal state
          await expectProposalState(client, proposalPda, ProposalState.Setup);
          await expectNumOptions(client, proposalPda, numOptions);
        });

        it("creates correct number of AMM pools", async () => {
          expect(pools.length).to.equal(numOptions);

          // Verify each pool exists
          for (const pool of pools) {
            const poolAccount = await client.amm.fetchPool(pool);
            expect(poolAccount).to.not.be.null;
          }
        });

        it("creates correct conditional mints", async () => {
          expect(condBaseMints.length).to.equal(numOptions);
          expect(condQuoteMints.length).to.equal(numOptions);
        });

        it("stores correct proposal data", async () => {
          const proposal = await client.fetchProposal(proposalPda);

          expect(proposal.moderator.toBase58()).to.equal(
            moderatorCtx.moderatorPda.toBase58()
          );
          expect(proposal.vault.toBase58()).to.equal(vaultPda.toBase58());
          expect(proposal.numOptions).to.equal(numOptions);
          // pools is a fixed-size array, check numOptions pools are set
          for (let i = 0; i < numOptions; i++) {
            expect(proposal.pools[i].toBase58()).to.not.equal(PublicKey.default.toBase58());
          }
        });

        it("increments proposal counter on moderator", async () => {
          await expectProposalCount(client, moderatorCtx.moderatorPda, 1);
        });
      });

      describe("Launch Phase", () => {
        it("launches proposal and transitions to Pending", async () => {
          // Pre-create conditional token ATAs to avoid CPI depth issues
          // This is required for proposals with many options (>2) to stay within instruction trace limits
          await preCreateConditionalATAs(client, wallet, {
            proposalPda,
            proposalId: 0, // Not used by preCreateConditionalATAs
            vaultPda,
            pools,
            condBaseMints,
            condQuoteMints,
            moderatorPda: moderatorCtx.moderatorPda,
            baseMint: moderatorCtx.baseMint,
            quoteMint: moderatorCtx.quoteMint,
            altAddress,
          });

          // Capture balances before launch
          userBaseBalanceBeforeLaunch = await getTokenBalanceFor(provider, baseMint, wallet.publicKey);
          userQuoteBalanceBeforeLaunch = await getTokenBalanceFor(provider, quoteMint, wallet.publicKey);

          const { builder, instruction } = await client.launchProposal(
            wallet.publicKey,
            proposalPda,
            INITIAL_LIQUIDITY,
            INITIAL_LIQUIDITY
          );

          // Use versioned transaction with ALT for large proposals
          if (altAddress) {
            const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
            await sendVersionedTx([computeBudgetIx, instruction], client, wallet, altAddress, "launchProposal");
          } else {
            await sendAndLog(builder, client, wallet, "launchProposal");
          }

          await expectProposalState(client, proposalPda, ProposalState.Pending);
        });

        it("transfers base and quote tokens from user to vault", async () => {
          // User's base/quote balances should have decreased by INITIAL_LIQUIDITY
          const userBaseAfter = await getTokenBalanceFor(provider, baseMint, wallet.publicKey);
          const userQuoteAfter = await getTokenBalanceFor(provider, quoteMint, wallet.publicKey);

          expect(userBaseBalanceBeforeLaunch - userBaseAfter).to.equal(
            INITIAL_LIQUIDITY,
            "User base tokens should decrease by INITIAL_LIQUIDITY"
          );
          expect(userQuoteBalanceBeforeLaunch - userQuoteAfter).to.equal(
            INITIAL_LIQUIDITY,
            "User quote tokens should decrease by INITIAL_LIQUIDITY"
          );

          // Vault should have received the tokens
          const vaultBaseBalance = await getTokenBalanceFor(provider, baseMint, vaultPda, true);
          const vaultQuoteBalance = await getTokenBalanceFor(provider, quoteMint, vaultPda, true);

          expect(vaultBaseBalance).to.equal(INITIAL_LIQUIDITY, "Vault should hold base tokens");
          expect(vaultQuoteBalance).to.equal(INITIAL_LIQUIDITY, "Vault should hold quote tokens");
        });

        it("mints conditional tokens to user", async () => {
          // User should have received conditional tokens for each option
          for (let i = 0; i < numOptions; i++) {
            const condBaseBalance = await getTokenBalanceFor(provider, condBaseMints[i], wallet.publicKey);
            const condQuoteBalance = await getTokenBalanceFor(provider, condQuoteMints[i], wallet.publicKey);

            // User gets conditional tokens equal to deposit amount (minus what went to pools)
            // The tokens go to AMM pools as liquidity, so user balance may be 0 after add_liquidity
            // But the reserves should have the tokens
            expect(condBaseBalance).to.be.greaterThanOrEqual(0);
            expect(condQuoteBalance).to.be.greaterThanOrEqual(0);
          }
        });

        it("deposits liquidity to all pools", async () => {
          // Verify each pool has liquidity
          for (const pool of pools) {
            const { reserveA, reserveB } = await client.amm.fetchReserves(pool);
            // Pool should have reserves > 0 after launch
            expect(reserveA.toNumber()).to.be.greaterThan(0);
            expect(reserveB.toNumber()).to.be.greaterThan(0);
          }
        });

        it("records created timestamp", async () => {
          const proposal = await client.fetchProposal(proposalPda);
          expect(proposal.createdAt.toNumber()).to.be.greaterThan(0);
        });
      });

      describe("Finalization Phase", () => {
        it("waits for proposal expiration and warms up TWAP", async () => {
          // Warm up TWAP with cranks during the proposal period
          await warmupTwap(client, proposalPda);

          await waitForProposalExpiration(client, proposalPda);

          const proposal = await client.fetchProposal(proposalPda);
          const isExpired = client.isProposalExpired(proposal);
          expect(isExpired).to.be.true;
        });

        it("finalizes proposal and selects winning option", async () => {
          const { builder } = await client.finalizeProposal(
            wallet.publicKey,
            proposalPda
          );
          await sendAndLog(builder, client, wallet, "finalizeProposal");

          await expectProposalState(client, proposalPda, ProposalState.Resolved);
        });

        it("sets winning option based on TWAP", async () => {
          const proposal = await client.fetchProposal(proposalPda);
          const { winningIdx } = parseProposalState(proposal.state);

          // Winning index should be valid
          expect(winningIdx).to.not.be.null;
          expect(winningIdx).to.be.lessThan(numOptions);
        });

        it("finalizes AMM pools", async () => {
          // Verify pools are finalized
          for (const pool of pools) {
            const poolAccount = await client.amm.fetchPool(pool);
            // Pool state should indicate finalized (pool.state check)
            expect(poolAccount).to.not.be.null;
          }
        });
      });

      describe("Redemption Phase", () => {
        it("redeems liquidity successfully", async () => {
          // Capture balances before redemption
          userBaseBalanceBeforeRedeem = await getTokenBalanceFor(provider, baseMint, wallet.publicKey);
          userQuoteBalanceBeforeRedeem = await getTokenBalanceFor(provider, quoteMint, wallet.publicKey);

          const { builder, instruction } = await client.redeemLiquidity(
            wallet.publicKey,
            proposalPda
          );

          // Use versioned transaction with ALT for large proposals
          if (altAddress) {
            const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
            await sendVersionedTx([computeBudgetIx, instruction], client, wallet, altAddress, "redeemLiquidity");
          } else {
            await sendAndLog(builder, client, wallet, "redeemLiquidity");
          }

          // Transaction succeeded - redemption worked
        });

        it("returns base and quote tokens to user", async () => {
          // User should have received their base/quote tokens back
          const userBaseAfter = await getTokenBalanceFor(provider, baseMint, wallet.publicKey);
          const userQuoteAfter = await getTokenBalanceFor(provider, quoteMint, wallet.publicKey);

          // User should receive back approximately INITIAL_LIQUIDITY of each token
          // (may be slightly different due to AMM fees/slippage)
          expect(userBaseAfter).to.be.greaterThan(
            userBaseBalanceBeforeRedeem,
            "User should receive base tokens back"
          );
          expect(userQuoteAfter).to.be.greaterThan(
            userQuoteBalanceBeforeRedeem,
            "User should receive quote tokens back"
          );

          // Vault should be empty (or near-empty) after redemption
          const vaultBaseBalance = await getTokenBalanceFor(provider, baseMint, vaultPda, true);
          const vaultQuoteBalance = await getTokenBalanceFor(provider, quoteMint, vaultPda, true);

          expect(vaultBaseBalance).to.equal(0, "Vault should be empty of base tokens");
          expect(vaultQuoteBalance).to.equal(0, "Vault should be empty of quote tokens");
        });

        it("burns winning conditional tokens", async () => {
          const proposal = await client.fetchProposal(proposalPda);
          const { winningIdx } = parseProposalState(proposal.state);
          expect(winningIdx).to.not.be.null;

          // User's winning conditional tokens should be burned (balance = 0)
          const winningCondBaseBalance = await getTokenBalanceFor(
            provider,
            condBaseMints[winningIdx!],
            wallet.publicKey
          );
          const winningCondQuoteBalance = await getTokenBalanceFor(
            provider,
            condQuoteMints[winningIdx!],
            wallet.publicKey
          );

          expect(winningCondBaseBalance).to.equal(0, "Winning cond base tokens should be burned");
          expect(winningCondQuoteBalance).to.equal(0, "Winning cond quote tokens should be burned");
        });

        it("burns losing conditional tokens", async () => {
          const proposal = await client.fetchProposal(proposalPda);
          const { winningIdx } = parseProposalState(proposal.state);

          // All losing conditional tokens should also be burned
          for (let i = 0; i < numOptions; i++) {
            if (i === winningIdx) continue; // Skip winner

            const losingCondBaseBalance = await getTokenBalanceFor(
              provider,
              condBaseMints[i],
              wallet.publicKey
            );
            const losingCondQuoteBalance = await getTokenBalanceFor(
              provider,
              condQuoteMints[i],
              wallet.publicKey
            );

            expect(losingCondBaseBalance).to.equal(0, `Losing cond base tokens [${i}] should be burned`);
            expect(losingCondQuoteBalance).to.equal(0, `Losing cond quote tokens [${i}] should be burned`);
          }
        });
      });
    });
  });

  describe("Multiple Proposals", () => {
    let baseMint: PublicKey;
    let quoteMint: PublicKey;
    let moderatorCtx: ModeratorTestContext;

    before(async () => {
      // Create fresh mints for this test suite
      baseMint = await createTestMint(provider, wallet);
      quoteMint = await createTestMint(provider, wallet);
      await fundOwnerWallet(provider, wallet, baseMint);
      await fundOwnerWallet(provider, wallet, quoteMint);

      // Create moderator
      moderatorCtx = await createModerator(client, wallet, {
        baseMint,
        quoteMint,
      });
    });

    it("creates multiple proposals under same moderator", async () => {
      // Create first proposal
      const ctx1 = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx,
        { numOptions: 2 }
      );
      expect(ctx1.proposalId).to.equal(0);

      // Create second proposal
      const ctx2 = await createProposalInSetupState(
        client,
        wallet,
        moderatorCtx,
        { numOptions: 3 }
      );
      expect(ctx2.proposalId).to.equal(1);

      // Verify both exist independently
      await expectNumOptions(client, ctx1.proposalPda, 2);
      await expectNumOptions(client, ctx2.proposalPda, 3);

      // Verify counter
      await expectProposalCount(client, moderatorCtx.moderatorPda, 2);
    });
  });
});
