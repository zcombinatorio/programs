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

describe("Multi-User Redemption", () => {
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

  describe("Multiple Users Redeem After Finalization", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;
    const winningIdx = 0;

    const aliceDeposit = 5 * ONE_TOKEN;
    const bobDeposit = 3 * ONE_TOKEN;
    const charlieDeposit = 2 * ONE_TOKEN;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        aliceDeposit
      );
      await sendAndLog(
        aliceBuilder,
        aliceClient,
        alice.wallet,
        numOptions
      );

      const bobBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        bobDeposit
      );
      await sendAndLog(bobBuilder, bobClient, bob.wallet);

      const charlieBuilder = await charlieClient.deposit(
        charlie.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        charlieDeposit
      );
      await sendAndLog(
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
        alice.keypair.publicKey,
        VaultType.Base
      );

      const builder = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      const { userBalance: balanceAfter } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base
      );

      expect(balanceAfter - balanceBefore).to.equal(aliceDeposit);
    });

    it("Bob redeems and receives 3M", async () => {
      const bobClient = createUserClient(provider, bob.keypair);

      const { userBalance: balanceBefore } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );

      const builder = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      const { userBalance: balanceAfter } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );

      expect(balanceAfter - balanceBefore).to.equal(bobDeposit);
    });

    it("Charlie redeems and receives 2M", async () => {
      const charlieClient = createUserClient(provider, charlie.keypair);

      const { userBalance: balanceBefore } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey,
        VaultType.Base
      );

      const builder = await charlieClient.redeemWinnings(
        charlie.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(
        builder,
        charlieClient,
        charlie.wallet,
        numOptions
      );

      const { userBalance: balanceAfter } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey,
        VaultType.Base
      );

      expect(balanceAfter - balanceBefore).to.equal(charlieDeposit);
    });

    it("vault balance is 0 after all redemptions", async () => {
      await expectVaultBalance(client, vaultPda, VaultType.Base, 0);
    });
  });

  describe("Redemption Order Independence", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;
    const winningIdx = 1;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        5 * ONE_TOKEN
      );
      await sendAndLog(
        aliceBuilder,
        aliceClient,
        alice.wallet,
        numOptions
      );

      const bobBuilder = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        3 * ONE_TOKEN
      );
      await sendAndLog(bobBuilder, bobClient, bob.wallet);

      await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();
    });

    it("Bob redeems FIRST (different order than deposit)", async () => {
      const bobClient = createUserClient(provider, bob.keypair);

      const { userBalance: balanceBefore } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );

      const builder = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      const { userBalance: balanceAfter } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );

      expect(balanceAfter - balanceBefore).to.equal(3 * ONE_TOKEN);
    });

    it("Alice redeems SECOND", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const { userBalance: balanceBefore } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base
      );

      const builder = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      const { userBalance: balanceAfter } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base
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
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        5 * ONE_TOKEN
      );
      await sendAndLog(
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
        VaultType.Base,
        3 * ONE_TOKEN
      );
      await sendAndLog(
        bobDepositBuilder,
        bobClient,
        bob.wallet,
        numOptions
      );

      const bobWithdrawBuilder = await bobClient.withdraw(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        3 * ONE_TOKEN
      );
      await sendAndLog(
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
        bob.keypair.publicKey,
        VaultType.Base
      );

      // This should succeed but transfer 0
      const builder = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, bobClient, bob.wallet);

      const { userBalance: balanceAfter } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );

      // Bob receives nothing
      expect(balanceAfter - balanceBefore).to.equal(0);
    });

    it("Alice redeems full amount", async () => {
      const aliceClient = createUserClient(provider, alice.keypair);

      const builder = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, aliceClient, alice.wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 0);
    });
  });

  describe("User Who Never Deposited", () => {
    let vaultPda: PublicKey;
    const numOptions = 2;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        VaultType.Base,
        5 * ONE_TOKEN
      );
      await sendAndLog(
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
        charlie.keypair.publicKey,
        VaultType.Base
      );

      // Charlie has no ATAs for conditional tokens
      // The redeem_winnings handler gracefully handles empty ATAs
      const builder = await charlieClient.redeemWinnings(
        charlie.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(
        builder,
        charlieClient,
        charlie.wallet,
        numOptions
      );

      const { userBalance: balanceAfter } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey,
        VaultType.Base
      );

      expect(balanceAfter - balanceBefore).to.equal(0);
    });
  });

  describe("Zero-Sum Verification", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;

    before(async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
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
        alice.keypair.publicKey,
        VaultType.Base
      );
      const { userBalance: bobInitial } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );
      const { userBalance: charlieInitial } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey,
        VaultType.Base
      );

      // Deposits
      const aliceDeposit = 5 * ONE_TOKEN;
      const bobDeposit = 3 * ONE_TOKEN;
      const charlieDeposit = 2 * ONE_TOKEN;
      const totalDeposits = aliceDeposit + bobDeposit + charlieDeposit;

      const ab = await aliceClient.deposit(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        aliceDeposit
      );
      await sendAndLog(ab, aliceClient, alice.wallet);

      const bb = await bobClient.deposit(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        bobDeposit
      );
      await sendAndLog(bb, bobClient, bob.wallet);

      const cb = await charlieClient.deposit(
        charlie.keypair.publicKey,
        vaultPda,
        VaultType.Base,
        charlieDeposit
      );
      await sendAndLog(cb, charlieClient, charlie.wallet);

      // Verify vault has total deposits
      await expectVaultBalance(client, vaultPda, VaultType.Base, totalDeposits);

      // Finalize
      await client.finalize(wallet.publicKey, vaultPda, 0).rpc();

      // All redeem
      const ar = await aliceClient.redeemWinnings(
        alice.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(ar, aliceClient, alice.wallet);

      const br = await bobClient.redeemWinnings(
        bob.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(br, bobClient, bob.wallet);

      const cr = await charlieClient.redeemWinnings(
        charlie.keypair.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(cr, charlieClient, charlie.wallet);

      // Final balances
      const { userBalance: aliceFinal } = await aliceClient.fetchUserBalances(
        vaultPda,
        alice.keypair.publicKey,
        VaultType.Base
      );
      const { userBalance: bobFinal } = await bobClient.fetchUserBalances(
        vaultPda,
        bob.keypair.publicKey,
        VaultType.Base
      );
      const { userBalance: charlieFinal } = await charlieClient.fetchUserBalances(
        vaultPda,
        charlie.keypair.publicKey,
        VaultType.Base
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
      await expectVaultBalance(client, vaultPda, VaultType.Base, 0);
    });
  });
});
