# DAO SDK - Platform Integration Spec

## Overview

This SDK enables your platform to manage governance for your token and your clients' tokens using a **Parent/Child DAO hierarchy**.

- **Your platform** owns a Parent DAO (your master token with spot liquidity)
- **Your clients** get Child DAOs (their tokens, no spot liquidity, borrow from your parent)

---

## Concepts

| Term | Definition |
|------|------------|
| **Parent DAO** | Your platform's DAO - has spot liquidity, can create proposals directly |
| **Child DAO** | A DAO for one of your client's tokens - no liquidity, proposals proxy to parent |
| **Proposal** | A decision market that uses parent's liquidity regardless of which DAO initiates |

---

## 1. Create Parent DAO

Create your platform's parent DAO. This is done once during platform setup.

### Request

```typescript
POST /api/daos/parent

Headers:
  X-API-Key: your-api-key

{
  tokenMint: string;          // Your platform's token mint
  ownerWallet: string;        // Your platform wallet (becomes treasury co-signer, can create children)
  poolAddress: string;        // Your token's spot pool (DAMM/DLMM)
  poolType: "damm" | "dlmm";
  tokenSymbol?: string;
  tokenName?: string;
}
```

### Response

```typescript
{
  daoId: number;
  treasuryVault: string;      // Optional - your platform can send funds here
  mintAuthVault: string;      // Optional - for mint authority governance
}
```

### What happens

1. We create a 2/3 treasury multisig where your platform is a co-signer
2. We create a 1/1 mint authority multisig
3. We create the on-chain moderator (linked to your spot pool)
4. Parent DAO is immediately ready for proposals

---

## 2. Create Child DAO

Create a child DAO for one of your clients. You must own the parent DAO.

### Request

```typescript
POST /api/daos/child

Headers:
  X-API-Key: your-api-key

{
  parentDaoId: number;        // Your parent DAO ID
  tokenMint: string;          // Your client's token mint
  clientWallet: string;       // Your client's wallet (becomes treasury co-signer)
  tokenSymbol?: string;
  tokenName?: string;
}
```

### Response

```typescript
{
  daoId: number;
  parentDaoId: number;
  treasuryVault: string;      // Optional - your client can send funds here
  mintAuthVault: string;      // Optional - for mint authority governance
}
```

### What happens

1. We verify you own the parent DAO
2. We create a 2/3 treasury multisig where your client is a co-signer
3. We create a 1/1 mint authority multisig
4. Child DAO is immediately ready for proposals (proxied to parent)

---

## 3. Get DAO Details

Retrieve details about a DAO (parent or child).

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

  isParent: boolean;
  parentDaoId?: number;       // If child
  childDaoIds?: number[];     // If parent

  treasuryVault: string;
  mintAuthVault: string;

  // Only for parent
  poolAddress?: string;

  activeProposalId?: number;
}
```

---

## 4. List Child DAOs

Get all child DAOs under a parent.

### Request

```typescript
GET /api/daos/:parentDaoId/children

Headers:
  X-API-Key: your-api-key
```

### Response

```typescript
{
  parentDaoId: number;
  children: {
    daoId: number;
    tokenMint: string;
    tokenSymbol?: string;
    activeProposalId?: number;
  }[];
}
```

---

## 5. Create a Proposal

Create a proposal for any DAO (parent or child). Child proposals use parent's liquidity.

### Your platform's responsibility

Before calling this endpoint, verify that the user has sufficient balance of the relevant token in your system. You handle user authentication and balance verification; we handle proposal creation.

### Request

```typescript
POST /api/proposals

Headers:
  X-API-Key: your-api-key

{
  daoId: number;              // Parent or child DAO ID

  // Proposal config
  length: number;             // Duration in seconds (e.g., 604800 = 7 days)
  numOptions: number;         // Number of options (2-6)

  // Optional metadata
  title?: string;
  description?: string;
  optionLabels?: string[];    // e.g., ["Yes", "No"]
}
```

### Response

```typescript
{
  proposalId: number;
  initiatingDaoId: number;    // The DAO that initiated (could be child)
  parentDaoId: number;        // The parent DAO (liquidity source)

  // On-chain addresses
  proposalAddress: string;
  vaultAddress: string;
  pools: string[];            // Trading pools (one per option)

  status: "active";
  expiresAt: number;          // Unix timestamp
}
```

### What happens

**If parent DAO**:
1. We verify your API key
2. We pull liquidity from your parent's spot pool
3. We create the proposal with conditional token markets

**If child DAO**:
1. We verify your API key
2. We resolve the parent DAO
3. We pull liquidity from the PARENT's spot pool
4. We create the proposal using the PARENT's infrastructure
5. Users trade parent token conditionals (child token appears in URL for branding)

### Errors

| Error | Meaning |
|-------|---------|
| `DAO_NOT_FOUND` | Invalid daoId |
| `PARENT_HAS_ACTIVE_PROPOSAL` | Parent already has a live proposal (direct or via another child) |
| `INVALID_API_KEY` | Check your API key |

---

## 6. Get Proposal Status

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
  initiatingDaoId: number;
  parentDaoId: number;

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

## Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR PLATFORM                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SETUP (once)                                                   │
│  ─────────────                                                  │
│  1. Create your Parent DAO                                      │
│     └── POST /api/daos/parent { tokenMint, ownerWallet, pool }  │
│                                                                  │
│  ONBOARDING (per client)                                        │
│  ────────────────────────                                       │
│  2. Client onboards to your platform                            │
│     └── You store user balances for their token                 │
│                                                                  │
│  3. Create a Child DAO for your client                          │
│     └── POST /api/daos/child { parentDaoId, tokenMint, ... }    │
│                                                                  │
│  PROPOSALS (ongoing)                                            │
│  ───────────────────                                            │
│  4. User wants to create a proposal                             │
│     └── User authenticates with your platform                   │
│     └── You verify user's token balance in your system          │
│     └── POST /api/proposals { daoId, ... }                      │
│                                                                  │
│  5. Users trade on the proposal                                 │
│     └── They trade your parent token's conditionals directly    │
│     └── Child token appears in URL for branding                 │
│                                                                  │
│  6. Proposal finalizes                                          │
│     └── Winner determined by highest TWAP                       │
│     └── Liquidity returns to your parent's spot pool            │
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
| 5 | Us | Execute proposal using parent's infrastructure |

---

## Constraints

| Constraint | Value |
|------------|-------|
| Options per proposal | 2-6 |
| Proposal duration | Configurable (e.g., 1-30 days) |
| Concurrent proposals per parent | 1 at a time |
| Child DAO nesting | Not allowed (children cannot have children) |

**Important**: Only one proposal can be active on your parent DAO at a time. This includes proposals initiated by the parent itself OR by any child. If a child tries to create a proposal while another child (or the parent) has an active proposal, it will fail with `PARENT_HAS_ACTIVE_PROPOSAL`.

---

## Configuration

When your platform onboards, we set up:

1. **API Key** - For authenticating your platform's requests
2. **Parent DAO** - Your platform's master token with spot liquidity

---

## Questions?

Contact us for:
- API key provisioning
- Custom configuration
- Integration support
