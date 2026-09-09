/*
 * Regression tests for the redemption program.
 *
 * The vault at nonce 1 for SURF was drained in Aug 2026 because `redeem` did not
 * tie the `base_mint` / `quote_mint` accounts to the ones recorded on the vault.
 * An attacker minted a worthless token and sold it to the vault at the real price;
 * the mirrored form (passing the real base token as `quote_mint`) drained the
 * collected tokens. The first two tests below are that exploit, both directions.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

const VAULT_SEED = Buffer.from("redemption");

const BASE_DECIMALS = 9;
const QUOTE_DECIMALS = 6;
const ONE_BASE = new BN(10).pow(new BN(BASE_DECIMALS));
const ONE_QUOTE = new BN(10).pow(new BN(QUOTE_DECIMALS));

// price is quote-per-base scaled by 10^base_decimals, so this is 2 quote per base.
const PRICE = ONE_QUOTE.muln(2);
const VAULT_DEPOSIT = ONE_QUOTE.muln(100);

function deriveVault(
  programId: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  nonce: number,
): PublicKey {
  const nonceBuffer = Buffer.alloc(2);
  nonceBuffer.writeUInt16LE(nonce);
  const [vault] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, baseMint.toBuffer(), quoteMint.toBuffer(), nonceBuffer],
    programId,
  );
  return vault;
}

/** Assert that `promise` fails with a specific Anchor error code. */
async function expectAnchorError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (err: any) {
    const text = [
      err?.error?.errorCode?.code,
      err?.message,
      ...(err?.logs ?? []),
    ]
      .filter(Boolean)
      .join("\n");
    if (!text.includes(code)) {
      console.error(`\n--- expected ${code}, got: ---\n${text}\n`);
    }
    expect(text).to.contain(code);
    return;
  }
  throw new Error(`expected the call to fail with ${code}, but it succeeded`);
}

describe("Redemption — mint validation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const idl = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "target/idl/redemption.json"), "utf-8"),
  );
  const program = new Program(idl, provider);

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let vault: PublicKey;
  let vaultBaseAta: PublicKey;
  let vaultQuoteAta: PublicKey;

  let user: Keypair;
  let userBaseAta: PublicKey;
  let userQuoteAta: PublicKey;

  const NONCE = 1;

  before(async () => {
    baseMint = await createMint(connection, wallet.payer, wallet.publicKey, null, BASE_DECIMALS);
    quoteMint = await createMint(connection, wallet.payer, wallet.publicKey, null, QUOTE_DECIMALS);

    vault = deriveVault(program.programId, baseMint, quoteMint, NONCE);
    vaultBaseAta = await getAssociatedTokenAddress(baseMint, vault, true);
    vaultQuoteAta = await getAssociatedTokenAddress(quoteMint, vault, true);

    // Admin funds itself with quote tokens, then opens the vault.
    const adminQuote = await getOrCreateAssociatedTokenAccount(
      connection, wallet.payer, quoteMint, wallet.publicKey,
    );
    await mintTo(
      connection, wallet.payer, quoteMint, adminQuote.address, wallet.publicKey,
      BigInt(VAULT_DEPOSIT.muln(10).toString()),
    );

    await program.methods
      .initialize(NONCE, PRICE, VAULT_DEPOSIT)
      .accountsPartial({
        admin: wallet.publicKey,
        baseMint,
        quoteMint,
        adminQuoteAta: adminQuote.address,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // A user holding 100 base tokens.
    user = Keypair.generate();
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: user.publicKey,
          lamports: 0.2 * LAMPORTS_PER_SOL,
        }),
      ),
    );
    const ub = await getOrCreateAssociatedTokenAccount(
      connection, wallet.payer, baseMint, user.publicKey,
    );
    userBaseAta = ub.address;
    await mintTo(
      connection, wallet.payer, baseMint, userBaseAta, wallet.publicKey,
      BigInt(ONE_BASE.muln(100).toString()),
    );
    userQuoteAta = await getAssociatedTokenAddress(quoteMint, user.publicKey);
  });

  /** Build a redeem call, letting the caller override the mints. */
  function redeem(
    baseAmount: BN,
    overrides: {
      baseMint?: PublicKey;
      quoteMint?: PublicKey;
      vaultBaseAta?: PublicKey;
      vaultQuoteAta?: PublicKey;
      userBaseAta?: PublicKey;
      userQuoteAta?: PublicKey;
    } = {},
  ) {
    return program.methods
      .redeem(baseAmount)
      .accountsPartial({
        user: user.publicKey,
        vault,
        baseMint: overrides.baseMint ?? baseMint,
        quoteMint: overrides.quoteMint ?? quoteMint,
        vaultQuoteAta: overrides.vaultQuoteAta ?? vaultQuoteAta,
        vaultBaseAta: overrides.vaultBaseAta ?? vaultBaseAta,
        userBaseAta: overrides.userBaseAta ?? userBaseAta,
        userQuoteAta: overrides.userQuoteAta ?? userQuoteAta,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
  }

  it("rejects a redeem whose base_mint is not the vault's base mint (the Aug 2026 exploit)", async () => {
    // Attacker mints a worthless token with matching decimals and opens both ATAs.
    const fakeMint = await createMint(
      connection, wallet.payer, wallet.publicKey, null, BASE_DECIMALS,
    );
    const attackerFakeAta = (
      await getOrCreateAssociatedTokenAccount(connection, wallet.payer, fakeMint, user.publicKey)
    ).address;
    await mintTo(
      connection, wallet.payer, fakeMint, attackerFakeAta, wallet.publicKey,
      BigInt(ONE_BASE.muln(1_000_000).toString()),
    );

    const vaultFakeAta = await getAssociatedTokenAddress(fakeMint, vault, true);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey, vaultFakeAta, vault, fakeMint,
        ),
      ),
    );

    await expectAnchorError(
      redeem(ONE_BASE.muln(1000), {
        baseMint: fakeMint,
        vaultBaseAta: vaultFakeAta,
        userBaseAta: attackerFakeAta,
      }),
      "InvalidMint",
    );
  });

  it("rejects a redeem whose quote_mint is not the vault's quote mint (mirrored exploit)", async () => {
    // The mirrored form of the Aug 2026 attack: pass the vault's *base* mint as the
    // quote mint, so `vault_quote_ata` resolves to the vault's base ATA and the
    // tokens legitimate redeemers handed in get paid straight back out. Every
    // account here exists and is internally consistent — the only thing wrong is
    // that quote_mint is not the mint recorded on the vault.
    await expectAnchorError(
      redeem(ONE_BASE, {
        quoteMint: baseMint,
        vaultQuoteAta: vaultBaseAta,
        userQuoteAta: userBaseAta,
      }),
      "InvalidMint",
    );
  });

  it("rejects a zero redeem", async () => {
    await expectAnchorError(redeem(new BN(0)), "InvalidAmount");
  });

  it("rejects an amount too small to be worth any quote token", async () => {
    // 499 * 2e6 / 1e9 == 0 after flooring.
    await expectAnchorError(redeem(new BN(499)), "InvalidAmount");
  });

  it("rejects a redeem larger than the vault's quote balance", async () => {
    // 60 base -> 120 quote, vault holds 100.
    await expectAnchorError(redeem(ONE_BASE.muln(60)), "InsufficientBalance");
  });

  it("accepts a well-formed redeem and moves both sides correctly", async () => {
    const redeemed = ONE_BASE.muln(10);
    const expectedQuote = ONE_QUOTE.muln(20);

    const vaultQuoteBefore = (await getAccount(connection, vaultQuoteAta)).amount;
    const userBaseBefore = (await getAccount(connection, userBaseAta)).amount;

    await redeem(redeemed);

    const vaultQuoteAfter = (await getAccount(connection, vaultQuoteAta)).amount;
    const vaultBaseAfter = (await getAccount(connection, vaultBaseAta)).amount;
    const userBaseAfter = (await getAccount(connection, userBaseAta)).amount;
    const userQuoteAfter = (await getAccount(connection, userQuoteAta)).amount;

    expect((vaultQuoteBefore - vaultQuoteAfter).toString()).to.equal(expectedQuote.toString());
    expect(userQuoteAfter.toString()).to.equal(expectedQuote.toString());
    expect((userBaseBefore - userBaseAfter).toString()).to.equal(redeemed.toString());
    expect(vaultBaseAfter.toString()).to.equal(redeemed.toString());
  });
});

describe("Redemption — token program restriction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const idl = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "target/idl/redemption.json"), "utf-8"),
  );
  const program = new Program(idl, provider);

  it("refuses to open a vault whose base mint is a Token-2022 mint", async () => {
    // Token-2022 mints can carry transfer fees, which would break the program's
    // assumption that the vault receives exactly `base_amount`.
    const base2022 = await createMint(
      connection, wallet.payer, wallet.publicKey, null, BASE_DECIMALS,
      undefined, undefined, TOKEN_2022_PROGRAM_ID,
    );
    const quote = await createMint(
      connection, wallet.payer, wallet.publicKey, null, QUOTE_DECIMALS,
    );
    const adminQuote = await getOrCreateAssociatedTokenAccount(
      connection, wallet.payer, quote, wallet.publicKey,
    );
    await mintTo(
      connection, wallet.payer, quote, adminQuote.address, wallet.publicKey,
      BigInt(VAULT_DEPOSIT.toString()),
    );

    await expectAnchorError(
      program.methods
        .initialize(7, PRICE, VAULT_DEPOSIT)
        .accountsPartial({
          admin: wallet.publicKey,
          baseMint: base2022,
          quoteMint: quote,
          adminQuoteAta: adminQuote.address,
          baseTokenProgram: TOKEN_2022_PROGRAM_ID,
          quoteTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "UnsupportedTokenProgram",
    );
  });
});
