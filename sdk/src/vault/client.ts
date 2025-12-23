/*
 * High-level client for the Vault program.
 * Provides ergonomic methods for vault operations with automatic PDA derivation,
 * native SOL wrapping/unwrapping, and compute budget management.
 */

import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PROGRAM_ID } from "./constants";
import { Vault, VaultType, VaultAccount, VaultActionOptions } from "./types";
import {
  deriveVaultPDA,
  deriveConditionalMint,
  fetchVaultAccount,
} from "./utils";
import {
  initialize,
  addOption,
  activate,
  deposit,
  withdraw,
  finalize,
  redeemWinnings,
} from "./instructions";

import { VaultIDL } from "../generated/idls";

const DEFAULT_COMPUTE_UNITS = 450_000;

export class VaultClient {
  public program: Program<Vault>;
  public programId: PublicKey;
  public computeUnits: number;

  constructor(
    provider: AnchorProvider,
    programId?: PublicKey,
    computeUnits?: number
  ) {
    this.programId = programId ?? PROGRAM_ID;
    this.computeUnits = computeUnits ?? DEFAULT_COMPUTE_UNITS;
    this.program = new Program(VaultIDL as Vault, provider);
  }

  /* PDA Helpers */

  deriveVaultPDA(
    owner: PublicKey,
    nonce: number
  ): [PublicKey, number] {
    return deriveVaultPDA(owner, nonce, this.programId);
  }

  deriveConditionalMint(
    vaultPda: PublicKey,
    vaultType: VaultType,
    index: number
  ): [PublicKey, number] {
    return deriveConditionalMint(vaultPda, vaultType, index, this.programId);
  }

  /* State Fetching */

  async fetchVault(vaultPda: PublicKey): Promise<VaultAccount> {
    return fetchVaultAccount(this.program, vaultPda);
  }

  async fetchUserATAs(vaultPda: PublicKey, user: PublicKey, vaultType: VaultType) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint.address : vault.quoteMint.address;
    const condMints = (vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints)
      .slice(0, vault.numOptions);
    return {
      userAta: getAssociatedTokenAddressSync(mint, user),
      userCondATAs: condMints.map((m) => getAssociatedTokenAddressSync(m, user)),
    };
  }

  async fetchVaultATA(vaultPda: PublicKey, vaultType: VaultType) {
    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint.address : vault.quoteMint.address;
    return getAssociatedTokenAddressSync(mint, vaultPda, true);
  }

  async fetchUserBalances(vaultPda: PublicKey, user: PublicKey, vaultType: VaultType) {
    const { userAta, userCondATAs } = await this.fetchUserATAs(vaultPda, user, vaultType);
    const connection = this.program.provider.connection;

    const getBalanceSafe = async (ata: PublicKey) => {
      try {
        const acc = await getAccount(connection, ata);
        return new BN(acc.amount.toString());
      } catch (e) {
        if (e instanceof TokenAccountNotFoundError) {
          return new BN(0);
        }
        throw e;
      }
    };

    const [userBalance, ...condBalances] = await Promise.all([
      getBalanceSafe(userAta),
      ...userCondATAs.map(getBalanceSafe),
    ]);

    return { userBalance, condBalances };
  }

  async fetchVaultBalance(vaultPda: PublicKey, vaultType: VaultType): Promise<BN> {
    const vaultAta = await this.fetchVaultATA(vaultPda, vaultType);
    try {
      const acc = await getAccount(this.program.provider.connection, vaultAta);
      return new BN(acc.amount.toString());
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) {
        return new BN(0);
      }
      throw e;
    }
  }

  /* Instruction Builders */

  initialize(
    payer: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    nonce: number,
    owner?: PublicKey
  ) {
    const vaultOwner = owner ?? payer;
    const [vaultPda] = this.deriveVaultPDA(vaultOwner, nonce);
    const [condBaseMint0] = this.deriveConditionalMint(vaultPda, VaultType.Base, 0);
    const [condBaseMint1] = this.deriveConditionalMint(vaultPda, VaultType.Base, 1);
    const [condQuoteMint0] = this.deriveConditionalMint(vaultPda, VaultType.Quote, 0);
    const [condQuoteMint1] = this.deriveConditionalMint(vaultPda, VaultType.Quote, 1);

    const builder = initialize(
      this.program,
      payer,
      vaultOwner,
      vaultPda,
      baseMint,
      quoteMint,
      condBaseMint0,
      condBaseMint1,
      condQuoteMint0,
      condQuoteMint1,
      nonce
    );

    return {
      builder,
      vaultPda,
      condBaseMint0,
      condBaseMint1,
      condQuoteMint0,
      condQuoteMint1,
    };
  }

  async addOption(payer: PublicKey, owner: PublicKey, vaultPda: PublicKey) {
    const vault = await this.fetchVault(vaultPda);
    const [condBaseMint] = this.deriveConditionalMint(vaultPda, VaultType.Base, vault.numOptions);
    const [condQuoteMint] = this.deriveConditionalMint(vaultPda, VaultType.Quote, vault.numOptions);

    const builder = addOption(
      this.program,
      payer,
      owner,
      vaultPda,
      condBaseMint,
      condQuoteMint
    );

    return { builder, condBaseMint, condQuoteMint };
  }

  activate(payer: PublicKey, owner: PublicKey, vaultPda: PublicKey) {
    return activate(this.program, payer, owner, vaultPda);
  }

  async deposit(
    signer: PublicKey,
    vaultPda: PublicKey,
    vaultType: VaultType,
    amount: BN | number,
    options?: VaultActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint.address : vault.quoteMint.address;
    const condMints = (vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints)
      .slice(0, vault.numOptions);

    const builder = deposit(
      this.program,
      signer,
      vaultPda,
      mint,
      condMints,
      vaultType,
      amount
    );

    const preIxs: ReturnType<typeof ComputeBudgetProgram.setComputeUnitLimit>[] = [];

    if (includeCuBudget) {
      preIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        })
      );
    }

    if (autoWrapUnwrap && mint.equals(NATIVE_MINT)) {
      const amountBN = typeof amount === "number" ? new BN(amount) : amount;
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          signer,
          wsolAta,
          signer,
          NATIVE_MINT
        ),
        SystemProgram.transfer({
          fromPubkey: signer,
          toPubkey: wsolAta,
          lamports: BigInt(amountBN.toString()),
        }),
        createSyncNativeInstruction(wsolAta)
      );
    }

    return preIxs.length > 0 ? builder.preInstructions(preIxs) : builder;
  }

  async withdraw(
    signer: PublicKey,
    vaultPda: PublicKey,
    vaultType: VaultType,
    amount: BN | number,
    options?: VaultActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint.address : vault.quoteMint.address;
    const condMints = (vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints)
      .slice(0, vault.numOptions);

    let builder = withdraw(
      this.program,
      signer,
      vaultPda,
      mint,
      condMints,
      vaultType,
      amount
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    if (autoWrapUnwrap && mint.equals(NATIVE_MINT)) {
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      builder = builder.postInstructions([
        createCloseAccountInstruction(wsolAta, signer, signer),
      ]);
    }

    return builder;
  }

  finalize(payer: PublicKey, owner: PublicKey, vaultPda: PublicKey, winningIdx: number) {
    return finalize(this.program, payer, owner, vaultPda, winningIdx);
  }

  async redeemWinnings(
    signer: PublicKey,
    vaultPda: PublicKey,
    vaultType: VaultType,
    options?: VaultActionOptions
  ) {
    const { autoWrapUnwrap = true, includeCuBudget = true, computeUnits } = options ?? {};

    const vault = await this.fetchVault(vaultPda);
    const mint = vaultType === VaultType.Base ? vault.baseMint.address : vault.quoteMint.address;
    const condMints = (vaultType === VaultType.Base ? vault.condBaseMints : vault.condQuoteMints)
      .slice(0, vault.numOptions);

    let builder = redeemWinnings(
      this.program,
      signer,
      vaultPda,
      mint,
      condMints,
      vaultType
    );

    if (includeCuBudget) {
      builder = builder.preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits ?? this.computeUnits,
        }),
      ]);
    }

    if (autoWrapUnwrap && mint.equals(NATIVE_MINT)) {
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, signer);
      builder = builder.postInstructions([
        createCloseAccountInstruction(wsolAta, signer, signer),
      ]);
    }

    return builder;
  }
}
