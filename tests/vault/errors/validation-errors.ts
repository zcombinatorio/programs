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
  sendWithComputeBudget,
  expectAnchorError,
  expectError,
} from "../helpers";

describe("Validation Errors", () => {
  const { provider, wallet, client } = getTestContext();

  let mint: PublicKey;

  before(async () => {
    mint = await createTestMint(provider, wallet);
    await fundOwnerWallet(provider, wallet, mint);
  });

  // ==========================================================================
  // SDK-Level Tests (simpler)
  // ==========================================================================

  describe("InvalidAmount", () => {
    it("rejects deposit with zero amount", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint);

      const builder = await client.deposit(wallet.publicKey, ctx.vaultPda, 0);
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidAmount"
      );
    });

    it("rejects withdraw with zero amount", async () => {
      const ctx = await createVaultWithDeposit(client, wallet, mint, DEPOSIT_AMOUNT);

      const builder = await client.withdraw(wallet.publicKey, ctx.vaultPda, 0);
      await expectAnchorError(
        sendWithComputeBudget(builder, client, wallet, ctx.numOptions),
        "InvalidAmount"
      );
    });
  });

  describe("OptionLimitReached", () => {
    it("rejects adding 11th option (exceeds MAX_OPTIONS)", async () => {
      // Create vault with max options (10)
      const ctx = await createVaultInSetupState(client, wallet, mint, {
        numOptions: 10,
      });

      // Try to add one more
      const { builder } = await client.addOption(wallet.publicKey, ctx.vaultPda);
      await expectAnchorError(builder.rpc(), "OptionLimitReached");
    });
  });

  describe("IndexOutOfBounds", () => {
    it("rejects finalize with winning_idx >= num_options", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions: 3,
      });

      // Try to finalize with index 3 (only 0, 1, 2 are valid)
      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 3).rpc(),
        "IndexOutOfBounds"
      );
    });

    it("rejects finalize with winning_idx = 255 (max u8)", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint);

      await expectAnchorError(
        client.finalize(wallet.publicKey, ctx.vaultPda, 255).rpc(),
        "IndexOutOfBounds"
      );
    });

    it("allows finalize with valid winning_idx = num_options - 1", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
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
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions: 3,
      });

      const vault = await client.fetchVault(ctx.vaultPda);

      // Provide only 1 pair instead of 3 (for 3 options)
      const builder = client.program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.mint,
        })
        .remainingAccounts([
          { pubkey: vault.condMints[0], isSigner: false, isWritable: true },
          {
            pubkey: getAssociatedTokenAddressSync(
              vault.condMints[0],
              wallet.publicKey
            ),
            isSigner: false,
            isWritable: true,
          },
        ]);

      await expectAnchorError(builder.rpc(), "InvalidNumberOfAccounts");
    });

    it("rejects deposit with too many remaining accounts", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const fakeMint = Keypair.generate().publicKey;

      // Provide 3 pairs instead of 2
      const accounts = vault.condMints.flatMap((m) => [
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
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.mint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidNumberOfAccounts");
    });
  });

  describe("InvalidConditionalMint (low-level)", () => {
    it("rejects deposit with wrong conditional mint", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const fakeMint = Keypair.generate().publicKey;

      // Replace first condMint with fake
      const accounts = [
        { pubkey: fakeMint, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(fakeMint, wallet.publicKey),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: vault.condMints[1], isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(
            vault.condMints[1],
            wallet.publicKey
          ),
          isSigner: false,
          isWritable: true,
        },
      ];

      const builder = client.program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.mint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidConditionalMint");
    });

    it("rejects deposit with swapped conditional mint order", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);

      // Swap order: mint1, mint0 instead of mint0, mint1
      const accounts = [
        { pubkey: vault.condMints[1], isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(
            vault.condMints[1],
            wallet.publicKey
          ),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: vault.condMints[0], isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(
            vault.condMints[0],
            wallet.publicKey
          ),
          isSigner: false,
          isWritable: true,
        },
      ];

      const builder = client.program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.mint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidConditionalMint");
    });
  });

  describe("InvalidUserAta (low-level)", () => {
    it("rejects deposit with wrong user's ATA", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
        numOptions: 2,
      });

      const vault = await client.fetchVault(ctx.vaultPda);
      const wrongUser = Keypair.generate().publicKey;

      // Provide ATAs for wrong user
      const accounts = vault.condMints.flatMap((m) => [
        { pubkey: m, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(m, wrongUser),
          isSigner: false,
          isWritable: true,
        },
      ]);

      const builder = client.program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx.vaultPda,
          mint: vault.mint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidUserAta");
    });

    it("rejects withdraw when user has no conditional token ATAs", async () => {
      const ctx = await createVaultInActiveState(client, wallet, mint, {
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
        DEPOSIT_AMOUNT
      );

      // Should fail - either InvalidUserAta or some other ATA-related error
      await expectError(builder.rpc());
    });
  });

  describe("Cross-Vault Security (low-level)", () => {
    it("rejects deposit using conditional mints from different vault", async () => {
      // Create two vaults
      const ctx1 = await createVaultInActiveState(client, wallet, mint, {
        nonce: 60,
        proposalId: 60,
      });
      const ctx2 = await createVaultInActiveState(client, wallet, mint, {
        nonce: 61,
        proposalId: 61,
      });

      const vault1 = await client.fetchVault(ctx1.vaultPda);

      // Try to use vault1's conditional mints with vault2
      const accounts = vault1.condMints.flatMap((m) => [
        { pubkey: m, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(m, wallet.publicKey),
          isSigner: false,
          isWritable: true,
        },
      ]);

      const builder = client.program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          signer: wallet.publicKey,
          vault: ctx2.vaultPda, // Different vault!
          mint: vault1.mint,
        })
        .remainingAccounts(accounts);

      await expectAnchorError(builder.rpc(), "InvalidConditionalMint");
    });
  });

  describe("Withdraw More Than Balance", () => {
    it("rejects withdrawing more tokens than deposited", async () => {
      const ctx = await createVaultWithDeposit(client, wallet, mint, DEPOSIT_AMOUNT);

      // Try to withdraw more than deposited
      const builder = await client.withdraw(
        wallet.publicKey,
        ctx.vaultPda,
        DEPOSIT_AMOUNT + 1
      );

      // Should fail at token burn level (insufficient balance)
      await expectError(builder.rpc(), "insufficient");
    });
  });
});
