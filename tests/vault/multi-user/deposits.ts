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
  sendAndLog,
  expectCondBalances,
  expectVaultBalance,
  FundedUser,
} from "../helpers";

describe("Multi-User Deposits", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let alice: FundedUser;
  let bob: FundedUser;
  let charlie: FundedUser;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);

    // Create funded users
    alice = await createFundedUser(provider, wallet, baseMint, quoteMint, 50 * ONE_TOKEN);
    bob = await createFundedUser(provider, wallet, baseMint, quoteMint, 50 * ONE_TOKEN);
    charlie = await createFundedUser(provider, wallet, baseMint, quoteMint, 50 * ONE_TOKEN);
  });

  describe("Multiple Users Deposit Different Amounts", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;

    const aliceDeposit = 5 * ONE_TOKEN;
    const bobDeposit = 3 * ONE_TOKEN;
    const charlieDeposit = 1 * ONE_TOKEN;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        aliceDeposit
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(aliceDeposit)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, aliceDeposit);
    });

    it("Bob deposits 3 tokens", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        bobDeposit
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(bobDeposit)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, aliceDeposit + bobDeposit);
    });

    it("Charlie deposits 1 token", async () => {
      const charlieClient = createUserClient(provider, charlie.keypair);
      const builder = await charlieClient.deposit(
        charlie.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        charlieDeposit
      );
      await sendAndLog(builder, charlieClient, charlie.wallet);

      await expectCondBalances(
        client,
        vaultPda,
        charlie.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(charlieDeposit)
      );
      await expectVaultBalance(
        client,
        vaultPda,
        VaultType.Base,
        aliceDeposit + bobDeposit + charlieDeposit
      );
    });

    it("verifies total vault balance equals sum of all deposits", async () => {
      const totalDeposits = aliceDeposit + bobDeposit + charlieDeposit;
      await expectVaultBalance(client, vaultPda, VaultType.Base, totalDeposits);
    });
  });

  describe("Same User Multiple Deposits (Accumulation)", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        amount1
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(amount1)
      );
    });

    it("Alice makes second deposit (accumulates)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount2 = 2 * ONE_TOKEN;

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        amount2
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      const expectedTotal = 3 * ONE_TOKEN;
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(expectedTotal)
      );
    });

    it("Alice makes third deposit (accumulates)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount3 = 500_000; // 0.5 tokens

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        amount3
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      const expectedTotal = 3_500_000; // 3.5 tokens
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(expectedTotal)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, expectedTotal);
    });
  });

  describe("Users Deposit at Different Times", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        aliceAmount
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, aliceAmount);
    });

    it("second user deposits after first (vault not empty)", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const bobAmount = 3 * ONE_TOKEN;

      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        bobAmount
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      // Verify Bob's balance is independent
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(bobAmount)
      );

      // Verify vault total
      await expectVaultBalance(client, vaultPda, VaultType.Base, 5 * ONE_TOKEN);
    });

    it("verifies each user's balance is independent", async () => {
      // Alice should still have 2 tokens
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(2 * ONE_TOKEN)
      );

      // Bob should have 3 tokens
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });
  });
});
