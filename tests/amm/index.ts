/**
 * AMM Program Test Suite
 *
 * Comprehensive test coverage including:
 * - Pool lifecycle tests (create, add liquidity, swap, remove liquidity, finalize)
 * - Swap operations (both directions, fee handling, slippage protection)
 * - Liquidity management (add, remove, partial, asymmetric)
 * - TWAP oracle functionality (non-time-dependent)
 * - All error conditions (state, authorization, validation, math)
 * - Multi-user scenarios (concurrent swaps, arbitrage)
 * - Stress tests (sequential operations)
 *
 * Run with: anchor test --skip-build -- --grep "AMM"
 * Or: yarn test-amm
 */

// Happy Path Tests
import "./happy-path/lifecycle";
import "./happy-path/swaps";
import "./happy-path/liquidity";
import "./happy-path/twap";

// Error Tests
import "./errors/state-errors";
import "./errors/authorization-errors";
import "./errors/validation-errors";
import "./errors/math-errors";

// Multi-User Tests
import "./multi-user/concurrent-swaps";
import "./multi-user/arbitrage";

// Stress Tests
import "./stress/sequential-swaps";
