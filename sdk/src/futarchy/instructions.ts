/*
 * Low-level instruction builders for the Futarchy program.
 * These are thin wrappers around the program methods - use FutarchyClient for higher-level operations.
 */

import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Futarchy, ProposalParams, PoolType } from "./types";

/* Instruction Builders */

export function initializeModerator(
  program: Program<Futarchy>,
  admin: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  moderator: PublicKey,
  name: string
) {
  return program.methods.initializeModerator(name).accountsPartial({
    admin,
    baseMint,
    quoteMint,
    moderator,
  });
}

export function initializeProposal(
  program: Program<Futarchy>,
  creator: PublicKey,
  moderator: PublicKey,
  proposal: PublicKey,
  proposalParams: ProposalParams,
  metadata: string | null,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .initializeProposal(proposalParams, metadata)
    .accountsPartial({
      creator,
      moderator,
      proposal,
    })
    .remainingAccounts(remainingAccounts);
}

export function addOption(
  program: Program<Futarchy>,
  creator: PublicKey,
  proposal: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .addOption()
    .accountsPartial({
      creator,
      proposal,
    })
    .remainingAccounts(remainingAccounts);
}

export function launchProposal(
  program: Program<Futarchy>,
  creator: PublicKey,
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
      creator,
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
  creator: PublicKey,
  proposal: PublicKey,
  vault: PublicKey,
  pool: PublicKey,
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
) {
  return program.methods
    .redeemLiquidity()
    .accountsPartial({
      creator,
      proposal,
      vault,
      pool,
    })
    .remainingAccounts(remainingAccounts);
}

export function addHistoricalProposal(
  program: Program<Futarchy>,
  admin: PublicKey,
  moderator: PublicKey,
  proposal: PublicKey,
  numOptions: number,
  winningIdx: number,
  length: number,
  createdAt: BN | number
) {
  const createdAtBN = typeof createdAt === "number" ? new BN(createdAt) : createdAt;
  return program.methods
    .addHistoricalProposal(numOptions, winningIdx, length, createdAtBN)
    .accountsPartial({
      admin,
      moderator,
      proposal,
    });
}

/* DAO Instruction Builders */

export function initializeParentDAO(
  program: Program<Futarchy>,
  admin: PublicKey,
  parentAdmin: PublicKey,
  dao: PublicKey,
  moderator: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programConfig: PublicKey,
  programConfigTreasury: PublicKey,
  treasuryMultisig: PublicKey,
  mintMultisig: PublicKey,
  mintCreateKey: PublicKey,
  squadsProgram: PublicKey,
  name: string,
  treasuryCosigner: PublicKey,
  pool: PublicKey,
  poolType: PoolType
) {
  return program.methods
    .initializeParentDao(name, treasuryCosigner, pool, poolType)
    .accountsPartial({
      admin,
      parentAdmin,
      dao,
      moderator,
      baseMint,
      quoteMint,
      programConfig,
      programConfigTreasury,
      treasuryMultisig,
      mintMultisig,
      mintCreateKey,
      squadsProgram,
    });
}

export function initializeChildDAO(
  program: Program<Futarchy>,
  admin: PublicKey,
  parentAdmin: PublicKey,
  dao: PublicKey,
  parentDao: PublicKey,
  tokenMint: PublicKey,
  programConfig: PublicKey,
  programConfigTreasury: PublicKey,
  treasuryMultisig: PublicKey,
  mintMultisig: PublicKey,
  mintCreateKey: PublicKey,
  squadsProgram: PublicKey,
  name: string,
  treasuryCosigner: PublicKey
) {
  return program.methods
    .initializeChildDao(name, treasuryCosigner)
    .accountsPartial({
      admin,
      parentAdmin,
      dao,
      parentDao,
      tokenMint,
      programConfig,
      programConfigTreasury,
      treasuryMultisig,
      mintMultisig,
      mintCreateKey,
      squadsProgram,
    });
}

export function upgradeDAO(
  program: Program<Futarchy>,
  admin: PublicKey,
  parentAdmin: PublicKey,
  dao: PublicKey,
  parentDao: PublicKey,
  moderator: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  pool: PublicKey,
  poolType: PoolType
) {
  return program.methods
    .upgradeDao(pool, poolType)
    .accountsPartial({
      admin,
      parentAdmin,
      dao,
      parentDao,
      moderator,
      baseMint,
      quoteMint,
    });
}
