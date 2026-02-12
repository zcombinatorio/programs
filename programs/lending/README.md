# Lending Program

A collateralized lending protocol built on Solana, using Meteora AMM pools for price discovery and liquidation swaps.

## How It Works

### The Basic Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        LENDING VAULT                            │
│                                                                 │
│   Liquidity Providers          Borrowers                        │
│   deposit BASE tokens    ──►   borrow BASE tokens               │
│   (e.g., USDC)                 against QUOTE collateral         │
│                                (e.g., SOL)                      │
│                                                                 │
│   Earn when loans             Pay back loan + keep profits      │
│   are repaid                  or get liquidated                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Term | Meaning |
|------|---------|
| **Base Token** | What users borrow (e.g., USDC) |
| **Quote Token** | What users deposit as collateral (e.g., SOL) |
| **LTV (Loan-to-Value)** | Max you can borrow relative to collateral. 80% LTV = borrow up to $80 against $100 collateral |
| **Liquidation Threshold** | When your loan gets liquidated. 85% = liquidated when debt reaches 85% of collateral value |
| **Position** | A user's active loan (collateral + borrowed amount) |

## Instructions

### For Vault Admins

#### `initialize_vault`
Create a new lending vault for a token pair.

**Parameters:**
- `ltv_bps` — Max loan-to-value in basis points (e.g., 8000 = 80%)
- `liquidation_threshold_bps` — Liquidation trigger (must be > LTV)
- `loan_duration_seconds` — Time before loan becomes liquidatable regardless of health
- `pool_type` — Which Meteora pool type (`CpAmm` or `Dlmm`)

### For Liquidity Providers

#### `add_liquidity`
Deposit base tokens into the vault to earn from borrower repayments.

#### `remove_liquidity`
Withdraw base tokens (only unborrowed liquidity can be withdrawn).

### For Borrowers

#### `open_position`
Deposit collateral and borrow tokens in one transaction.

**What happens:**
1. Deposit quote tokens (collateral) into vault
2. Check price from Meteora pool
3. Verify loan is within LTV limits
4. Transfer borrowed base tokens to user
5. Create position account tracking the loan

#### `repay`
Pay back your loan and retrieve your collateral.

**What happens:**
1. Transfer borrowed base tokens back to vault
2. Return collateral to user
3. Close position account (rent returned)

### For Liquidators

#### `liquidate_cp_amm` / `liquidate_dlmm`
Liquidate unhealthy positions. Anyone can call this (permissionless).

**A position can be liquidated when:**
- **Undercollateralized**: Debt/collateral ratio exceeds liquidation threshold
- **Expired**: Loan duration has passed

**What happens:**
1. Verify position is liquidatable
2. Swap collateral → base tokens via Meteora pool
3. Return swapped tokens to vault (covering the debt)
4. Close position account

## Risk Parameters

| Parameter | Typical Value | Purpose |
|-----------|---------------|---------|
| LTV | 75-80% | Max borrow ratio at entry |
| Liquidation Threshold | 85-90% | When liquidation triggers |
| Loan Duration | 1-30 days | Time-based backstop |

**Example:**
- LTV: 80% — User deposits $100 SOL, can borrow up to $80 USDC
- Liquidation: 90% — If SOL drops and debt reaches 90% of collateral value, position is liquidatable
- Duration: 7 days — Even if healthy, loan becomes liquidatable after 7 days

> ⚠️ LTV must always be less than Liquidation Threshold — this gap gives borrowers a buffer before liquidation.

## Price Oracle

Prices come directly from Meteora pools (no external oracle needed):

- **CP-AMM**: `price = sqrtPrice² / 2^128`
- **DLMM**: `price = (1 + binStep/10000)^activeId`

The vault stores which pool to use and the token ordering to ensure correct price interpretation.

## Accounts Overview

```
LendingVault
├── base_mint        — Token being borrowed
├── quote_mint       — Collateral token  
├── base_vault       — Holds loanable liquidity
├── quote_vault      — Holds borrower collateral
├── pool             — Meteora pool for pricing
└── risk params      — LTV, liquidation threshold, duration

Position (per user per vault)
├── vault            — Which vault
├── user             — Owner
├── collateral_amount
├── borrowed_amount
└── opened_at        — For time-based liquidation
```

## Security Considerations

1. **LTV < Liquidation Threshold** — Enforced at vault creation. Without this gap, positions could be liquidated immediately.

2. **Pool Validation** — Pool mints are verified against vault mints during initialization. Can't pass a fake pool.

3. **Permissionless Liquidation** — Anyone can liquidate unhealthy positions, ensuring bad debt is cleared quickly.

4. **Time-based Liquidation** — Even "healthy" loans expire, preventing indefinite borrowing.

5. **No Interest (v1)** — Current version has no interest accrual. Loans are fixed-term only.

## Future Improvements

- [ ] Interest rate model
- [ ] Multiple positions per user
- [ ] Partial liquidations
- [ ] LP token rewards for liquidity providers
- [ ] Governance for risk parameters
