import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import { VaultClient, VaultType } from "../../../sdk/src";
import {
  DEPOSIT_AMOUNT,
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

describe("Multi-User Deposits", () => {
  const { provider, wallet, client } = getTestContext();

  let mint: PublicKey;
  let alice: FundedUser;
  let bob: FundedUser;
  let charlie: FundedUser;

  before(async () => {
    mint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, mint);

    // Create funded users
    alice = await createFundedUser(provider, wallet, mint, 50 * ONE_TOKEN);
    bob = await createFundedUser(provider, wallet, mint, 50 * ONE_TOKEN);
    charlie = await createFundedUser(provider, wallet, mint, 50 * ONE_TOKEN);
  });

  describe("Multiple Users Deposit Different Amounts", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;

    const aliceDeposit = 5 * ONE_TOKEN;
    const bobDeposit = 3 * ONE_TOKEN;
    const charlieDeposit = 1 * ONE_TOKEN;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 30,
        proposalId: 30,
      });
      vaultPda = ctx.vaultPda;
    });

    it("Alice deposits 5 tokens", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        aliceDeposit
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(aliceDeposit)
      );
      await expectVaultBalance(client, vaultPda, aliceDeposit);
    });

    it("Bob deposits 3 tokens", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        bobDeposit
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(bobDeposit)
      );
      await expectVaultBalance(client, vaultPda, aliceDeposit + bobDeposit);
    });

    it("Charlie deposits 1 token", async () => {
      const charlieClient = createUserClient(provider, charlie.keypair);
      const builder = await charlieClient.deposit(
        charlie.keypair.publicKey,
        vaultPda,
        charlieDeposit
      );
      await sendWithComputeBudget(builder, charlieClient, charlie.wallet, numOptions);

      await expectCondBalances(
        client,
        vaultPda,
        charlie.keypair.publicKey,
        Array(numOptions).fill(charlieDeposit)
      );
      await expectVaultBalance(
        client,
        vaultPda,
        aliceDeposit + bobDeposit + charlieDeposit
      );
    });

    it("verifies total vault balance equals sum of all deposits", async () => {
      const totalDeposits = aliceDeposit + bobDeposit + charlieDeposit;
      await expectVaultBalance(client, vaultPda, totalDeposits);
    });
  });

  describe("Same User Multiple Deposits (Accumulation)", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 31,
        proposalId: 31,
      });
      vaultPda = ctx.vaultPda;
    });

    it("Alice makes first deposit", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount1 = 1 * ONE_TOKEN;

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        amount1
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(amount1)
      );
    });

    it("Alice makes second deposit (accumulates)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount2 = 2 * ONE_TOKEN;

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        amount2
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      const expectedTotal = 3 * ONE_TOKEN;
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(expectedTotal)
      );
    });

    it("Alice makes third deposit (accumulates)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount3 = 500_000; // 0.5 tokens

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        amount3
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      const expectedTotal = 3_500_000; // 3.5 tokens
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(expectedTotal)
      );
      await expectVaultBalance(client, vaultPda, expectedTotal);
    });
  });

  describe("Users Deposit at Different Times", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 32,
        proposalId: 32,
      });
      vaultPda = ctx.vaultPda;
    });

    it("first user deposits while vault is empty", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const aliceAmount = 2 * ONE_TOKEN;

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        aliceAmount
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, aliceAmount);
    });

    it("second user deposits after first (vault not empty)", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const bobAmount = 3 * ONE_TOKEN;

      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        bobAmount
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      // Verify Bob's balance is independent
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(bobAmount)
      );

      // Verify vault total
      await expectVaultBalance(client, vaultPda, 5 * ONE_TOKEN);
    });

    it("verifies each user's balance is independent", async () => {
      // Alice should still have 2 tokens
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(2 * ONE_TOKEN)
      );

      // Bob should have 3 tokens
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });
  });
});
