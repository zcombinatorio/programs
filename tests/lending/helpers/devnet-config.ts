/**
 * Devnet DLMM pool configuration for lending tests
 * Created by scripts/setup-devnet-dlmm.ts
 */
import { PublicKey } from "@solana/web3.js";

export const DEVNET_CONFIG = {
  // DLMM Pool
  pool: new PublicKey("4Y29TVZmviHSDC9ts4Te9LFgMDoXxacU3FSoqVQBe7J3"),
  
  // Token mints
  baseMint: new PublicKey("BhLDyXG1UkTDYfZ98xZjB5q9fu4UhJJGu9CcreCfMkYz"),
  quoteMint: new PublicKey("5BPmUXbgFLgzpWktR7K8GZ6TpueGYLeL6AyrMZQH2zyL"),
  
  // Pool parameters
  binStep: 25,
  activeId: 0,
  
  // Reserve accounts
  reserveX: new PublicKey("HAm11iWemcQUng2TbFJ4HVPSTxXKq521ET49XbF6tsgb"),
  reserveY: new PublicKey("52fAXS26iRuA2orvCZimkVsBuNSB1G1T3ZmDpKKASYcb"),
  
  // Admin (test-admin.json)
  admin: new PublicKey("mns8YmqefB3aKTqCQimDvCexFoWGz787ZGtT5BegfuE"),
  
  // LP Position
  positionPubkey: new PublicKey("GghhZ6wQnhSKDjcX7aWadssrufRXsfzeyNRZEMC7chkg"),
};

// Admin token ATAs
export const ADMIN_ATAS = {
  base: new PublicKey("6vKdSSUubMjuREWSXv53fsyTo9GUnWf2DfGDjDrdjjCy"),
  quote: new PublicKey("3jW6p3w2r3DmkPsKqcMmLiWSWfQfh6JWdeWNUGrxxocv"),
};
