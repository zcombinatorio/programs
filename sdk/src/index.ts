/* Shared Types */

export { TxOptions } from "./utils";

/* Vault Sub-SDK */

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
  VaultActionOptions,
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

/* AMM Sub-SDK */

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

/* Futarchy Sub-SDK */

export {
  // Client
  FutarchyClient,
  // Types
  ProposalState,
  DAOAccount,
  ModeratorAccount,
  ProposalAccount,
  ProposalParams,
  DAOType,
  PoolType,
  DAOInitializedEvent,
  DAOUpgradedEvent,
  ModeratorInitializedEvent,
  ProposalInitializedEvent,
  ProposalLaunchedEvent,
  OptionAddedEvent as FutarchyOptionAddedEvent,
  ProposalFinalizedEvent,
  LiquidityRedeemedEvent,
  FutarchyEvent,
  // Utils
  deriveDAOPDA,
  deriveModeratorPDA,
  deriveProposalPDA,
  parseProposalState,
  fetchDAOAccount,
  fetchModeratorAccount,
  fetchProposalAccount,
  isProposalExpired,
  getTimeRemaining,
  // Constants
  PROGRAM_ID as FUTARCHY_PROGRAM_ID,
  DAO_SEED,
  MODERATOR_SEED,
  PROPOSAL_SEED,
  MAX_OPTIONS as FUTARCHY_MAX_OPTIONS,
  MIN_OPTIONS as FUTARCHY_MIN_OPTIONS,
} from "./futarchy";

/* SVault Sub-SDK */

export {
  // Client
  SVaultClient,
  // Types
  StakingConfigAccount,
  UserStakeAccount,
  DelegateAccount,
  StakingVaultInitializedEvent,
  StakedEvent,
  UnstakeInitiatedEvent,
  WithdrawnEvent,
  RewardsPostedEvent,
  RewardsClaimedEvent,
  SlashedEvent,
  DelegateAddedEvent,
  DelegateRemovedEvent,
  SVaultEvent,
  SVaultTxOptions,
  // Utils
  deriveStakingConfigPDA,
  deriveUserStakePDA,
  deriveDelegatePDA,
  deriveStakeVaultPDA,
  deriveRewardVaultPDA,
  fetchStakingConfigAccount,
  fetchUserStakeAccount,
  fetchDelegateAccount,
  computeWithdrawAvailableAt,
  isWithdrawAvailable,
  getTimeUntilWithdraw,
  // Constants
  PROGRAM_ID as SVAULT_PROGRAM_ID,
  STAKING_CONFIG_SEED,
  USER_STAKE_SEED,
  STAKE_VAULT_SEED,
  REWARD_VAULT_SEED,
  SECONDS_PER_DAY,
} from "./svault";

/* Sub-SDK Namespaces */

import * as vault from "./vault";
import * as amm from "./amm";
import * as futarchy from "./futarchy";
import * as svault from "./svault";

export { vault, amm, futarchy, svault };
