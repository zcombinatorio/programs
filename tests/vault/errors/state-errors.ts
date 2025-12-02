import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { VaultClient, VaultType } from "../../../sdk/src";
import {
  DEPOSIT_AMOUNT,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createVaultInSetupState,
  createVaultInActiveState,
  createVaultInFinalizedState,
  createVaultWithDeposit,
  sendWithComputeBudget,
  expectAnchorError,
} from "../helpers";

describe("State Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let mint: PublicKey;

  before(async () => {
    mint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, mint);
  });

  describe("InvalidState - add_option", () => {
    it("rejects add_option when vault is Active", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint);

      const { builder } = await client.addOption(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("rejects add_option when vault is Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, mint, 0);

      const { builder } = await client.addOption(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(builder.rpc(), "InvalidState");
    });
  });

  describe("InvalidState - activate", () => {
    it("rejects activate when vault is already Active", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint);

      await expectAnchorError(
        client.activate(wallet.publicKey, ctx.vaultPda).rpc(),
        "InvalidState"
      );
    });

    it("rejects activate when vault is Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, mint, 0);

      await expectAnchorError(
        client.activate(wallet.publicKey, ctx.vaultPda).rpc(),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - deposit", () => {
    it("rejects deposit when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, mint);

      const builder = await client.deposit(
        wallet.publicKey,
        ctx.vaultPda,
        DEPOSIT_AMOUNT
      );
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidState"
      );
    });

    it("rejects deposit when vault is Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, mint, 0);

      const builder = await client.deposit(
        wallet.publicKey,
        ctx.vaultPda,
        DEPOSIT_AMOUNT
      );
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - withdraw", () => {
    it("rejects withdraw when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, mint);

      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        DEPOSIT_AMOUNT
      );
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidState"
      );
    });

    it("rejects withdraw when vault is Finalized", async () => {
      // Create vault with deposit, then finalize
      const ctx = await createVaultWithDeposit(client, wallet, mint, DEPOSIT_AMOUNT);
      await client.finalize(wallet.publicKey, ctx.vaultPda, 0).rpc();

      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        DEPOSIT_AMOUNT / 2
      );
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - finalize", () => {
    it("rejects finalize when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, mint);

      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 0).rpc(),
        "InvalidState"
      );
    });

    it("rejects finalize when vault is already Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, mint, 0);

      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 1).rpc(),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - redeem_winnings", () => {
    it("rejects redeem_winnings when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, mint);

      const builder = await client.redeemWinnings(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidState"
      );
    });

    it("rejects redeem_winnings when vault is Active", async () => {
      const ctx = await createVaultWithDeposit(client, wallet, mint, DEPOSIT_AMOUNT);

      const builder = await client.redeemWinnings(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidState"
      );
    });
  });
});
