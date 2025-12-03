# Combinator Programs

| Program | Address |
|---------|---------|
| vault | vLTgeZhLgcr4HvBGxKonSnmU4t7qLcgsVcVtUd3haZc |

---

## Multi-Option Conditional Token Vault

A Solana program that enables conditional token markets by allowing users to deposit base or quote tokens into a vault and receive conditional tokens for each possible outcome. Users can trade these conditional tokens on external markets, and once the vault is finalized with a winning outcome, holders of the winning conditional tokens can redeem them 1:1 for the underlying assets.

```
                                DEPOSIT
    User Base/Quote Tokens ─────────────────────► Vault
                │
                │ receives
                ▼
┌─────────────────────────────────┐
│ N Conditional Base/Quote Tokens │
│    ┌────┐ ┌────┐     ┌────┐     │
│    │ 0  │ │ 1  │ ... │ N  │     │
│    └────┘ └────┘     └────┘     │
└─────────────────────────────────┘
                │
                │ WITHDRAW (min balance burned) or REDEEM (after finalization)
                ▼
    User Base/Quote Tokens ◄───────────────────── Vault
```

### Initialize

`initialize` creates a vault with 2 options. Use `addOption` to add more options (up to 8 total).

> If using more than 4 options, user vault actions (deposit, withdraw, redeem) require compute budget limit >450k CU. The SDK's higher-level functions already include this compute budget instruction and wrap/unwrap SOL instructions.

### Deposit

User deposits base or quote separately. User receives N conditional tokens (one for each option). Base and quote are completely separate — each has its own set of N conditional mints.

### Withdraw

User withdraws base or quote separately. User receives the **minimum** balance across all N conditional tokens (for that type). Only that amount is burned from each, and the user keeps any excess.

### Redeem Winnings

User redeems base or quote separately. After the vault is **finalized** with a winning outcome:
1. All N conditional token accounts (for that type) are burned and closed
2. User receives underlying tokens 1:1 for their **winning** conditional token balance
3. Losing conditional tokens are burned with no payout
