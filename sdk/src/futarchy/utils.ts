/*
 * Utility functions for the Futarchy program.
 * Includes PDA derivation, parsers, and fetch helpers.
 */

import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { DAO_SEED, MODERATOR_SEED, PROPOSAL_SEED, MINT_CREATE_KEY_SEED, PROGRAM_ID } from "./constants";
import { Futarchy, DAOAccount, ModeratorAccount, ProposalAccount, ProposalState } from "./types";

/* PDA Derivation */

export function deriveDAOPDA(
  name: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DAO_SEED, Buffer.from(name)],
    programId
  );
}

export function deriveModeratorPDA(
  name: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MODERATOR_SEED, Buffer.from(name)],
    programId
  );
}

export function deriveProposalPDA(
  moderator: PublicKey,
  proposalId: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const proposalIdBuffer = Buffer.alloc(2);
  proposalIdBuffer.writeUInt16LE(proposalId);
  return PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, moderator.toBuffer(), proposalIdBuffer],
    programId
  );
}

export function deriveMintCreateKeyPDA(
  daoPda: PublicKey,
  name: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [daoPda.toBuffer(), MINT_CREATE_KEY_SEED, Buffer.from(name)],
    programId
  );
}

/* Parsers */

export function parseProposalState(state: any): { state: ProposalState; winningIdx: number | null } {
  if ("setup" in state) {
    return { state: ProposalState.Setup, winningIdx: null };
  }
  if ("pending" in state) {
    return { state: ProposalState.Pending, winningIdx: null };
  }
  if ("resolved" in state) {
    const winningIdx = state.resolved[0] ?? state.resolved;
    return { state: ProposalState.Resolved, winningIdx };
  }
  throw new Error("Unknown proposal state");
}

/* Fetchers */

export async function fetchDAOAccount(
  program: Program<Futarchy>,
  daoPda: PublicKey
): Promise<DAOAccount> {
  return program.account.daoAccount.fetch(daoPda);
}

export async function fetchModeratorAccount(
  program: Program<Futarchy>,
  moderatorPda: PublicKey
): Promise<ModeratorAccount> {
  return program.account.moderatorAccount.fetch(moderatorPda);
}

export async function fetchProposalAccount(
  program: Program<Futarchy>,
  proposalPda: PublicKey
): Promise<ProposalAccount> {
  return program.account.proposalAccount.fetch(proposalPda);
}

/* Proposal Helpers */

export function isProposalExpired(proposal: ProposalAccount, currentTime?: number): boolean {
  const now = currentTime ?? Math.floor(Date.now() / 1000);
  const endTime = proposal.createdAt.toNumber() + proposal.config.length;
  return now >= endTime;
}

export function getTimeRemaining(proposal: ProposalAccount, currentTime?: number): number {
  const now = currentTime ?? Math.floor(Date.now() / 1000);
  const endTime = proposal.createdAt.toNumber() + proposal.config.length;
  return Math.max(0, endTime - now);
}
