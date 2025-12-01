import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { VaultType } from "./types";
import { getAssociatedTokenAddressSync } from "./utils";

// =============================================================================
// Instruction Builders
// =============================================================================

export function initialize(
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMint0: PublicKey,
  condMint1: PublicKey,
  vaultType: VaultType,
  proposalId: number
) {
  const vaultTypeArg =
    vaultType === VaultType.Base ? { base: {} } : { quote: {} };

  return program.methods.initialize(vaultTypeArg, proposalId).accounts({
    signer,
    vault: vaultPda,
    mint,
    condMint0,
    condMint1,
  });
}

export function addOption(
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMint: PublicKey
) {
  return program.methods.addOption().accounts({
    signer,
    vault: vaultPda,
    mint,
    condMint,
  });
}

export function activate(
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey
) {
  return program.methods.activate().accounts({
    signer,
    vault: vaultPda,
  });
}

export function deposit(
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMints: PublicKey[],
  amount: BN | number
) {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;

  return program.methods
    .deposit(amountBN)
    .accounts({
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
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMints: PublicKey[],
  amount: BN | number
) {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;

  return program.methods
    .withdraw(amountBN)
    .accounts({
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
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey,
  winningIdx: number
) {
  return program.methods.finalize(winningIdx).accounts({
    signer,
    vault: vaultPda,
  });
}

export function redeemWinnings(
  program: Program,
  signer: PublicKey,
  vaultPda: PublicKey,
  mint: PublicKey,
  condMints: PublicKey[]
) {
  return program.methods
    .redeemWinnings()
    .accounts({
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
