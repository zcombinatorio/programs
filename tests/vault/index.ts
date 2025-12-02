/**
 * Vault Program Test Suite
 *
 * Comprehensive test coverage including:
 * - Parameterized lifecycle tests (2 and 10 options)
 * - VaultType.Base and VaultType.Quote
 * - All error conditions (state, authorization, validation)
 * - Multi-user scenarios (deposits, interleaved ops, redemption)
 */

// Happy Path Tests
import "./happy-path/lifecycle";
import "./happy-path/vault-types";

// Error Tests
import "./errors/state-errors";
import "./errors/authorization-errors";
import "./errors/validation-errors";

// Multi-User Tests
import "./multi-user/deposits";
import "./multi-user/interleaved";
import "./multi-user/redemption";
