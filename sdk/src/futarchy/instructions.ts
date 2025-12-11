import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TWAPConfig } from "./types";

// =============================================================================
// Instruction Builders
// =============================================================================

export function initializeModerator(
  program: Program,
  payer: PublicKey,
  globalConfig: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  moderator: PublicKey
) {
  return program.methods.initializeModerator().accounts({
    payer,
    globalConfig,
    baseMint,
    quoteMint,
    moderator,
  });
}

export function initializeProposal(
  program: Program,
  signer: PublicKey,
  moderator: PublicKey,
  proposal: PublicKey,
  length: number,
  fee: number,
  twapConfig: {
    startingObservation: BN;
    maxObservationDelta: BN;
    warmupDuration: number;
  },
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .initializeProposal(length, fee, twapConfig)
    .accounts({
      signer,
      moderator,
      proposal,
    })
    .remainingAccounts(remainingAccounts);
}

export function addOption(
  program: Program,
  signer: PublicKey,
  proposal: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .addOption()
    .accounts({
      signer,
      proposal,
    })
    .remainingAccounts(remainingAccounts);
}

export function launchProposal(
  program: Program,
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
    .accounts({
      signer,
      proposal,
      vault,
    })
    .remainingAccounts(remainingAccounts);
}

export function finalizeProposal(
  program: Program,
  signer: PublicKey,
  proposal: PublicKey,
  vault: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .finalizeProposal()
    .accounts({
      signer,
      proposal,
      vault,
    })
    .remainingAccounts(remainingAccounts);
}

export function redeemLiquidity(
  program: Program,
  signer: PublicKey,
  proposal: PublicKey,
  vault: PublicKey,
  pool: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .redeemLiquidity()
    .accounts({
      signer,
      proposal,
      vault,
      pool,
    })
    .remainingAccounts(remainingAccounts);
}
