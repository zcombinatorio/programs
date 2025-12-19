# Combinator Programs

| Program | Address | Version | Deprecated |
|---------|---------|---------|------------|
| dao | DAoYBfZNCCih5i85nvpB3Xkw1YTdJCJ7TDN2o6UVBEZC | 0.1.0 | |
| futarchy | FUT2Nd1EdJGZLgKdNkNeyTGS3nX76PRTQa4Wx9YcDfZC | 0.1.0 | |
| amm | AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC | 0.1.0 | |
| vault | VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC | 0.1.0 | |
| vault | vLTgeZhLgcr4HvBGxKonSnmU4t7qLcgsVcVtUd3haZc | 0.0.0 | ❌ |

AMM Fee Authority: FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC

---

## Futarchy

A decision market protocol. Proposals create conditional token markets for each option, and the option with the highest TWAP wins.

```
                         INITIALIZE PROPOSAL
    Moderator ──────────────────────────────────────────────►┌──────────┐
                                                             │ Proposal │
                                                             └────┬─────┘
                                                                  │
                    ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
                    │                                             │                                             │
                    ▼                                             ▼                                             ▼
             ┌─────────────┐                               ┌─────────────┐                               ┌─────────────┐
             │   Vault     │                               │   Pool 0    │                               │   Pool N    │
             │ (cond tkns) │                               │ quote/base  │           ...                 │ quote/base  │
             └─────────────┘                               └──────┬──────┘                               └──────┬──────┘
                                                                  │                                             │
                                                                  │ TWAP                                        │ TWAP
                                                                  ▼                                             ▼
                                                           ┌────────────────────────────────────────────────────────┐
                                                           │              FINALIZE PROPOSAL                         │
                                                           │         highest TWAP wins → vault finalized            │
                                                           └────────────────────────────────────────────────────────┘
```

### Initialize Moderator

Creates a moderator account tied to a base/quote mint pair. Moderators can host multiple proposals.

### Initialize Proposal

Creates a proposal with 2 options. Initializes a vault (via CPI) and creates AMM pools for each option. Proposal starts in `Setup` state.

### Add Option

Adds additional options to a proposal (up to 6 total). Creates the corresponding conditional mints in the vault and a new AMM pool.

### Launch Proposal

Activates the proposal for trading:
1. Activates the vault
2. Deposits base and quote tokens (mints conditional tokens)
3. Seeds liquidity to all AMM pools

Proposal transitions to `Pending` state and the countdown begins.

### Finalize Proposal

After the proposal duration elapses:
1. Cranks TWAP on each pool
2. Determines winner by highest TWAP
3. Ceases trading on all pools
4. Finalizes vault with winning index

Proposal transitions to `Resolved(winning_idx)`.

### Redeem Liquidity

Allows the proposal creator to withdraw their liquidity from all pools after finalization.

---

## AMM with TWAP Oracle

A simple light-weight constant-product AMM with a manipulation-resistant Time-Weighted Average Price (TWAP) oracle. Designed for conditional token markets where the TWAP determines outcomes.

```
                           SWAP
    Token A ──────────────────────────────────► Token B
       │                                           │
       │              ┌─────────┐                  │
       └─────────────►│  Pool   │◄─────────────────┘
                      │ x * y=k │
                      └────┬────┘
                           │
                           │ crank_twap (rate-limited)
                           ▼
                    ┌─────────────┐
                    │ TWAP Oracle │
                    │  ┌───────┐  │
                    │  │ price │──┼──► bounded observation
                    │  └───────┘  │        │
                    │             │        ▼
                    │  cumulative_observations += obs * elapsed
                    └─────────────┘
```

### Create Pool

Creates a new liquidity pool with configurable fee and TWAP parameters. Takes an optional `liquidity_provider` parameter:
- If provided: only that address can add/remove liquidity
- If omitted: defaults to `admin`

### Add / Remove Liquidity

Only the designated `liquidity_provider` can deposit or withdraw tokens. This single-provider model ensures controlled liquidity for conditional token markets.

### Swap

Constant-product swap with configurable fee (basis points). Fee collected in token A (mint_a).

### Crank TWAP

Updates the TWAP oracle with current pool price. Manipulation-resistant design:
- **Rate limited**: 60-second minimum between recordings
- **Bounded movement**: Observation moves toward price capped by `max_observation_delta`
- **Warmup period**: TWAP accumulation begins after `warmup_duration` seconds

### Cease Trading

Admin freezes the pool, preventing further swaps. Used when finalizing proposals.

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

Creates a vault with 2 options. Use `addOption` to add more options (up to 8 total).

> If using more than 4 options, user vault actions (deposit, withdraw, redeem) require compute budget limit >450k CU. The SDK's higher-level functions already include this compute budget instruction and wrap/unwrap SOL instructions.

### Activate

Sets the vault state to "Active". This enables withdrawals & deposits. Disables adding additional options.

### Finalize

Sets the vault state to "Finalized" with a winning index — the index of the winning conditional mint. Disables withdrawals & deposits. Allows users to redeem winnings.

### Deposit

User deposits base or quote separately. User receives N conditional tokens (one for each option). Base and quote are completely separate — each has its own set of N conditional mints.

### Withdraw

User withdraws base or quote separately. User receives the **minimum** balance across all N conditional tokens (for that type). Only that amount is burned from each, and the user keeps any excess.

### Redeem Winnings

User redeems base or quote separately. After the vault is **finalized** with a winning outcome:
1. All N conditional token accounts (for that type) are burned and closed
2. User receives underlying tokens 1:1 for their **winning** conditional token balance
3. Losing conditional tokens are burned with no payout
