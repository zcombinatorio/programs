import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { expect } from "chai";

import { VaultClient, VaultType } from "../../../sdk/src";
import {
  DEPOSIT_AMOUNT,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createVaultInSetupState,
  createVaultInActiveState,
  createVaultWithDeposit,
  sendAndLog,
  expectAnchorError,
  expectError,
} from "../helpers";

describe("Validation Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let baseMint: PublicKey;
  let quoteMint: PublicKey;

  before(async () => {
    baseMint = await createTestMint(provider, wallet);
    quoteMint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, baseMint);
    await fundOwnerWallet(provider, wallet, quoteMint);
  });

  // ==========================================================================
  // SDK-Level Tests (simpler)
  // ==========================================================================

  describe("InvalidAmount", () => {
    it("rejects deposit with zero amount", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint);

      const builder = await client.deposit(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        0
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidAmount"
      );
    });

    it("rejects withdraw with zero amount", async () => {
      const ctx = await createVaultWithDeposit(
        client,
        wallet,
        baseMint,
        quoteMint,
        DEPOSIT_AMOUNT,
        VaultType.Base
      );

      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        0
      );
      await expectAnchorError(
        sendAndLog(builder, client, wallet),
        "InvalidAmount"
      );
    });
  });

  describe("OptionLimitReached", () => {
    it("rejects adding 9th option (exceeds MAX_OPTIONS of 8)", async () => {
      // Create vault with max options (8)
      const ctx = await createVaultInSetupState(client, wallet, baseMint, quoteMint, {
        numOptions: 8,
      });

      // Try to add one more
      const { builder } = await client.addOption(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(builder.rpc(), "OptionLimitReached");
    });
  });

  describe("IndexOutOfBounds", () => {
    it("rejects finalize with winning_idx >= num_options", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 3,
      });

      // Try to finalize with index 3 (only 0, 1, 2 are valid)
      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 3).rpc(),
        "IndexOutOfBounds"
      );
    });

    it("rejects finalize with winning_idx = 255 (max u8)", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint);

      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 255).rpc(),
        "IndexOutOfBounds"
      );
    });

    it("allows finalize with valid winning_idx = num_options - 1", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 5,
      });

      // Index 4 should be valid for 5 options
      await client.finalize(wallet.publicKey, ctx.vaultPda, 4).rpc();

      const vault = await client.fetchVault(ctx.vaultPda);
      expect(vault.winningIdx).to.equal(4);
    });
  });

  // ==========================================================================
  // Low-Level Tests (crafted transactions for edge cases)
  // ==========================================================================

  describe("InvalidNumberOfAccounts (low-level)", () => {
    it("rejects deposit with too few remaining accounts", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 3,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const vaultTypeArg = { base: {} };

      // Provide only 1 pair instead of 3 (for 3 options)
      const builder = client.program.methods
        .deposit(vaultTypeArg, new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.baseMint,
        })
        .remainingAccounts([
          { pubkey: vault.condBaseMints[0], isSigner: false, isWritable: true },
          {
            pubkey: getAssociatedTokenAddressSync(
              vault.condBaseMints[0],
              wallet.publicKey
            ),
            isSigner: false,
            isWritable: true,
          },
        ]);

      await expectAnchorError(builder.rpc(), "InvalidNumberOfAccounts");
    });

    it("rejects deposit with too many remaining accounts", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const fakeMint = Keypair.generate().publicKey;
      const vaultTypeArg = { base: {} };

      // Provide 3 pairs instead of 2
      const accounts = vault.condBaseMints.flatMap((m) => [
        { pubkey: m, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(m, wallet.publicKey),
          isSigner: false,
          isWritable: true,
        },
      ]);
      // Add extra pair
      accounts.push({ pubkey: fakeMint, isSigner: false, isWritable: true });
      accounts.push({
        pubkey: getAssociatedTokenAddressSync(fakeMint, wallet.publicKey),
        isSigner: false,
        isWritable: true,
      });

      const builder = client.program.methods
        .deposit(vaultTypeArg, new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.baseMint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidNumberOfAccounts");
    });
  });

  describe("InvalidConditionalMint (low-level)", () => {
    it("rejects deposit with wrong conditional mint", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const fakeMint = Keypair.generate().publicKey;
      const vaultTypeArg = { base: {} };

      // Replace first condMint with fake
      const accounts = [
        { pubkey: fakeMint, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(fakeMint, wallet.publicKey),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: vault.condBaseMints[1], isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(
            vault.condBaseMints[1],
            wallet.publicKey
          ),
          isSigner: false,
          isWritable: true,
        },
      ];

      const builder = client.program.methods
        .deposit(vaultTypeArg, new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.baseMint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidConditionalMint");
    });

    it("rejects deposit with swapped conditional mint order", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const vaultTypeArg = { base: {} };

      // Swap order: mint1, mint0 instead of mint0, mint1
      const accounts = [
        { pubkey: vault.condBaseMints[1], isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(
            vault.condBaseMints[1],
            wallet.publicKey
          ),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: vault.condBaseMints[0], isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(
            vault.condBaseMints[0],
            wallet.publicKey
          ),
          isSigner: false,
          isWritable: true,
        },
      ];

      const builder = client.program.methods
        .deposit(vaultTypeArg, new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.baseMint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidConditionalMint");
    });
  });

  describe("InvalidUserAta (low-level)", () => {
    it("rejects deposit with wrong user's ATA", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const wrongUser = Keypair.generate().publicKey;
      const vaultTypeArg = { base: {} };

      // Provide ATAs for wrong user
      const accounts = vault.condBaseMints.flatMap((m) => [
        { pubkey: m, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(m, wrongUser),
          isSigner: false,
          isWritable: true,
        },
      ]);

      const builder = client.program.methods
        .deposit(vaultTypeArg, new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.baseMint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidUserAta");
    });

    it("rejects withdraw when user has no conditional token ATAs", async () => {
      const ctx = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        numOptions: 2,
      });

      // Create a new user who never deposited
      const newUserKeypair = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        newUserKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const newUserWallet = new anchor.Wallet(newUserKeypair);
      const newUserProvider = new anchor.AnchorProvider(
        provider.connection,
        newUserWallet,
        provider.opts
      );
      const newUserClient = new VaultClient(newUserProvider);

      // Try to withdraw (no ATAs exist)
      const builder = await newUserClient.withdraw(
        newUserKeypair.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT
      );

      // Should fail - either InvalidUserAta or some other ATA-related error
      await expectError(builder.rpc());
    });
  });

  describe("Cross-Vault Security (low-level)", () => {
    it("rejects deposit using conditional mints from different vault", async () => {
      // Create two vaults
      const ctx1 = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        nonce: 60,
        proposalId: 60,
      });
      const ctx2 = await createVaultInActiveState(client, wallet, baseMint, quoteMint, {
        nonce: 61,
        proposalId: 61,
      });

      const vault1 = await client.fetchVault(ctx1.vaultPda);
      const vaultTypeArg = { base: {} };

      // Try to use vault1's conditional mints with vault2
      const accounts = vault1.condBaseMints.flatMap((m) => [
        { pubkey: m, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(m, wallet.publicKey),
          isSigner: false,
          isWritable: true,
        },
      ]);

      const builder = client.program.methods
        .deposit(vaultTypeArg, new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx2.vaultPda, // Different vault!
          mint: vault1.baseMint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidConditionalMint");
    });
  });

  describe("Withdraw More Than Balance", () => {
    it("rejects withdrawing more tokens than deposited", async () => {
      const ctx = await createVaultWithDeposit(
        client,
        wallet,
        baseMint,
        quoteMint,
        DEPOSIT_AMOUNT,
        VaultType.Base
      );

      // Try to withdraw more than deposited
      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        VaultType.Base,
        DEPOSIT_AMOUNT + 1
      );

      // Should fail at token burn level (insufficient balance)
      await expectError(builder.rpc(), "insufficient");
    });
  });
});
