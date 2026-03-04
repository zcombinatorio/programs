import { PublicKey, SystemProgram } from "@solana/web3.js";
import { ProposalState } from "../../../sdk/src";

import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createModerator,
  createProposalInPendingState,
  waitForProposalExpiration,
  warmupTwap,
  expectAnchorError,
  expectProposalState,
  expectWinningOption,
  ModeratorTestContext,
  sleep,
} from "../helpers";

describe("Futarchy - Claim Lock", () => {
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

  it("locks claims for winning option when claim_lock_index is omitted", async () => {
    const ctx = await createProposalInPendingState(
      client,
      wallet,
      moderatorCtx,
      undefined,
      undefined,
      {
        length: 1,
        marketBias: 10_000, // Force option 0 as winner unless another option is >2x
        claimLockSeconds: 2,
        claimLockIndex: null,
      }
    );

    await warmupTwap(client, ctx.proposalPda);
    await waitForProposalExpiration(client, ctx.proposalPda);

    const { builder: finalizeBuilder } = await client.finalizeProposal(
      wallet.publicKey,
      ctx.proposalPda
    );
    await finalizeBuilder.rpc();

    await expectProposalState(client, ctx.proposalPda, ProposalState.Resolved);
    await expectWinningOption(client, ctx.proposalPda, 0);

    const { builder: redeemLockedBuilder } = await client.redeemLiquidity(
      wallet.publicKey,
      ctx.proposalPda
    );
    await expectAnchorError(redeemLockedBuilder.rpc(), "ClaimsLocked");

    await sleep(2200);

    const { builder: redeemUnlockedBuilder } = await client.redeemLiquidity(
      wallet.publicKey,
      ctx.proposalPda
    );
    await redeemUnlockedBuilder.rpc();
  });

  it("does not lock claims when claim_lock_index does not match winning option", async () => {
    const ctx = await createProposalInPendingState(
      client,
      wallet,
      moderatorCtx,
      undefined,
      undefined,
      {
        length: 1,
        marketBias: 10_000, // Force option 0 as winner unless another option is >2x
        claimLockSeconds: 2,
        claimLockIndex: 1,
      }
    );

    await warmupTwap(client, ctx.proposalPda);
    await waitForProposalExpiration(client, ctx.proposalPda);

    const { builder: finalizeBuilder } = await client.finalizeProposal(
      wallet.publicKey,
      ctx.proposalPda
    );
    await finalizeBuilder.rpc();

    await expectProposalState(client, ctx.proposalPda, ProposalState.Resolved);
    await expectWinningOption(client, ctx.proposalPda, 0);

    const { builder: redeemBuilder } = await client.redeemLiquidity(
      wallet.publicKey,
      ctx.proposalPda
    );
    await redeemBuilder.rpc();
  });

  it("treats missing claim config/target remaining accounts as no-lock", async () => {
    const ctx = await createProposalInPendingState(
      client,
      wallet,
      moderatorCtx,
      undefined,
      undefined,
      {
        length: 1,
        marketBias: 10_000, // Force option 0 as winner unless another option is >2x
        claimLockSeconds: 5,
        claimLockIndex: null,
      }
    );

    await warmupTwap(client, ctx.proposalPda);
    await waitForProposalExpiration(client, ctx.proposalPda);

    const proposal = await client.fetchProposal(ctx.proposalPda);
    const vault = await client.vault.fetchVault(proposal.vault);
    const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
    for (let i = 0; i < proposal.numOptions; i++) {
      const pool = proposal.pools[i];
      const [reserveA] = client.amm.deriveReservePDA(pool, vault.condQuoteMints[i]);
      const [reserveB] = client.amm.deriveReservePDA(pool, vault.condBaseMints[i]);
      remainingAccounts.push({ pubkey: pool, isSigner: false, isWritable: true });
      remainingAccounts.push({ pubkey: reserveA, isSigner: false, isWritable: false });
      remainingAccounts.push({ pubkey: reserveB, isSigner: false, isWritable: false });
    }
    const [claimLockPda] = client.vault.deriveClaimLockPDA(proposal.vault);
    remainingAccounts.push({ pubkey: claimLockPda, isSigner: false, isWritable: true });
    remainingAccounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });

    await client.program.methods
      .finalizeProposal()
      .accountsPartial({
        signer: wallet.publicKey,
        proposal: ctx.proposalPda,
        vault: proposal.vault,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();

    await expectProposalState(client, ctx.proposalPda, ProposalState.Resolved);

    const { builder: redeemBuilder } = await client.redeemLiquidity(
      wallet.publicKey,
      ctx.proposalPda
    );
    await redeemBuilder.rpc();
  });
});
