import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

import { FutarchyClient } from "../../sdk/src";

describe("DAO", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const client = new FutarchyClient(provider);

  let baseMint: PublicKey;
  let quoteMint: PublicKey;
  let poolPda: PublicKey;

  before(async () => {
    // Create test mints
    baseMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    quoteMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // Fund wallet with tokens
    const baseAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      baseMint,
      wallet.publicKey
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      baseMint,
      baseAta.address,
      wallet.publicKey,
      100_000_000
    );

    const quoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      quoteMint,
      wallet.publicKey
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      quoteMint,
      quoteAta.address,
      wallet.publicKey,
      100_000_000
    );

    // Create a pool for the DAO
    const { builder, poolPda: pool } = client.amm.createPool(
      wallet.publicKey,
      wallet.publicKey,
      quoteMint,
      baseMint,
      30, // 30 basis points fee
      new BN(1_000_000_000_000), // starting observation (1e12)
      new BN(100_000_000_000), // max observation delta (10%)
      0 // no warmup
    );

    await builder.rpc();
    poolPda = pool;
  });

  describe("Initialize Parent DAO", () => {
    it("creates a parent DAO", async () => {
      const daoName = `dao-${Date.now()}`;
      const treasuryCosigner = Keypair.generate().publicKey;

      const { builder, daoPda, moderatorPda, treasuryMultisig, mintMultisig } =
        await client.initializeParentDAO(
          wallet.publicKey,
          wallet.publicKey,
          daoName,
          baseMint,
          quoteMint,
          treasuryCosigner,
          poolPda,
          { damm: {} }
        );

      await builder.rpc();

      // Fetch and verify the DAO account
      const dao = await client.fetchDAO(daoPda);

      expect(dao.name).to.equal(daoName);
      expect(dao.admin.toBase58()).to.equal(wallet.publicKey.toBase58());
      expect(dao.tokenMint.toBase58()).to.equal(baseMint.toBase58());
      expect(dao.cosigner.toBase58()).to.equal(treasuryCosigner.toBase58());
      expect(dao.treasuryMultisig.toBase58()).to.equal(treasuryMultisig.toBase58());
      expect(dao.mintAuthMultisig.toBase58()).to.equal(mintMultisig.toBase58());

      // Verify moderator was created
      const moderator = await client.fetchModerator(moderatorPda);
      expect(moderator.name).to.equal(daoName);
      expect(moderator.baseMint.toBase58()).to.equal(baseMint.toBase58());
      expect(moderator.quoteMint.toBase58()).to.equal(quoteMint.toBase58());

      console.log("    DAO created:", daoPda.toBase58());
      console.log("    Moderator:", moderatorPda.toBase58());
      console.log("    Treasury Multisig:", treasuryMultisig.toBase58());
    });
  });
});
