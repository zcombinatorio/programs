// Client
export { VaultClient } from "./client";

// Types
export {
  VaultType,
  VaultState,
  VaultAccount,
  VaultInitializedEvent,
  OptionAddedEvent,
  VaultDepositEvent,
  VaultWithdrawalEvent,
  WinningsRedeemedEvent,
  VaultActivatedEvent,
  VaultFinalizedEvent,
  VaultEvent,
} from "./types";

// Constants
export {
  PROGRAM_ID,
  VAULT_SEED,
  CONDITIONAL_MINT_SEED,
  MAX_OPTIONS,
  MIN_OPTIONS,
} from "./constants";

// Utils
export {
  deriveVaultPDA,
  deriveConditionalMint,
  fetchVaultAccount,
} from "./utils";

// Instruction Builders
export {
  initialize,
  addOption,
  activate,
  deposit,
  withdraw,
  finalize,
  redeemWinnings,
} from "./instructions";
