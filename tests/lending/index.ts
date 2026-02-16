/**
 * Lending Program Test Suite
 *
 * Test coverage:
 * - Happy Path: Vault lifecycle, liquidity, borrowing, repayment
 * - Devnet DLMM: Real Meteora pool integration tests
 * - Errors: Validation, authorization, state errors (TODO)
 *
 * Run all: anchor test -- --grep "Lending"
 * Run devnet: anchor test --provider.cluster devnet -- --grep "Lending: DLMM"
 */

// Happy Path Tests
import "./happy-path/lifecycle";
import "./happy-path/devnet-dlmm";

// Error Tests (TODO)
// import "./errors/validation-errors";
// import "./errors/authorization-errors";
// import "./errors/liquidation-errors";
