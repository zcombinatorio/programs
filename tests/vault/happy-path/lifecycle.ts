import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import { VaultClient, VaultType, VaultState } from "../../../sdk/src";
import {
  OPTION_COUNTS,
  DEPOSIT_AMOUNT,
  getTestContext,
  createTestMint,
  fundOwnerWallet,
  createVaultInSetupState,
  sendAndLog,
  expectVaultState,
  expectNumOptions,
  expectCondBalances,
  expectVaultBalance,
  expectWinningIndex,
  resetCounters,
} from "../helpers";

describe("Vault Lifecycle", () => {
  const { provider, wallet, client } = getTestContext();

  // Parameterized tests for each option count
  OPTION_COUNTS.forEach((numOptions) => {
    describe(`with ${numOptions} options`, () => {
      let baseMint: PublicKey;
      let quoteMint: PublicKey;
      let vaultPda: PublicKey;
      let condBaseMints: PublicKey[];
      let condQuoteMints: PublicKey[];
      const nonce = numOptions; // Use numOptions as unique nonce (2 or 10)
      const proposalId = numOptions; // Same as nonce for unique PDA per test

      before(async () => {
        // Create fresh mints for this test suite
        baseMint = await createTestMint(provider, wallet);
        quoteMint = await createTestMint(provider, wallet);
        await fundOwnerWallet(provider, wallet, baseMint);
        await fundOwnerWallet(provider, wallet, quoteMint);

        // Initialize vault
        const {
          builder,
          vaultPda: pda,
          condBaseMint0,
          condBaseMint1,
          condQuoteMint0,
          condQuoteMint1,
        } = client.initialize(
          wallet.publicKey,
          baseMint,
          quoteMint,
          nonce,
          proposalId
        );
        await builder.rpc();
        vaultPda = pda;
        condBaseMints = [condBaseMint0, condBaseMint1];
        condQuoteMints = [condQuoteMint0, condQuoteMint1];

        // Add additional options to reach target
        for (let i = 2; i < numOptions; i++) {
          const { builder: addBuilder, condBaseMint, condQuoteMint } =
            await client.addOption(wallet.publicKey, vaultPda);
          await addBuilder.rpc();
          condBaseMints.push(condBaseMint);
          condQuoteMints.push(condQuoteMint);
        }
      });

      describe("Setup Phase", () => {
        it("verifies vault initialized with correct options", async () => {
          const vault = await client.fetchVault(vaultPda);
          expect(vault.owner.toBase58()).to.equal(wallet.publicKey.toBase58());
          expect(vault.baseMint.toBase58()).to.equal(baseMint.toBase58());
          expect(vault.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
          expect(vault.numOptions).to.equal(numOptions);
          expect(vault.state).to.equal("setup");
          expect(vault.nonce).to.equal(nonce);
          expect(vault.proposalId).to.equal(proposalId);
        });

        it("activates vault", async () => {
          await client.activate(wallet.publicKey, vaultPda).rpc();
          await expectVaultState(client, vaultPda, VaultState.Active);
        });
      });

      describe("Active Phase", () => {
        it("deposits and receives conditional tokens", async () => {
          const { userBalance: initialBalance } = await client.fetchUserBalances(
            vaultPda,
            wallet.publicKey,
            VaultType.Base
          );

          const builder = await client.deposit(
            wallet.publicKey,
            vaultPda,
            VaultType.Base,
            DEPOSIT_AMOUNT
          );
          await sendAndLog(builder, client, wallet);

          // Verify user received conditional tokens for all options
          await expectCondBalances(
            client,
            vaultPda,
            wallet.publicKey,
            VaultType.Base,
            Array(numOptions).fill(DEPOSIT_AMOUNT)
          );

          // Verify vault received the tokens
          await expectVaultBalance(client, vaultPda, VaultType.Base, DEPOSIT_AMOUNT);
        });

        it("withdraws partial amount", async () => {
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
        });

        it("deposits additional amount", async () => {
          const additionalDeposit = DEPOSIT_AMOUNT / 4;

          const builder = await client.deposit(
            wallet.publicKey,
            vaultPda,
            VaultType.Base,
            additionalDeposit
          );
          await sendAndLog(builder, client, wallet);

          const expectedBalance = DEPOSIT_AMOUNT / 2 + additionalDeposit;
          await expectCondBalances(
            client,
            vaultPda,
            wallet.publicKey,
            VaultType.Base,
            Array(numOptions).fill(expectedBalance)
          );
          await expectVaultBalance(client, vaultPda, VaultType.Base, expectedBalance);
        });
      });

      describe("Finalization Phase", () => {
        const winningIdx = 0;

        it("finalizes vault with winning option", async () => {
          await client.finalize(wallet.publicKey, vaultPda, winningIdx).rpc();

          await expectVaultState(client, vaultPda, VaultState.Finalized);
          await expectWinningIndex(client, vaultPda, winningIdx);
        });

        it("redeems winnings", async () => {
          const { userBalance: initialBalance, condBalances } =
            await client.fetchUserBalances(vaultPda, wallet.publicKey, VaultType.Base);
          const winningAmount = condBalances[winningIdx];

          const builder = await client.redeemWinnings(
            wallet.publicKey,
            vaultPda,
            VaultType.Base
          );
          await sendAndLog(builder, client, wallet);

          const { userBalance: finalBalance } = await client.fetchUserBalances(
            vaultPda,
            wallet.publicKey,
            VaultType.Base
          );

          // User should receive their winning token balance
          expect(finalBalance - initialBalance).to.equal(winningAmount);

          // Vault should be empty
          await expectVaultBalance(client, vaultPda, VaultType.Base, 0);
        });
      });
    });
  });
});
