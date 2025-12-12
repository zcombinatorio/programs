import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Vault, VaultType } from "./types";

// =============================================================================
// Instruction Builders
// =============================================================================

export function initialize(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  condBaseMint0: PublicKey,
  condBaseMint1: PublicKey,
  condQuoteMint0: PublicKey,
  condQuoteMint1: PublicKey,
  nonce: number
) {
  return program.methods.initialize(nonce).accountsPartial({
    signer,
    vault: vaultPda,
    baseMint,
    quoteMint,
    condBaseMint0,
    condBaseMint1,
    condQuoteMint0,
    condQuoteMint1,
  });
}

export function addOption(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  condBaseMint: PublicKey,
  condQuoteMint: PublicKey
) {
  return program.methods.addOption().accountsPartial({
    signer,
    vault: vaultPda,
    baseMint,
    quoteMint,
    condBaseMint,
    condQuoteMint,
  });
}

export function activate(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey
) {
  return program.methods.activate().accountsPartial({
    signer,
    vault: vaultPda,
  });
}

export function deposit(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMints: PublicKey[],
  vaultType: VaultType,
  amount: BN | number
) {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;
  const vaultTypeArg = vaultType === VaultType.Base ? { base: {} } : { quote: {} };

  return program.methods
    .deposit(vaultTypeArg, amountBN)
    .accountsPartial({
      signer,
      vault: vaultPda,
      mint,
    })
    .remainingAccounts(
      condMints.flatMap((condMint) => [
        { pubkey: condMint, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(condMint, signer),
          isSigner: false,
          isWritable: true,
        },
      ])
    );
}

export function withdraw(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMints: PublicKey[],
  vaultType: VaultType,
  amount: BN | number
) {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;
  const vaultTypeArg = vaultType === VaultType.Base ? { base: {} } : { quote: {} };

  return program.methods
    .withdraw(vaultTypeArg, amountBN)
    .accountsPartial({
      signer,
      vault: vaultPda,
      mint,
    })
    .remainingAccounts(
      condMints.flatMap((condMint) => [
        { pubkey: condMint, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(condMint, signer),
          isSigner: false,
          isWritable: true,
        },
      ])
    );
}

export function finalize(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey,
  winningIdx: number
) {
  return program.methods.finalize(winningIdx).accountsPartial({
    signer,
    vault: vaultPda,
  });
}

export function redeemWinnings(
  program: Program<Vault>,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMints: PublicKey[],
  vaultType: VaultType
) {
  const vaultTypeArg = vaultType === VaultType.Base ? { base: {} } : { quote: {} };

  return program.methods
    .redeemWinnings(vaultTypeArg)
    .accountsPartial({
      signer,
      vault: vaultPda,
      mint,
    })
    .remainingAccounts(
      condMints.flatMap((condMint) => [
        { pubkey: condMint, isSigner: false, isWritable: true },
        {
          pubkey: getAssociatedTokenAddressSync(condMint, signer),
          isSigner: false,
          isWritable: true,
        },
      ])
    );
}
