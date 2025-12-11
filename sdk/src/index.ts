// =============================================================================
// Vault Sub-SDK
// =============================================================================
export {
  // Client
  VaultClient,
  // Types
  VaultType,
  VaultState,
  VaultAccount,
  VaultInitializedEvent,
  VaultActivatedEvent,
  VaultDepositEvent,
  VaultWithdrawalEvent,
  VaultFinalizedEvent,
  OptionAddedEvent as VaultOptionAddedEvent,
  WinningsRedeemedEvent,
  VaultEvent,
  // Utils
  deriveVaultPDA,
  deriveConditionalMint,
  parseVaultState,
  fetchVaultAccount,
  // Constants
  PROGRAM_ID as VAULT_PROGRAM_ID,
  VAULT_SEED,
  CONDITIONAL_MINT_SEED,
  MAX_OPTIONS as VAULT_MAX_OPTIONS,
  MIN_OPTIONS as VAULT_MIN_OPTIONS,
} from "./vault";

// =============================================================================
// AMM Sub-SDK
// =============================================================================
export {
  // Client
  AMMClient,
  // Types
  PoolState,
  TwapOracle,
  PoolBumps,
  PoolAccount,
  SwapQuote,
  PoolCreatedEvent,
  LiquidityAddedEvent,
  LiquidityRemovedEvent,
  CondSwapEvent,
  TWAPUpdateEvent,
  AMMEvent,
  // Utils
  derivePoolPDA,
  deriveReservePDA,
  deriveFeeVaultPDA,
  parsePoolState,
  fetchPoolAccount,
  calculateSpotPrice,
  computeSwapOutput,
  computeSwapInput,
  calculatePriceImpact,
  createSwapQuote,
  // Constants
  PROGRAM_ID as AMM_PROGRAM_ID,
  FEE_AUTHORITY,
  POOL_SEED,
  RESERVE_SEED,
  FEE_VAULT_SEED,
  MAX_FEE,
  PRICE_SCALE,
} from "./amm";

// =============================================================================
// Futarchy SDK
// =============================================================================
export {
  // Client
  FutarchyClient,
  // Types
  ProposalState,
  GlobalConfig,
  ModeratorAccount,
  TWAPConfig,
  ProposalAccount,
  ModeratorInitializedEvent,
  ProposalInitializedEvent,
  ProposalLaunchedEvent,
  OptionAddedEvent as FutarchyOptionAddedEvent,
  ProposalFinalizedEvent,
  LiquidityRedeemedEvent,
  FutarchyEvent,
  // Utils
  deriveGlobalConfigPDA,
  deriveModeratorPDA,
  deriveProposalPDA,
  parseProposalState,
  fetchGlobalConfig,
  fetchModeratorAccount,
  fetchProposalAccount,
  isProposalExpired,
  getTimeRemaining,
  // Constants
  PROGRAM_ID as FUTARCHY_PROGRAM_ID,
  GLOBAL_CONFIG_SEED,
  MODERATOR_SEED,
  PROPOSAL_SEED,
  MAX_OPTIONS as FUTARCHY_MAX_OPTIONS,
  MIN_OPTIONS as FUTARCHY_MIN_OPTIONS,
} from "./futarchy";

// =============================================================================
// Re-export sub-SDK namespaces for qualified access
// =============================================================================
import * as vault from "./vault";
import * as amm from "./amm";
import * as futarchy from "./futarchy";

export { vault, amm, futarchy };
