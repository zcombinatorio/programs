# DAO SDK - Internal Specification

## Overview

This spec defines a TypeScript SDK for creating and managing DAOs on the Combinator protocol using a **Parent/Child DAO hierarchy**.

**Architecture (System B)**:
- Parent DAOs have spot liquidity (1:1 with a moderator)
- Child DAOs have no liquidity, proxy proposals to their parent
- Moderators are an implementation detail, not exposed to clients

---

## 1. Core Entities

| Entity | Description |
|--------|-------------|
| **Parent DAO** | Has treasury, mint auth, spot liquidity (via moderator). Can create proposals directly. |
| **Child DAO** | Has treasury, mint auth. No liquidity. Proxies proposals to parent. |
| **Moderator** | On-chain entity for proposal creation. 1:1 with parent DAO. Implementation detail. |

---

## 2. SDK Functions

### 2.1 `createParentDAO`

Creates a parent DAO with spot liquidity. This is typically done once per platform.

```typescript
interface CreateParentDAOParams {
  // Token configuration
  tokenMint: PublicKey;           // The token this DAO governs

  // Owner wallet (becomes treasury co-signer and can create child DAOs)
  ownerWallet: PublicKey;

  // Spot liquidity
  poolAddress: PublicKey;         // DAMM/DLMM pool address
  poolType: 'damm' | 'dlmm';

  // Optional metadata
  tokenSymbol?: string;
  tokenName?: string;
}

interface CreateParentDAOResult {
  daoId: number;

  // Multisigs
  treasuryVault: PublicKey;
  mintAuthVault: PublicKey;

  // Moderator (created automatically, 1:1)
  moderatorId: number;
  moderatorPda: PublicKey;
}

async function createParentDAO(params: CreateParentDAOParams): Promise<CreateParentDAOResult>
```

**What happens**:
1. Create 2/3 treasury multisig (owner is co-signer)
2. Create 1/1 mint authority multisig
3. Create moderator on-chain (1:1 with this DAO)
4. Store parent DAO in database
5. Return DAO details

### 2.2 `createChildDAO`

Creates a child DAO under a parent. Caller must be the owner of the parent DAO.

```typescript
interface CreateChildDAOParams {
  // Parent relationship
  parentDaoId: number;            // Must be a parent DAO

  // Token configuration
  tokenMint: PublicKey;           // The client's token

  // Client wallet (becomes treasury co-signer)
  clientWallet: PublicKey;

  // Optional metadata
  tokenSymbol?: string;
  tokenName?: string;
}

interface CreateChildDAOResult {
  daoId: number;
  parentDaoId: number;

  // Multisigs
  treasuryVault: PublicKey;
  mintAuthVault: PublicKey;

  // Note: No moderator - proposals proxy to parent
}

async function createChildDAO(params: CreateChildDAOParams): Promise<CreateChildDAOResult>
```

**What happens**:
1. Verify caller owns the parent DAO
2. Verify parentDaoId is actually a parent (not a child)
3. Create 2/3 treasury multisig (client is co-signer)
4. Create 1/1 mint authority multisig
5. Store child DAO in database with parent reference
6. Return DAO details

### 2.3 `createProposal`

Creates a proposal. Works for both parent and child DAOs.

```typescript
interface CreateProposalParams {
  daoId: number;                  // Parent or child DAO

  // Proposal configuration
  length: number;                 // Duration in seconds
  fee: number;                    // Fee in basis points
  twapConfig: TWAPConfig;
  numOptions: number;             // 2-6

  // Optional metadata
  title?: string;
  description?: string;
  optionLabels?: string[];
}

interface CreateProposalResult {
  proposalId: number;

  // Which DAO initiated vs which DAO's liquidity is used
  initiatingDaoId: number;        // The DAO that initiated (could be child)
  parentDaoId: number;            // The parent DAO (liquidity source)

  // On-chain addresses
  proposalPda: PublicKey;
  vaultPda: PublicKey;
  pools: PublicKey[];
  condBaseMints: PublicKey[];
  condQuoteMints: PublicKey[];
}

async function createProposal(params: CreateProposalParams): Promise<CreateProposalResult>
```

**What happens**:
1. Load DAO from database
2. **If child DAO**:
   - Resolve parent DAO
   - Check parent has no active proposal (direct or via any child)
   - Use parent's moderator for on-chain creation
   - Withdraw liquidity from parent's spot pool
3. **If parent DAO**:
   - Check no active proposal (direct or via any child)
   - Use own moderator
   - Withdraw from own spot pool
4. Create proposal on-chain
5. Store proposal with `initiating_dao_id` and `parent_dao_id`
6. Return proposal details

---

## 3. Database Schema

```sql
-- DAOs can be parent or child
CREATE TABLE qm_daos (
  id SERIAL PRIMARY KEY,

  -- Token configuration
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,

  -- Owner (for parent) or Client (for child)
  owner_wallet TEXT NOT NULL,

  -- Multisigs
  treasury_multisig TEXT NOT NULL,
  treasury_vault TEXT NOT NULL,
  mint_auth_multisig TEXT NOT NULL,
  mint_auth_vault TEXT NOT NULL,

  -- Parent/child relationship
  parent_dao_id INTEGER REFERENCES qm_daos(id),  -- NULL if parent

  -- Only parent DAOs have these
  moderator_id INTEGER REFERENCES qm_moderators(id),  -- NULL if child
  pool_address TEXT,                                   -- NULL if child
  pool_type TEXT,                                      -- NULL if child

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT parent_has_moderator CHECK (
    (parent_dao_id IS NULL AND moderator_id IS NOT NULL) OR
    (parent_dao_id IS NOT NULL AND moderator_id IS NULL)
  )
);

CREATE UNIQUE INDEX idx_daos_token_mint ON qm_daos(token_mint);
CREATE INDEX idx_daos_parent ON qm_daos(parent_dao_id);

-- Moderators are 1:1 with parent DAOs
CREATE TABLE qm_moderators (
  id SERIAL PRIMARY KEY,
  dao_id INTEGER NOT NULL UNIQUE REFERENCES qm_daos(id),
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  moderator_pda TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Proposals track initiating DAO and parent DAO
CREATE TABLE qm_proposals (
  id SERIAL PRIMARY KEY,

  -- Which DAO initiated (child or parent)
  initiating_dao_id INTEGER NOT NULL REFERENCES qm_daos(id),

  -- Which parent DAO's liquidity is used (always a parent)
  parent_dao_id INTEGER NOT NULL REFERENCES qm_daos(id),

  -- On-chain data
  proposal_pda TEXT NOT NULL,
  vault_pda TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  finalized_at TIMESTAMP
);

CREATE INDEX idx_proposals_initiating ON qm_proposals(initiating_dao_id);
CREATE INDEX idx_proposals_parent ON qm_proposals(parent_dao_id);
```

---

## 4. Squads Multisig Configuration

**Treasury Multisig (2/3)** - Same for parent and child:
| Field | Value |
|-------|-------|
| Config Authority | `HHroB8P1q3kijtyML9WPvfTXG8JicfmUoGZjVzam64PX` |
| Threshold | 2 of 3 |
| Member 1 | `HHroB8P1q3kijtyML9WPvfTXG8JicfmUoGZjVzam64PX` |
| Member 2 | `3ogXyF6ovq5SqsneuGY6gHLG27NK6gw13SqfXMwRBYai` |
| Member 3 | Owner wallet (parent) or Client wallet (child) |

**Mint Authority Multisig (1/1)**:
| Field | Value |
|-------|-------|
| Config Authority | `Dobm8QnaCPQoc6koxC3wqBQqPTfDwspATb2u6EcWC9Aw` |
| Threshold | 1 of 1 |
| Member 1 | `Dobm8QnaCPQoc6koxC3wqBQqPTfDwspATb2u6EcWC9Aw` |

---

## 5. API Endpoints

### 5.1 Create Parent DAO

```
POST /api/daos/parent
```

**Request**:
```typescript
{
  tokenMint: string;
  ownerWallet: string;
  poolAddress: string;
  poolType: 'damm' | 'dlmm';
  tokenSymbol?: string;
  tokenName?: string;
}
```

**Response**:
```typescript
{
  daoId: number;
  treasuryVault: string;
  mintAuthVault: string;
  moderatorId: number;
}
```

### 5.2 Create Child DAO

```
POST /api/daos/child
```

**Request**:
```typescript
{
  parentDaoId: number;
  tokenMint: string;
  clientWallet: string;
  tokenSymbol?: string;
  tokenName?: string;
}
```

**Response**:
```typescript
{
  daoId: number;
  parentDaoId: number;
  treasuryVault: string;
  mintAuthVault: string;
}
```

### 5.3 Get DAO

```
GET /api/daos/:id
```

**Response**:
```typescript
{
  daoId: number;
  tokenMint: string;
  tokenSymbol?: string;

  isParent: boolean;
  parentDaoId?: number;        // If child
  childDaoIds?: number[];      // If parent

  treasuryVault: string;
  mintAuthVault: string;

  // Only for parent
  poolAddress?: string;

  activeProposalId?: number;
}
```

### 5.4 List Children

```
GET /api/daos/:id/children
```

**Response**:
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

### 5.5 Create Proposal

```
POST /api/proposals
```

**Request**:
```typescript
{
  daoId: number;              // Parent or child
  length: number;
  numOptions: number;
  title?: string;
  description?: string;
  optionLabels?: string[];
}
```

**Response**:
```typescript
{
  proposalId: number;
  initiatingDaoId: number;
  parentDaoId: number;
  proposalAddress: string;
  vaultAddress: string;
  pools: string[];
  status: "active";
  expiresAt: number;
}
```

### 5.6 Get Proposal

```
GET /api/proposals/:id
```

---

## 6. Validation Rules

### 6.1 Parent DAO Creation

| Rule | Error |
|------|-------|
| `tokenMint` already has a DAO | `DAO_ALREADY_EXISTS` |
| Invalid pool address | `INVALID_POOL` |

### 6.2 Child DAO Creation

| Rule | Error |
|------|-------|
| Caller doesn't own parent DAO | `NOT_PARENT_OWNER` |
| `parentDaoId` is a child (not a parent) | `INVALID_PARENT` |
| `tokenMint` already has a DAO | `DAO_ALREADY_EXISTS` |

### 6.3 Proposal Creation

| Rule | Error |
|------|-------|
| DAO not found | `DAO_NOT_FOUND` |
| Invalid API key | `INVALID_API_KEY` |
| Parent has active proposal (direct or via child) | `PARENT_HAS_ACTIVE_PROPOSAL` |

---

## 7. Proposal Flow Diagrams

### Parent DAO Proposal

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARENT DAO PROPOSAL                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Request: createProposal(parentDaoId)                        │
│                           │                                      │
│                           ▼                                      │
│  2. Check no active proposal on parent (or any child)           │
│                           │                                      │
│                           ▼                                      │
│  3. Withdraw from parent's spot pool                            │
│                           │                                      │
│                           ▼                                      │
│  4. Parent's moderator creates proposal on-chain                │
│                           │                                      │
│                           ▼                                      │
│  5. Store: initiating_dao_id = parent, parent_dao_id = parent   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Child DAO Proposal (Proxied)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHILD DAO PROPOSAL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Request: createProposal(childDaoId)                         │
│                           │                                      │
│                           ▼                                      │
│  2. Resolve parent DAO                                          │
│                           │                                      │
│                           ▼                                      │
│  3. Check no active proposal on parent (or any sibling)         │
│                           │                                      │
│                           ▼                                      │
│  4. Withdraw from PARENT's spot pool                            │
│                           │                                      │
│                           ▼                                      │
│  5. PARENT's moderator creates proposal on-chain                │
│                           │                                      │
│                           ▼                                      │
│  6. Store: initiating_dao_id = child, parent_dao_id = parent    │
│                           │                                      │
│                           ▼                                      │
│  7. URL shows child token, trades use parent's conditionals     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Migration Path

1. **Database**: Create new schema with parent/child structure
2. **SDK**: Implement `createParentDAO`, `createChildDAO`, `createProposal`
3. **Backend**: Add new endpoints, update proposal logic for proxying
4. **Squads**: Add `@sqds/multisig` dependency for multisig creation

---

## 9. Key Invariants

1. **Parent DAOs always have a moderator** (1:1 relationship)
2. **Child DAOs never have a moderator** (proxy to parent)
3. **Only one active proposal per parent** at any time (including via children)
4. **Children cannot have children** (only one level of hierarchy)
5. **A DAO's token mint is unique** (no duplicate DAOs for same token)
