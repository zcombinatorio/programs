/**
 * Redemption vault admin script.
 *
 * Examples:
 *   npx tsx scripts/redemption-vault.ts init \
 *     --rpc https://api.mainnet-beta.solana.com \
 *     --wallet .keys/authority.json \
 *     --base-mint <TOKEN_MINT> \
 *     --quote-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
 *     --base-decimals 9 \
 *     --quote-decimals 6 \
 *     --nonce 1 \
 *     --price-ui 0.25 \
 *     --deposit-ui 10000
 *
 *   npx tsx scripts/redemption-vault.ts deposit --... --amount-ui 1000
 *   npx tsx scripts/redemption-vault.ts withdraw --... --quote-amount-ui 100 --base-amount-ui 0
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const REDEMPTION_PROGRAM_ID = new PublicKey("rdm5xmgfjVn2WXCNrdEuBDoj3JJHt7K6M82jBnXf1Ef");
const VAULT_SEED = Buffer.from("redemption");

type Command = "init" | "deposit" | "withdraw";

interface Args {
  command: Command;
  rpc: string;
  wallet: string;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseDecimals: number;
  quoteDecimals: number;
  nonce: number;
  priceUi?: string;
  depositUi?: string;
  amountUi?: string;
  quoteAmountUi?: string;
  baseAmountUi?: string;
}

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/redemption-vault.ts init --rpc <url> --wallet <path> --base-mint <mint> --quote-mint <mint> --base-decimals <n> --quote-decimals <n> --nonce <n> --price-ui <amount> --deposit-ui <amount>
  npx tsx scripts/redemption-vault.ts deposit --rpc <url> --wallet <path> --base-mint <mint> --quote-mint <mint> --base-decimals <n> --quote-decimals <n> --nonce <n> --amount-ui <amount>
  npx tsx scripts/redemption-vault.ts withdraw --rpc <url> --wallet <path> --base-mint <mint> --quote-mint <mint> --base-decimals <n> --quote-decimals <n> --nonce <n> --quote-amount-ui <amount> --base-amount-ui <amount>`);
  process.exit(1);
}

function readFlag(flags: Map<string, string>, name: string, fallback?: string): string {
  const value = flags.get(name) ?? fallback;
  if (!value) usage();
  return value;
}

function readOptionalFlag(flags: Map<string, string>, name: string): string | undefined {
  return flags.get(name);
}

function readIntegerFlag(flags: Map<string, string>, name: string): number {
  const value = Number(readFlag(flags, name));
  if (!Number.isInteger(value) || value < 0) usage();
  return value;
}

function parseArgs(): Args {
  const [commandRaw, ...rest] = process.argv.slice(2);
  if (commandRaw !== "init" && commandRaw !== "deposit" && commandRaw !== "withdraw") usage();

  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || value === undefined) usage();
    flags.set(key.slice(2), value);
  }

  return {
    command: commandRaw,
    rpc: readFlag(flags, "rpc", process.env.SOLANA_RPC_URL),
    wallet: readFlag(flags, "wallet", process.env.ADMIN_WALLET_PATH),
    baseMint: new PublicKey(readFlag(flags, "base-mint")),
    quoteMint: new PublicKey(readFlag(flags, "quote-mint")),
    baseDecimals: readIntegerFlag(flags, "base-decimals"),
    quoteDecimals: readIntegerFlag(flags, "quote-decimals"),
    nonce: readIntegerFlag(flags, "nonce"),
    priceUi: readOptionalFlag(flags, "price-ui"),
    depositUi: readOptionalFlag(flags, "deposit-ui"),
    amountUi: readOptionalFlag(flags, "amount-ui"),
    quoteAmountUi: readOptionalFlag(flags, "quote-amount-ui"),
    baseAmountUi: readOptionalFlag(flags, "base-amount-ui"),
  };
}

function resolvePath(filePath: string): string {
  if (filePath.startsWith("~")) return filePath.replace("~", process.env.HOME ?? "");
  return path.resolve(process.cwd(), filePath);
}

function loadWallet(filePath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(resolvePath(filePath), "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function decimalToRaw(amount: string, decimals: number): BN {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error(`Invalid decimal amount: ${amount}`);
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.slice(0, decimals).padEnd(decimals, "0");
  return new BN(`${whole}${paddedFraction}`);
}

function deriveVault(baseMint: PublicKey, quoteMint: PublicKey, nonce: number): PublicKey {
  const nonceBuffer = Buffer.alloc(2);
  nonceBuffer.writeUInt16LE(nonce);
  const [vault] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, baseMint.toBuffer(), quoteMint.toBuffer(), nonceBuffer],
    REDEMPTION_PROGRAM_ID,
  );
  return vault;
}

async function getTokenProgramForMint(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!accountInfo) throw new Error(`Mint not found: ${mint.toBase58()}`);
  return accountInfo.owner;
}

async function main() {
  const args = parseArgs();
  const walletKeypair = loadWallet(args.wallet);
  const wallet = new Wallet(walletKeypair);
  const connection = new Connection(args.rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idlPath = path.resolve(process.cwd(), "target/idl/redemption.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const [baseTokenProgram, quoteTokenProgram] = await Promise.all([
    getTokenProgramForMint(connection, args.baseMint),
    getTokenProgramForMint(connection, args.quoteMint),
  ]);

  const vault = deriveVault(args.baseMint, args.quoteMint, args.nonce);
  const vaultQuoteAta = await getAssociatedTokenAddress(args.quoteMint, vault, true, quoteTokenProgram);
  const vaultBaseAta = await getAssociatedTokenAddress(args.baseMint, vault, true, baseTokenProgram);

  console.log("=== Redemption Vault ===");
  console.log("Command:", args.command);
  console.log("RPC:", args.rpc);
  console.log("Program:", program.programId.toBase58());
  console.log("Admin:", wallet.publicKey.toBase58());
  console.log("Base Mint:", args.baseMint.toBase58());
  console.log("Quote Mint:", args.quoteMint.toBase58());
  console.log("Nonce:", args.nonce);
  console.log("Vault:", vault.toBase58());

  if (args.command === "init") {
    if (!args.priceUi || !args.depositUi) usage();
    const price = decimalToRaw(args.priceUi, args.quoteDecimals);
    const deposit = decimalToRaw(args.depositUi, args.quoteDecimals);
    const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      args.quoteMint,
      wallet.publicKey,
      false,
      "confirmed",
      undefined,
      quoteTokenProgram,
    );

    console.log("Price Raw:", price.toString());
    console.log("Deposit Raw:", deposit.toString());
    console.log("Admin Quote ATA:", adminQuoteAccount.address.toBase58());

    const tx = await program.methods
      .initialize(args.nonce, price, deposit)
      .accountsPartial({
        admin: wallet.publicKey,
        baseMint: args.baseMint,
        quoteMint: args.quoteMint,
        adminQuoteAta: adminQuoteAccount.address,
        baseTokenProgram,
        quoteTokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Initialized:", tx);
    return;
  }

  if (args.command === "deposit") {
    if (!args.amountUi) usage();
    const amount = decimalToRaw(args.amountUi, args.quoteDecimals);
    const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      args.quoteMint,
      wallet.publicKey,
      false,
      "confirmed",
      undefined,
      quoteTokenProgram,
    );

    console.log("Vault Quote ATA:", vaultQuoteAta.toBase58());
    console.log("Amount Raw:", amount.toString());

    const tx = await program.methods
      .deposit(amount)
      .accountsPartial({
        admin: wallet.publicKey,
        vault,
        quoteMint: args.quoteMint,
        vaultQuoteAta,
        adminQuoteAta: adminQuoteAccount.address,
        quoteTokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Deposited:", tx);
    return;
  }

  const quoteAmount = decimalToRaw(args.quoteAmountUi ?? "0", args.quoteDecimals);
  const baseAmount = decimalToRaw(args.baseAmountUi ?? "0", args.baseDecimals);
  const adminQuoteAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    args.quoteMint,
    wallet.publicKey,
    false,
    "confirmed",
    undefined,
    quoteTokenProgram,
  );
  const adminBaseAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    args.baseMint,
    wallet.publicKey,
    false,
    "confirmed",
    undefined,
    baseTokenProgram,
  );

  console.log("Vault Quote ATA:", vaultQuoteAta.toBase58());
  console.log("Vault Base ATA:", vaultBaseAta.toBase58());
  console.log("Quote Amount Raw:", quoteAmount.toString());
  console.log("Base Amount Raw:", baseAmount.toString());

  const tx = await program.methods
    .withdraw(quoteAmount, baseAmount)
    .accountsPartial({
      admin: wallet.publicKey,
      vault,
      baseMint: args.baseMint,
      quoteMint: args.quoteMint,
      vaultQuoteAta,
      vaultBaseAta,
      adminQuoteAta: adminQuoteAccount.address,
      adminBaseAta: adminBaseAccount.address,
      baseTokenProgram,
      quoteTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Withdrew:", tx);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
