import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import { VaultClient, VaultType, VaultState } from "../../../sdk/src";
import {
  DEPOSIT_AMOUNT,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createVaultInActiveState,
  sendAndLog,
  expectVaultState,
  expectCondBalances,
  expectVaultBalance,
} from "../helpers";

describe("Vault Types", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);
  });

  describe("Base and Quote Operations on Same Vault", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;
    const nonce = 20;
    const proposalId = 20;

    before(async () => {
      // Initialize vault with both base and quote mints
      const {
        builder,
        vaultPda: pda,
      } = client.initialize(
        wallet.publicKey,
        baseMint,
        quoteMint,
        nonce,
        proposalId
      );
      await builder.rpc();
      vaultPda = pda;

      // Add option to reach 3 options
      const { builder: addBuilder } = await client.addOption(wallet.publicKey, vaultPda);
      await addBuilder.rpc();
    });

    it("verifies vault initialized with both mints", async () => {
      const vault = await client.fetchVault(vaultPda);
      expect(vault.baseMint.toBase58()).to.equal(baseMint.toBase58());
      expect(vault.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
      expect(vault.state).to.equal("setup");
      expect(vault.numOptions).to.equal(3);
    });

    it("activates vault", async () => {
      await client.activate(wallet.publicKey, vaultPda).rpc();
      await expectVaultState(client, vaultPda, VaultState.Active);
    });

    it("deposits to base side of vault", async () => {
      const builder = await client.deposit(
        wallet.publicKey,
        vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT
      );
      await sendAndLog(builder, client, wallet);

      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        VaultType.Base,
        Array(numOptions).fill(DEPOSIT_AMOUNT)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, DEPOSIT_AMOUNT);
    });

    it("deposits to quote side of vault", async () => {
      const quoteDeposit = DEPOSIT_AMOUNT * 2;
      const builder = await client.deposit(
        wallet.publicKey,
        vaultPda,
        VaultType.Quote,
        quoteDeposit
      );
      await sendAndLog(builder, client, wallet);

      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        VaultType.Quote,
        Array(numOptions).fill(quoteDeposit)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Quote, quoteDeposit);
    });

    it("verifies base and quote balances are independent", async () => {
      // Base should still have original deposit
      await expectVaultBalance(client, vaultPda, VaultType.Base, DEPOSIT_AMOUNT);
      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        VaultType.Base,
        Array(numOptions).fill(DEPOSIT_AMOUNT)
      );

      // Quote should have double deposit
      await expectVaultBalance(client, vaultPda, VaultType.Quote, DEPOSIT_AMOUNT * 2);
      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        VaultType.Quote,
        Array(numOptions).fill(DEPOSIT_AMOUNT * 2)
      );
    });

    it("withdraws from base side", async () => {
      const withdrawAmount = DEPOSIT_AMOUNT / 2;
      const builder = await client.withdraw(
        wallet.publicKey,
        vaultPda,
        VaultType.Base,
        withdrawAmount
      );
      await sendAndLog(builder, client, wallet);

      const expectedBalance = DEPOSIT_AMOUNT - withdrawAmount;
      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        VaultType.Base,
        Array(numOptions).fill(expectedBalance)
      );
      await expectVaultBalance(client, vaultPda, VaultType.Base, expectedBalance);

      // Quote should be unaffected
      await expectVaultBalance(client, vaultPda, VaultType.Quote, DEPOSIT_AMOUNT * 2);
    });

    it("finalizes vault", async () => {
      await client.finalize(wallet.publicKey, vaultPda, 1).rpc();
      await expectVaultState(client, vaultPda, VaultState.Finalized);

      const vault = await client.fetchVault(vaultPda);
      expect(vault.winningIdx).to.equal(1);
    });

    it("redeems from base side", async () => {
      const builder = await client.redeemWinnings(
        wallet.publicKey,
        vaultPda,
        VaultType.Base
      );
      await sendAndLog(builder, client, wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Base, 0);
    });

    it("redeems from quote side", async () => {
      const builder = await client.redeemWinnings(
        wallet.publicKey,
        vaultPda,
        VaultType.Quote
      );
      await sendAndLog(builder, client, wallet);

      await expectVaultBalance(client, vaultPda, VaultType.Quote, 0);
    });
  });
});
