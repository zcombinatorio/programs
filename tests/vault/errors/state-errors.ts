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
  sendAndLog,
  expectAnchorError,
} from "../helpers";

describe("State Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);
  });

  describe("InvalidState - add_option", () => {
    it("rejects add_option when vault is Active", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint);

      const { builder } = await client.addOption(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(builder.rpc(), "InvalidState");
    });

    it("rejects add_option when vault is Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, baseMint, quoteMint, 0);

      const { builder } = await client.addOption(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(builder.rpc(), "InvalidState");
    });
  });

  describe("InvalidState - activate", () => {
    it("rejects activate when vault is already Active", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint);

      await expectAnchorError(
        client.activate(wallet.publicKey, ctx.vaultPda).rpc(),
        "InvalidState"
      );
    });

    it("rejects activate when vault is Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, baseMint, quoteMint, 0);

      await expectAnchorError(
        client.activate(wallet.publicKey, ctx.vaultPda).rpc(),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - deposit", () => {
    it("rejects deposit when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint);

      const builder = await client.deposit(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidState"
      );
    });

    it("rejects deposit when vault is Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, baseMint, quoteMint, 0);

      const builder = await client.deposit(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - withdraw", () => {
    it("rejects withdraw when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint);

      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidState"
      );
    });

    it("rejects withdraw when vault is Finalized", async () => {
      // Create vault with deposit, then finalize
      const ctx = await createVaultWithDeposit(
        client,
        wallet,
        baseMint,
        quoteMint,
        DEPOSIT_AMOUNT,
        VaultType.Base
      );
      await client.finalize(wallet.publicKey, ctx.vaultPda, 0).rpc();

      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT / 2
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - finalize", () => {
    it("rejects finalize when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint);

      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 0).rpc(),
        "InvalidState"
      );
    });

    it("rejects finalize when vault is already Finalized", async () => {
      const ctx = await createVaultInFinalizedState(client, wallet, baseMint, quoteMint, 0);

      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 1).rpc(),
        "InvalidState"
      );
    });
  });

  describe("InvalidState - redeem_winnings", () => {
    it("rejects redeem_winnings when vault is in Setup state", async () => {
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint);

      const builder = await client.redeemWinnings(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidState"
      );
    });

    it("rejects redeem_winnings when vault is Active", async () => {
      const ctx = await createVaultWithDeposit(
        client,
        wallet,
        baseMint,
        quoteMint,
        DEPOSIT_AMOUNT,
        VaultType.Base
      );

      const builder = await client.redeemWinnings(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidState"
      );
    });
  });
});
