import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { VaultClient, VaultType } from "../../../sdk/src";
import {
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createVaultInSetupState,
  createVaultInActiveState,
  createUserClient,
  expectAnchorError,
} from "../helpers";

describe("Authorization Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let attackerKeypair: Keypair;
  let attackerClient: VaultClient;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);

    // Create attacker wallet
    attackerKeypair = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      attackerKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    attackerClient = createUserClient(provider, attackerKeypair);
  });

  describe("Unauthorized - add_option", () => {
    it("rejects add_option from non-owner", async () => {
      // Owner creates vault
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint);

      // Attacker tries to add option
      const { builder } = await attackerClient.addOption(
        attackerKeypair.publicKey,
        ctx.vaultPda
      );
      await expectAnchorError(builder.rpc(), "Unauthorized");
    });
  });

  describe("Unauthorized - activate", () => {
    it("rejects activate from non-owner", async () => {
      // Owner creates vault
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint);

      // Attacker tries to activate
      await expectAnchorError(
        attackerClient.activate(attackerKeypair.publicKey, ctx.vaultPda).rpc(),
        "Unauthorized"
      );
    });
  });

  describe("Unauthorized - finalize", () => {
    it("rejects finalize from non-owner", async () => {
      // Owner creates and activates vault
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint);

      // Attacker tries to finalize
      await expectAnchorError(
        attackerClient.finalize(attackerKeypair.publicKey, ctx.vaultPda, 0).rpc(),
        "Unauthorized"
      );
    });
  });
});
