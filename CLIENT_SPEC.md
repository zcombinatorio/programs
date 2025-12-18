# DAO SDK - Platform Integration Spec

## Overview

This SDK enables your platform to create and manage DAOs for your clients' tokens. Your platform's master token provides the liquidity infrastructure, and your clients' tokens (child DAOs) borrow from it to run decision markets.

**Your platform's role**:
- Own and operate the master token with spot liquidity
- Onboard client tokens by creating child DAOs for them
- Store user balances for client tokens
- Verify user eligibility and create proposals on their behalf

---

## Concepts

| Term | Definition |
|------|------------|
| **Master Token** | Your platform's token - has spot liquidity, provides infrastructure |
| **Client Token** | A token belonging to one of your clients (no spot liquidity) |
| **Child DAO** | A DAO for a client token, linked to your master |
| **User** | Someone holding a client token who wants to create a proposal |

---

## 1. Create a DAO

Create a child DAO for one of your client's tokens. This sets up governance infrastructure including a treasury multisig.

### Request

```typescript
POST /api/daos

Headers:
  X-API-Key: your-api-key

{
  tokenMint: string;          // Your client's token mint address
  clientWallet: string;       // Your client's wallet (becomes treasury co-signer)
  master: string;             // Your master token mint
  tokenSymbol?: string;       // e.g., "MYTOKEN"
  tokenName?: string;         // e.g., "My Token"
}
```

### Response

```typescript
{
  daoId: number;
  tokenMint: string;

  // Treasury - your client can send funds here (optional)
  treasuryVault: string;

  // Mint authority (optional)
  mintAuthVault: string;

  // Immediately active
  status: "active";

  // Master relationship
  isChild: true;
  masterDaoId: number;
  masterTokenMint: string;
}
```

### What happens

1. We create a 2/3 treasury multisig where your client is a co-signer
2. We create a 1/1 mint authority multisig (optional - for future token minting governance)
3. DAO is immediately `active` and ready for proposals

### Optional

Your client can send funds to `treasuryVault` or transfer mint authority to `mintAuthVault`. These multisigs are available but not required for proposal creation.

---

## 2. Get DAO Details

Retrieve details about a DAO.

### Request

```typescript
GET /api/daos/:daoId

Headers:
  X-API-Key: your-api-key
```

### Response

```typescript
{
  daoId: number;
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  status: "active";

  // Multisigs
  treasuryVault: string;
  treasuryBalance: string;          // Current balance (informational)
  mintAuthVault: string;

  // Master relationship
  isChild: boolean;
  masterDaoId?: number;
  masterTokenMint?: string;

  // Current proposal (if any)
  activeProposalId?: number;
}
```

---

## 3. Create a Proposal

Create a decision market proposal for a client token.

### Your platform's responsibility

Before calling this endpoint, verify that the user has sufficient balance of your client's token in your system. You handle user authentication and balance verification; we handle proposal creation.

### Request

```typescript
POST /api/proposals

Headers:
  X-API-Key: your-api-key

{
  daoId: number;              // The DAO to create proposal for

  // Proposal config
  length: number;             // Duration in seconds (e.g., 604800 = 7 days)
  numOptions: number;         // Number of options (2-6)

  // Optional metadata
  title?: string;
  description?: string;
  optionLabels?: string[];    // e.g., ["Yes", "No"] or ["Option A", "Option B", "Option C"]
}
```

### Response

```typescript
{
  proposalId: number;
  daoId: number;

  // On-chain addresses
  proposalAddress: string;
  vaultAddress: string;

  // Trading pools (one per option)
  pools: string[];

  // Status
  status: "active";
  expiresAt: number;          // Unix timestamp

  // For your UI
  tradeUrl: string;           // Direct link to trade page
}
```

### What happens

1. We verify your API key
2. We pull liquidity from your master token's spot pool
3. We create the proposal with conditional token markets
4. Users trade your master token's conditionals (your client's token appears in URL for branding)

### Errors

| Error | Meaning |
|-------|---------|
| `DAO_NOT_FOUND` | Invalid daoId |
| `MASTER_HAS_ACTIVE_PROPOSAL` | Master token already has a live proposal - wait for it to finish |
| `INVALID_API_KEY` | Check your API key |

---

## 4. Get Proposal Status

Check the status of a proposal.

### Request

```typescript
GET /api/proposals/:proposalId

Headers:
  X-API-Key: your-api-key
```

### Response

```typescript
{
  proposalId: number;
  daoId: number;

  status: "active" | "finalizing" | "finalized";

  // Timing
  createdAt: number;
  expiresAt: number;
  finalizedAt?: number;

  // Results (after finalization)
  winningOption?: number;
  winningLabel?: string;

  // Current TWAP prices per option
  prices: {
    option: number;
    label: string;
    twap: string;
  }[];
}
```

---

## 5. List DAOs

Get all DAOs created by your platform.

### Request

```typescript
GET /api/daos

Headers:
  X-API-Key: your-api-key
```

### Response

```typescript
{
  daos: {
    daoId: number;
    tokenMint: string;
    tokenSymbol?: string;
    isChild: boolean;
    masterTokenMint?: string;
    treasuryVault: string;
    activeProposalId?: number;
  }[];
}
```

---

## Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR PLATFORM                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. New client onboards to your platform                        │
│     └── You store user balances for their token                 │
│                                                                  │
│  2. You create a child DAO for your client's token (one-time)   │
│     └── POST /api/daos { tokenMint, master, clientWallet }      │
│     └── DAO is immediately active                               │
│                                                                  │
│  3. User wants to create a proposal                             │
│     └── User authenticates with your platform                   │
│     └── You verify user's token balance in your system          │
│     └── If eligible: POST /api/proposals { daoId, ... }         │
│                                                                  │
│  4. Users trade on the proposal                                 │
│     └── They trade your master token's conditionals directly    │
│     └── Your client's token appears in URL for branding         │
│                                                                  │
│  5. Proposal finalizes                                          │
│     └── Winner determined by highest TWAP                       │
│     └── Liquidity returns to your master's spot pool            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication

All endpoints require your platform's API key:

```
X-API-Key: your-api-key
```

**Auth responsibilities**:

| Step | Who | What |
|------|-----|------|
| 1 | Your platform | Authenticate the user |
| 2 | Your platform | Verify user has sufficient token balance |
| 3 | Your platform | Call our API with your API key |
| 4 | Us | Verify your API key |
| 5 | Us | Create proposal using protocol infrastructure |

Your platform handles user-level auth and eligibility. We handle platform-level auth and on-chain execution.

---

## Configuration

When your platform onboards, we set up:

1. **API Key** - For authenticating your platform's requests
2. **Master DAO** - A DAO for your platform's master token (must have spot liquidity)

---

## Constraints

| Constraint | Value |
|------------|-------|
| Options per proposal | 2-6 |
| Proposal duration | Configurable (e.g., 1-30 days) |
| Concurrent proposals per master | 1 at a time |

**Important**: Only one proposal can be active on your master token at a time. If a client tries to create a proposal while another client (or your master itself) has an active proposal, it will fail with `MASTER_HAS_ACTIVE_PROPOSAL`.

---

## Questions?

Contact us for:
- API key provisioning
- Custom configuration
- Integration support
