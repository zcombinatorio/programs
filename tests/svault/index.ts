/**
 * SVault Program Test Suite
 *
 * Comprehensive test coverage including:
 * - Initialization and vault creation
 * - Staking lifecycle (stake, initiate_unstake, withdraw)
 * - Rewards (post_rewards, claim_rewards with merkle proofs)
 * - Configuration (set_config, slash)
 * - Delegation (add_delegate, remove_delegate)
 * - Error conditions (authorization, validation, state)
 * - Multi-user scenarios
 */

// Happy Path Tests
import "./happy-path/initialization";
import "./happy-path/staking";
import "./happy-path/rewards";
import "./happy-path/config";
import "./happy-path/delegation";

// Error Tests
import "./errors/authorization-errors";
import "./errors/validation-errors";
import "./errors/state-errors";

// Multi-User Tests
import "./multi-user/concurrent-staking";

// Integration Tests
import "./integration/offchain-merkle";
