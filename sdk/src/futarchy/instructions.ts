import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Futarchy, TWAPConfig } from "./types";

// =============================================================================
// Instruction Builders
// =============================================================================

export function initializeModerator(
  program: Program<Futarchy>,
  payer: PublicKey,
  globalConfig: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  moderator: PublicKey
) {
  return program.methods.initializeModerator().accountsPartial({
    payer,
    globalConfig,
    baseMint,
    quoteMint,
    moderator,
  });
}

export function initializeProposal(
  program: Program<Futarchy>,
  signer: PublicKey,
  moderator: PublicKey,
  proposal: PublicKey,
  length: number,
  fee: number,
  twapConfig: TWAPConfig,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .initializeProposal(length, fee, twapConfig)
    .accountsPartial({
      signer,
      moderator,
      proposal,
    })
    .remainingAccounts(remainingAccounts);
}

export function addOption(
  program: Program<Futarchy>,
  signer: PublicKey,
  proposal: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .addOption()
    .accountsPartial({
      signer,
      proposal,
    })
    .remainingAccounts(remainingAccounts);
}

export function launchProposal(
  program: Program<Futarchy>,
  signer: PublicKey,
  proposal: PublicKey,
  vault: PublicKey,
  baseAmount: BN | number,
  quoteAmount: BN | number,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  const baseAmountBN = typeof baseAmount === "number" ? new BN(baseAmount) : baseAmount;
  const quoteAmountBN = typeof quoteAmount === "number" ? new BN(quoteAmount) : quoteAmount;

  return program.methods
    .launchProposal(baseAmountBN, quoteAmountBN)
    .accountsPartial({
      signer,
      proposal,
      vault,
    })
    .remainingAccounts(remainingAccounts);
}

export function finalizeProposal(
  program: Program<Futarchy>,
  signer: PublicKey,
  proposal: PublicKey,
  vault: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .finalizeProposal()
    .accountsPartial({
      signer,
      proposal,
      vault,
    })
    .remainingAccounts(remainingAccounts);
}

export function redeemLiquidity(
  program: Program<Futarchy>,
  signer: PublicKey,
  proposal: PublicKey,
  vault: PublicKey,
  pool: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .redeemLiquidity()
    .accountsPartial({
      signer,
      proposal,
      vault,
      pool,
    })
    .remainingAccounts(remainingAccounts);
}
