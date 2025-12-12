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
  sendAndLog,
  expectCondBalances,
  expectVaultBalance,
  FundedUser,
} from "../helpers";

describe("Interleaved Deposit/Withdraw", () => {
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

    alice = await createFundedUser(provider, wallet, baseMint, quoteMint, 50 * ONE_TOKEN);
    bob = await createFundedUser(provider, wallet, baseMint, quoteMint, 50 * ONE_TOKEN);
    charlie = await createFundedUser(provider, wallet, baseMint, quoteMint, 50 * ONE_TOKEN);
  });

  describe("Interleaved Operations", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions,
        nonce: 40,
      });
      vaultPda = ctx.vaultPda;
    });

    it("Step 1: Alice deposits 5M", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const amount = 5 * ONE_TOKEN;

      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        amount
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 5 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(5 * ONE_TOKEN)
      );
    });

    it("Step 2: Bob deposits 3M", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const amount = 3 * ONE_TOKEN;

      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        amount
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 8 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });

    it("Step 3: Alice withdraws 2M", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);
      const withdrawAmount = 2 * ONE_TOKEN;

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        withdrawAmount
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 6 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });

    it("Step 4: Bob deposits additional 1M", async () => {
      const bobClient = createUserClient(provider, bob.keypair);
      const amount = 1 * ONE_TOKEN;

      const builder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        amount
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 7 * ONE_TOKEN);
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(4 * ONE_TOKEN)
      );
    });

    it("verifies final state after interleaved operations", async () => {
      // Alice: 5M - 2M = 3M
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );

      // Bob: 3M + 1M = 4M
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(4 * ONE_TOKEN)
      );

      // Vault: 3M + 4M = 7M
      await expectVaultBalance(client, vaultPda, VaultType.Base, 7 * ONE_TOKEN);
    });
  });

  describe("Full Withdrawal While Others Have Balances", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions,
        nonce: 41,
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
        VaultType.Base,
        5 * ONE_TOKEN
      );
      await sendAndLog(aliceBuilder, aliceClient, alice.wallet);

      // Bob deposits 3M
      const bobBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        3 * ONE_TOKEN
      );
      await sendAndLog(bobBuilder, bobClient, bob.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 8 * ONE_TOKEN);
    });

    it("Alice withdraws everything", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        5 * ONE_TOKEN
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      // Alice should have 0 conditional tokens
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(0)
      );

      // Vault should only have Bob's deposit
      await expectVaultBalance(client, vaultPda, VaultType.Base, 3 * ONE_TOKEN);
    });

    it("Bob's balance is unaffected", async () => {
      await expectCondBalances(
        client,
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(3 * ONE_TOKEN)
      );
    });
  });

  describe("Partial Withdrawals with Odd Amounts", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions,
        nonce: 42,
      });
      vaultPda = ctx.vaultPda;

      // Alice deposits 1M
      const aliceClient = createUserClient(provider, alice.keypair);
      const builder = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        ONE_TOKEN
      );
      await sendAndLog(builder, aliceClient, alice.wallet);
    });

    it("withdraws 333,333 (first partial)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        333_333
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      const expected = ONE_TOKEN - 333_333; // 666,667
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(expected)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, expected);
    });

    it("withdraws 333,333 (second partial)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        333_333
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      const expected = 333_334; // 666,667 - 333,333
      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(expected)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, expected);
    });

    it("withdraws remaining 333,334 (exact remainder)", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.withdraw(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        333_334
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectCondBalances(
        client,
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base,
        Array(numOptions).fill(0)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, 0);
    });
  });
});
