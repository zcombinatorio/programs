import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import { VaultClient, VaultType } from "../../../sdk/src";
import {
  ONE_TOKEN,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createFundedUser,
  createUserClient,
  createVaultInActiveState,
  sendWithComputeBudget,
  expectCondBalances,
  expectVaultBalance,
  FundedUser,
} from "../helpers";

describe("Multi-User Redemption", () => {
  const { provider, wallet, client } = getTestContext();

  let mint: PublicKey;
  let alice: FundedUser;
  let bob: FundedUser;
  let charlie: FundedUser;

  before(async () => {
    mint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, mint);

    alice = await createFundedUser(provider, wallet, mint, 50 * ONE_TOKEN);
    bob = await createFundedUser(provider, wallet, mint, 50 * ONE_TOKEN);
    charlie = await createFundedUser(provider, wallet, mint, 50 * ONE_TOKEN);
  });

  describe("Multiple Users Redeem After Finalization", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;
    const winningIdx = 0;

    const aliceDeposit = 5 * ONE_TOKEN;
    const bobDeposit = 3 * ONE_TOKEN;
    const charlieDeposit = 2 * ONE_TOKEN;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 50,
        proposalId: 50,
      });
      vaultPda = ctx.vaultPda;

      // All users deposit
      const aliceClient = createUserClient(provider, alice.keypair);
      const bobClient = createUserClient(provider, bob.keypair);
      const charlieClient = createUserClient(provider, charlie.keypair);

      const aliceBuilder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        aliceDeposit
      );
      await sendWithComputeBudget(
        aliceBuilder,
        aliceClient,
        alice.wallet,
        numOptions
      );

      const bobBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        bobDeposit
      );
      await sendWithComputeBudget(bobBuilder, bobClient, bob.wallet, numOptions);

      const charlieBuilder = await charlieClient.deposit(
        charlie.keypair.publicKey,
        vaultPda,
        charlieDeposit
      );
      await sendWithComputeBudget(
        charlieBuilder,
        charlieClient,
        charlie.wallet,
        numOptions
      );

      // Finalize
      await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();
    });

    it("Alice redeems and receives 5M (her winning token balance)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const { userBalance: balanceBefore } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey
      );

      const builder = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      const { userBalance: balanceAfter } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey
      );

      expect(balanceAfter - balanceBefore).to.equal(aliceDeposit);
    });

    it("Bob redeems and receives 3M", async () => {
      const bobClient = createUserClient(provider, bob.keypair);

      const { userBalance: balanceBefore } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );

      const builder = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      const { userBalance: balanceAfter } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );

      expect(balanceAfter - balanceBefore).to.equal(bobDeposit);
    });

    it("Charlie redeems and receives 2M", async () => {
      const charlieClient = createUserClient(provider, charlie.keypair);

      const { userBalance: balanceBefore } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey
      );

      const builder = await charlieClient.redeemWinnings(
        charlie.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(
        builder,
        charlieClient,
        charlie.wallet,
        numOptions
      );

      const { userBalance: balanceAfter } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey
      );

      expect(balanceAfter - balanceBefore).to.equal(charlieDeposit);
    });

    it("vault balance is 0 after all redemptions", async () => {
      await expectVaultBalance(client, vaultPda, 0);
    });
  });

  describe("Redemption Order Independence", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;
    const winningIdx = 1;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 51,
        proposalId: 51,
      });
      vaultPda = ctx.vaultPda;

      // Deposits
      const aliceClient = createUserClient(provider, alice.keypair);
      const bobClient = createUserClient(provider, bob.keypair);

      const aliceBuilder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        5 * ONE_TOKEN
      );
      await sendWithComputeBudget(
        aliceBuilder,
        aliceClient,
        alice.wallet,
        numOptions
      );

      const bobBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        3 * ONE_TOKEN
      );
      await sendWithComputeBudget(bobBuilder, bobClient, bob.wallet, numOptions);

      await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();
    });

    it("Bob redeems FIRST (different order than deposit)", async () => {
      const bobClient = createUserClient(provider, bob.keypair);

      const { userBalance: balanceBefore } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );

      const builder = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      const { userBalance: balanceAfter } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );

      expect(balanceAfter - balanceBefore).to.equal(3 * ONE_TOKEN);
    });

    it("Alice redeems SECOND", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const { userBalance: balanceBefore } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey
      );

      const builder = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      const { userBalance: balanceAfter } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey
      );

      // Order doesn't matter - Alice gets her amount
      expect(balanceAfter - balanceBefore).to.equal(5 * ONE_TOKEN);
    });
  });

  describe("User With Zero Winning Tokens", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;
    const winningIdx = 0;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 52,
        proposalId: 52,
      });
      vaultPda = ctx.vaultPda;

      // Alice deposits
      const aliceClient = createUserClient(provider, alice.keypair);
      const aliceBuilder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        5 * ONE_TOKEN
      );
      await sendWithComputeBudget(
        aliceBuilder,
        aliceClient,
        alice.wallet,
        numOptions
      );

      // Bob deposits then withdraws everything before finalization
      const bobClient = createUserClient(provider, bob.keypair);
      const bobDepositBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        3 * ONE_TOKEN
      );
      await sendWithComputeBudget(
        bobDepositBuilder,
        bobClient,
        bob.wallet,
        numOptions
      );

      const bobWithdrawBuilder = await bobClient.withdraw(
        bob.keypair.publicKey,
        vaultPda,
        3 * ONE_TOKEN
      );
      await sendWithComputeBudget(
        bobWithdrawBuilder,
        bobClient,
        bob.wallet,
        numOptions
      );

      await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();
    });

    it("Bob (0 winning tokens) can still call redeem - receives 0", async () => {
      const bobClient = createUserClient(provider, bob.keypair);

      const { userBalance: balanceBefore } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );

      // This should succeed but transfer 0
      const builder = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      const { userBalance: balanceAfter } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );

      // Bob receives nothing
      expect(balanceAfter - balanceBefore).to.equal(0);
    });

    it("Alice redeems full amount", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 0);
    });
  });

  describe("User Who Never Deposited", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 53,
        proposalId: 53,
      });
      vaultPda = ctx.vaultPda;

      // Only Alice deposits
      const aliceClient = createUserClient(provider, alice.keypair);
      const aliceBuilder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        5 * ONE_TOKEN
      );
      await sendWithComputeBudget(
        aliceBuilder,
        aliceClient,
        alice.wallet,
        numOptions
      );

      await client.finalize(wallet.publicKey, vaultPda, 0).rpc();
    });

    it("Charlie (never deposited) can call redeem - succeeds with 0", async () => {
      const charlieClient = createUserClient(provider, charlie.keypair);

      const { userBalance: balanceBefore } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey
      );

      // Charlie has no ATAs for conditional tokens
      // The redeem_winnings handler gracefully handles empty ATAs
      const builder = await charlieClient.redeemWinnings(
        charlie.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(
        builder,
        charlieClient,
        charlie.wallet,
        numOptions
      );

      const { userBalance: balanceAfter } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey
      );

      expect(balanceAfter - balanceBefore).to.equal(0);
    });
  });

  describe("Zero-Sum Verification", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 54,
        proposalId: 54,
      });
      vaultPda = ctx.vaultPda;
    });

    it("total deposits equal total redemptions", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const bobClient = createUserClient(provider, bob.keypair);
      const charlieClient = createUserClient(provider, charlie.keypair);

      // Record initial balances
      const { userBalance: aliceInitial } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey
      );
      const { userBalance: bobInitial } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );
      const { userBalance: charlieInitial } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey
      );

      // Deposits
      const aliceDeposit = 5 * ONE_TOKEN;
      const bobDeposit = 3 * ONE_TOKEN;
      const charlieDeposit = 2 * ONE_TOKEN;
      const totalDeposits = aliceDeposit + bobDeposit + charlieDeposit;

      const ab = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        aliceDeposit
      );
      await sendWithComputeBudget(ab, aliceClient, alice.wallet, numOptions);

      const bb = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        bobDeposit
      );
      await sendWithComputeBudget(bb, bobClient, bob.wallet, numOptions);

      const cb = await charlieClient.deposit(
        charlie.keypair.publicKey,
        vaultPda,
        charlieDeposit
      );
      await sendWithComputeBudget(cb, charlieClient, charlie.wallet, numOptions);

      // Verify vault has total deposits
      await expectVaultBalance(client, vaultPda, totalDeposits);

      // Finalize
      await client.finalize(wallet.publicKey, vaultPda, 0).rpc();

      // All redeem
      const ar = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(ar, aliceClient, alice.wallet, numOptions);

      const br = await bobClient.redeemWinnings(bob.keypair.publicKey, vaultPda);
      await sendWithComputeBudget(br, bobClient, bob.wallet, numOptions);

      const cr = await charlieClient.redeemWinnings(
        charlie.keypair.publicKey,
        vaultPda
      );
      await sendWithComputeBudget(cr, charlieClient, charlie.wallet, numOptions);

      // Final balances
      const { userBalance: aliceFinal } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey
      );
      const { userBalance: bobFinal } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey
      );
      const { userBalance: charlieFinal } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey
      );

      // Net change for each user (should be 0 since they get back what they put in)
      // In this simple case without trading, everyone gets their deposit back
      const aliceNet = aliceFinal - aliceInitial + aliceDeposit;
      const bobNet = bobFinal - bobInitial + bobDeposit;
      const charlieNet = charlieFinal - charlieInitial + charlieDeposit;

      // Total redemptions should equal total deposits
      const totalRedemptions =
        (aliceFinal - aliceInitial + aliceDeposit) +
        (bobFinal - bobInitial + bobDeposit) +
        (charlieFinal - charlieInitial + charlieDeposit);

      expect(totalRedemptions).to.equal(totalDeposits);

      // Vault should be empty
      await expectVaultBalance(client, vaultPda, 0);
    });
  });
});
