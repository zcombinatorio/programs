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

describe("Interleaved Deposit/Withdraw", () => {
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

  describe("Interleaved Operations", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 40,
        proposalId: 40,
      });
      vaultPda = ctx.vaultPda;
    });

    it("Step 1: Alice deposits 5M", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount = 5 * ONE_TOKEN;

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        amount
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 5 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(5 * ONE_TOKEN)
      );
    });

    it("Step 2: Bob deposits 3M", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const amount = 3 * ONE_TOKEN;

      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        amount
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 8 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });

    it("Step 3: Alice withdraws 2M", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const withdrawAmount = 2 * ONE_TOKEN;

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        withdrawAmount
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 6 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });

    it("Step 4: Bob deposits additional 1M", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const amount = 1 * ONE_TOKEN;

      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        amount
      );
      await sendWithComputeBudget(builder, bobClient, bob.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 7 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(4 * ONE_TOKEN)
      );
    });

    it("verifies final state after interleaved operations", async () => {
      // Alice: 5M - 2M = 3M
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );

      // Bob: 3M + 1M = 4M
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(4 * ONE_TOKEN)
      );

      // Vault: 3M + 4M = 7M
      await expectVaultBalance(client, vaultPda, 7 * ONE_TOKEN);
    });
  });

  describe("Full Withdrawal While Others Have Balances", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 41,
        proposalId: 41,
      });
      vaultPda = ctx.vaultPda;
    });

    it("Alice and Bob deposit", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const bobClient = createUserClient(provider, bob.keypair);

      // Alice deposits 5M
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

      // Bob deposits 3M
      const bobBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        3 * ONE_TOKEN
      );
      await sendWithComputeBudget(bobBuilder, bobClient, bob.wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 8 * ONE_TOKEN);
    });

    it("Alice withdraws everything", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        5 * ONE_TOKEN
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      // Alice should have 0 conditional tokens
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(0)
      );

      // Vault should only have Bob's deposit
      await expectVaultBalance(client, vaultPda, 3 * ONE_TOKEN);
    });

    it("Bob's balance is unaffected", async () => {
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });
  });

  describe("Partial Withdrawals with Odd Amounts", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions,
        nonce: 42,
        proposalId: 42,
      });
      vaultPda = ctx.vaultPda;

      // Alice deposits 1M
      const aliceClient = createUserClient(provider, alice.keypair);
      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        ONE_TOKEN
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);
    });

    it("withdraws 333,333 (first partial)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        333_333
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      const expected = ONE_TOKEN - 333_333; // 666,667
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(expected)
      );
      await expectVaultBalance(client, vaultPda, expected);
    });

    it("withdraws 333,333 (second partial)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        333_333
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      const expected = 333_334; // 666,667 - 333,333
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(expected)
      );
      await expectVaultBalance(client, vaultPda, expected);
    });

    it("withdraws remaining 333,334 (exact remainder)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        333_334
      );
      await sendWithComputeBudget(builder, aliceClient, alice.wallet, numOptions);

      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        Array(numOptions).fill(0)
      );
      await expectVaultBalance(client, vaultPda, 0);
    });
  });
});
