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
  sendWithComputeBudget,
  expectVaultState,
  expectCondBalances,
  expectVaultBalance,
} from "../helpers";

describe("Vault Types", () => {
  const { provider, wallet, client } = getTestContext();

  let mint: PublicKey;

  before(async () => {
    mint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, mint);
  });

  describe("VaultType.Quote", () => {
    let vaultPda: PublicKey;
    const numOptions = 3;
    const nonce = 20;
    const proposalId = 20;

    before(async () => {
      // Initialize Quote vault
      const { builder, vaultPda: pda } = client.initialize(
        wallet.publicKey,
        mint,
        VaultType.Quote,
        nonce,
        proposalId
      );
      await builder.rpc();
      vaultPda = pda;

      // Add option to reach 3 options
      const { builder: addBuilder } = await client.addOption(wallet.publicKey, vaultPda);
      await addBuilder.rpc();
    });

    it("verifies Quote vault initialized correctly", async () => {
      const vault = await client.fetchVault(vaultPda);
      expect(vault.vaultType).to.equal(VaultType.Quote);
      expect(vault.state).to.equal("setup");
      expect(vault.numOptions).to.equal(3);
    });

    it("activates Quote vault", async () => {
      await client.activate(wallet.publicKey, vaultPda).rpc();
      await expectVaultState(client, vaultPda, VaultState.Active);
    });

    it("deposits to Quote vault", async () => {
      const builder = await client.deposit(
        wallet.publicKey,
        vaultPda,
        DEPOSIT_AMOUNT
      );
      await sendWithComputeBudget(builder, client, wallet, numOptions);

      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        Array(numOptions).fill(DEPOSIT_AMOUNT)
      );
      await expectVaultBalance(client, vaultPda, DEPOSIT_AMOUNT);
    });

    it("withdraws from Quote vault", async () => {
      const withdrawAmount = DEPOSIT_AMOUNT / 2;
      const builder = await client.withdraw(
        wallet.publicKey,
        vaultPda,
        withdrawAmount
      );
      await sendWithComputeBudget(builder, client, wallet, numOptions);

      const expectedBalance = DEPOSIT_AMOUNT - withdrawAmount;
      await expectCondBalances(
        client,
        vaultPda,
        wallet.publicKey,
        Array(numOptions).fill(expectedBalance)
      );
    });

    it("finalizes Quote vault", async () => {
      await client.finalize(wallet.publicKey, vaultPda, 1).rpc();
      await expectVaultState(client, vaultPda, VaultState.Finalized);

      const vault = await client.fetchVault(vaultPda);
      expect(vault.winningIdx).to.equal(1);
    });

    it("redeems from Quote vault", async () => {
      const builder = await client.redeemWinnings(wallet.publicKey, vaultPda);
      await sendWithComputeBudget(builder, client, wallet, numOptions);

      await expectVaultBalance(client, vaultPda, 0);
    });
  });

  describe("Parallel Base and Quote Vaults", () => {
    let baseVaultPda: PublicKey;
    let quoteVaultPda: PublicKey;
    const nonce = 21;
    const proposalId = 21;
    const numOptions = 2;

    before(async () => {
      // Create Base vault
      const { builder: baseBuilder, vaultPda: basePda } = client.initialize(
        wallet.publicKey,
        mint,
        VaultType.Base,
        nonce,
        proposalId
      );
      await baseBuilder.rpc();
      baseVaultPda = basePda;

      // Create Quote vault with same nonce/proposalId
      const { builder: quoteBuilder, vaultPda: quotePda } = client.initialize(
        wallet.publicKey,
        mint,
        VaultType.Quote,
        nonce,
        proposalId
      );
      await quoteBuilder.rpc();
      quoteVaultPda = quotePda;
    });

    it("creates both Base and Quote vaults with different PDAs", async () => {
      // Verify they have different PDAs
      expect(baseVaultPda.toBase58()).to.not.equal(quoteVaultPda.toBase58());

      // Verify types
      const baseVault = await client.fetchVault(baseVaultPda);
      const quoteVault = await client.fetchVault(quoteVaultPda);
      expect(baseVault.vaultType).to.equal(VaultType.Base);
      expect(quoteVault.vaultType).to.equal(VaultType.Quote);
    });

    it("operates on both vaults independently", async () => {
      // Activate both
      await client.activate(wallet.publicKey, baseVaultPda).rpc();
      await client.activate(wallet.publicKey, quoteVaultPda).rpc();

      // Deposit different amounts to each
      const baseDeposit = DEPOSIT_AMOUNT;
      const quoteDeposit = DEPOSIT_AMOUNT * 2;

      const baseBuilder = await client.deposit(
        wallet.publicKey,
        baseVaultPda,
        baseDeposit
      );
      await sendWithComputeBudget(baseBuilder, client, wallet, numOptions);

      const quoteBuilder = await client.deposit(
        wallet.publicKey,
        quoteVaultPda,
        quoteDeposit
      );
      await sendWithComputeBudget(quoteBuilder, client, wallet, numOptions);

      // Verify balances are independent
      await expectVaultBalance(client, baseVaultPda, baseDeposit);
      await expectVaultBalance(client, quoteVaultPda, quoteDeposit);

      await expectCondBalances(
        client,
        baseVaultPda,
        wallet.publicKey,
        Array(numOptions).fill(baseDeposit)
      );
      await expectCondBalances(
        client,
        quoteVaultPda,
        wallet.publicKey,
        Array(numOptions).fill(quoteDeposit)
      );
    });
  });
});
