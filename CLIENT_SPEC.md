# DAO SDK - Client Integration Spec

## Overview

This SDK enables you to create DAOs for tokens that don't have spot liquidity yet. Your tokens can run decision markets by borrowing liquidity from an established "master" token.

**Your flow**:
1. Store user balances for your tokens (your system)
2. Create a DAO for each token via our SDK
3. Fund the DAO treasury
4. When a user wants to create a proposal, verify their balance → call our SDK

---

## 1. Create a DAO

Creates a new DAO for your token. This sets up the governance infrastructure including a treasury multisig.

### Request

```typescript
POST /api/daos

{
  tokenMint: string;          // Your token's mint address
  clientWallet: string;       // Your wallet (becomes treasury co-signer)
  master: string;             // Master token mint (required for tokens without liquidity)
  tokenSymbol?: string;       // e.g., "MYTOKEN"
  tokenName?: string;         // e.g., "My Token"
}
```

### Response

```typescript
{
  daoId: number;
  tokenMint: string;

  // Treasury - you can send funds here (optional)
  treasuryVault: string;

  // Mint authority (optional)
  mintAuthVault: string;

  // Status - immediately active
  status: "active";

  // Master relationship
  isChild: true;
  masterDaoId: number;
  masterTokenMint: string;
}
```

### What happens

1. We create a 2/3 treasury multisig where you're a co-signer
2. We create a 1/1 mint authority multisig (optional - for future token minting governance)
3. DAO is immediately `active` and ready for proposals

### Optional

Send funds to `treasuryVault` if you want a dedicated treasury for this token. Send mint authority to `mintAuthVault` if you want a dedicated mint authority for this token.  The treasury and mint authority multisigs are available for your use but not required for proposal creation.

---

## 2. Get DAO Details

Get details about your DAO.

### Request

```typescript
GET /api/daos/:daoId
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

---

## 3. Create a Proposal

Create a decision market proposal for your token.

### Your responsibility

Before calling this endpoint, verify in your system that the user has sufficient token balance to create proposals.

### Request

```typescript
POST /api/proposals

Headers:
  X-API-Key: your-api-key

{
  daoId: number;              // Your DAO ID

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
2. We pull liquidity from the master token's spot pool
3. We create the proposal with conditional token markets
4. Users trade master token conditionals (your token appears in URL only)

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

Get all your DAOs.

### Request

```typescript
GET /api/daos
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
│                    YOUR SYSTEM                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User deposits Token X                                       │
│     └── You store balance in your database                      │
│                                                                  │
│  2. You create DAO for Token X (one-time setup)                 │
│     └── POST /api/daos { tokenMint, master, clientWallet }      │
│     └── DAO is immediately active                               │
│                                                                  │
│  3. User wants to create proposal                               │
│     └── You check user's balance in your database               │
│     └── If sufficient: POST /api/proposals { daoId, ... }       │
│                                                                  │
│  4. Users trade on the proposal                                 │
│     └── They trade master token conditionals directly           │
│     └── Your token appears in URL for branding                  │
│                                                                  │
│  5. Proposal finalizes                                          │
│     └── Winner determined by highest TWAP                       │
│     └── Liquidity returns to master's spot pool                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication

All write endpoints require an API key:

```
X-API-Key: your-api-key
```

You verify your users internally (balance checks, etc.). We verify you via API key. This keeps auth simple:

| Step | Who | What |
|------|-----|------|
| 1 | You | Verify user has balance |
| 2 | You | Call our API with your API key |
| 3 | Us | Verify your API key |
| 4 | Us | Create proposal using our infrastructure |

No complex multi-sig or attestation required from your users.

---

## Configuration

When you onboard, we'll set up:

1. **API Key** - For authenticating your requests
2. **Client Wallet** - Your wallet that becomes treasury co-signer
3. **Master Token** - The established token your DAOs will borrow liquidity from

---

## Constraints

| Constraint | Value |
|------------|-------|
| Options per proposal | 2-6 |
| Proposal duration | Configurable (e.g., 1-30 days) |
| Concurrent proposals | 1 per master token at a time |
| Treasury minimum | Configurable per DAO |

---

## Questions?

Contact us for:
- API key provisioning
- Custom configuration
- Integration support
