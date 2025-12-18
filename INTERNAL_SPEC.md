# DAO Creation & Master/Child Moderator System Specification

## Overview

This spec defines a TypeScript SDK for creating **DAOs** on the Combinator protocol. A DAO consists of:

1. **Treasury** - A 2/3 Squads multisig for holding funds
2. **Mint Authority** - A 1/1 Squads multisig for token mint control
3. **Moderator** - Either a master (has own spot LP) or child (borrows master's LP)

**Core unlock**: A new token without its own spot pool can run decision markets by borrowing an established master token's liquidity and infrastructure. This enables governance participation for tokens that haven't yet bootstrapped their own markets.

**Use case**: Token X has no spot pool yet. Token Y is established with liquidity. Child moderator for Token X points to master Token Y. Proposals created for Token X actually run on Token Y's conditional markets, using Token Y's spot LP.

---

## 1. DAO Creation Flow

### 1.1 SDK Function: `createDAO`

```typescript
interface CreateDAOParams {
  // Token configuration
  tokenMint: PublicKey;           // The token this DAO governs

  // Token project's wallet (becomes 3rd member of treasury multisig)
  clientWallet: PublicKey;

  // Master relationship (optional)
  master?: PublicKey;             // Master token mint (if child DAO)
}

interface CreateDAOResult {
  // Squads multisigs
  treasuryMultisig: PublicKey;    // 2/3 multisig address
  treasuryVault: PublicKey;       // Optional - client can send funds here
  mintAuthMultisig: PublicKey;    // 1/1 multisig address
  mintAuthVault: PublicKey;       // Optional - for mint authority transfer

  // DAO metadata
  daoId: number;
  moderatorId: number;

  // Child relationship (if applicable)
  isChild: boolean;
  masterDaoId?: number;
}

async function createDAO(params: CreateDAOParams): Promise<CreateDAOResult>
```

### 1.2 Squads Multisig Configuration

**Treasury Multisig (2/3)**:
| Field | Value |
|-------|-------|
| Config Authority | `HHroB8P1q3kijtyML9WPvfTXG8JicfmUoGZjVzam64PX` |
| Threshold | 2 of 3 |
| Member 1 | `HHroB8P1q3kijtyML9WPvfTXG8JicfmUoGZjVzam64PX` |
| Member 2 | `3ogXyF6ovq5SqsneuGY6gHLG27NK6gw13SqfXMwRBYai` |
| Member 3 | Token project's wallet |

**Mint Authority Multisig (1/1)**:
| Field | Value |
|-------|-------|
| Config Authority | `Dobm8QnaCPQoc6koxC3wqBQqPTfDwspATb2u6EcWC9Aw` |
| Threshold | 1 of 1 |
| Member 1 | `Dobm8QnaCPQoc6koxC3wqBQqPTfDwspATb2u6EcWC9Aw` |

### 1.3 DAO Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      DAO CREATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Client calls createDAO(tokenMint, clientWallet, master?)    │
│                           │                                      │
│                           ▼                                      │
│  2. SDK creates Treasury multisig (2/3)                         │
│     └── Returns treasuryVault address                           │
│                           │                                      │
│                           ▼                                      │
│  3. SDK creates Mint Authority multisig (1/1)                   │
│     └── Returns mintAuthVault address                           │
│                           │                                      │
│                           ▼                                      │
│  4. SDK creates Moderator                                       │
│     └── If child: uses master's baseMint/quoteMint              │
│     └── If master: uses DAO's tokenMint                         │
│                           │                                      │
│                           ▼                                      │
│  5. DAO is immediately active                                   │
│     └── Ready for proposals                                     │
│     └── Treasury/mint auth funding is optional                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

DAOs are immediately `active` upon creation. Treasury and mint authority multisigs are created but funding is optional.

---

## 2. Data Model

### 2.1 DAO Database Schema

New table `qm_daos`:

```sql
CREATE TABLE qm_daos (
  id SERIAL PRIMARY KEY,

  -- Token configuration
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,

  -- Client
  client_wallet TEXT NOT NULL,

  -- Squads multisigs
  treasury_multisig TEXT NOT NULL,
  treasury_vault TEXT NOT NULL,
  mint_auth_multisig TEXT NOT NULL,
  mint_auth_vault TEXT NOT NULL,

  -- Master/child relationship
  master_mint TEXT,                    -- NULL if master DAO
  master_dao_id INTEGER REFERENCES qm_daos(id),

  -- Linked moderator (created immediately)
  moderator_id INTEGER NOT NULL REFERENCES qm_moderators(id),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_daos_master ON qm_daos(master_dao_id);
CREATE UNIQUE INDEX idx_daos_token_mint ON qm_daos(token_mint);
```

### 2.2 Moderator Extension

Add optional `master` field to moderator configuration:

```typescript
interface ModeratorConfig {
  // Existing fields
  baseMint: PublicKey;
  quoteMint: PublicKey;
  // ... other existing fields

  // New field
  master?: PublicKey;  // Mint address of the master token
}
```

**Child moderator characteristics**:
- Has `master` set to a mint address
- Has **no spot pool** (no `poolAddress`)
- Uses master's spot pool for liquidity
- Whitelist keyed by moderator ID (not pool address)

**Constraints**:
- `master` must be different from `baseMint` and `quoteMint`
- `master` must match the `baseMint` or `quoteMint` of an existing moderator
- No nested children: if moderator A has `master` set, moderator A cannot be another moderator's master

### 2.3 Moderator Database Schema Extension

Extend `qm_moderators` table:

```sql
ALTER TABLE qm_moderators
ADD COLUMN master_mint TEXT DEFAULT NULL,
ADD COLUMN master_moderator_id INTEGER DEFAULT NULL REFERENCES qm_moderators(id);
```

| Column | Type | Description |
|--------|------|-------------|
| `master_mint` | TEXT | Mint address that links to master (nullable) |
| `master_moderator_id` | INTEGER | Resolved master moderator ID (nullable, FK) |

**Resolution**: When `master_mint` is set, resolve `master_moderator_id` by finding the moderator whose `baseMint` or `quoteMint` matches `master_mint`.

---

## 3. SDK Functions

### 3.1 `createDAO`

See Section 1.1 for interface definition.

**Implementation**:
1. Create Treasury multisig (2/3) using `@sqds/multisig`
2. Create Mint Authority multisig (1/1) using `@sqds/multisig`
3. Persist DAO to database with `status: 'pending_setup'`
4. Return vault addresses for client deposits

### 3.2 `createProposal`

Unified function that handles both master and child moderators:

```typescript
interface CreateProposalParams {
  daoId: number;                  // The DAO to create proposal for
  creator: PublicKey;             // Wallet creating the proposal

  // Proposal configuration
  length: number;                 // Duration in seconds
  fee: number;                    // Fee in basis points
  twapConfig: TWAPConfig;
  baseAmount: BN;                 // Liquidity to seed
  quoteAmount: BN;

  // Optional metadata
  title?: string;
  description?: string;
}

interface CreateProposalResult {
  proposalId: number;
  proposalPda: PublicKey;
  vaultPda: PublicKey;
  pools: PublicKey[];
  condBaseMints: PublicKey[];
  condQuoteMints: PublicKey[];

  // If child DAO, these reference the master
  actualModeratorId: number;      // Master's ID if child, own ID if master
  childDaoId?: number;            // Set if created via child DAO
}

async function createProposal(params: CreateProposalParams): Promise<CreateProposalResult>
```

**Behavior**:
1. Load DAO from database
2. Verify API key (caller authentication)
3. **If child DAO**:
   - Resolve master DAO
   - Check master has no live proposal (direct or via any child)
   - Use master's moderator for on-chain proposal
   - Withdraw liquidity from master's spot pool
4. **If master DAO**:
   - Use own moderator
   - Withdraw liquidity from own spot pool
5. Create proposal on-chain via `FutarchyClient.initializeProposal`
6. Launch proposal via `FutarchyClient.launchProposal`
7. Store proposal with `child_dao_id` if applicable
8. Return proposal details

---

## 4. Backend Integration (os-percent)

### 4.1 DAO Creation Endpoint

```
POST /api/daos
```

**Request**:
```typescript
{
  tokenMint: string;
  clientWallet: string;
  master?: string;              // Master token mint (if child DAO)
  tokenSymbol?: string;
  tokenName?: string;
}
```

**Response**:
```typescript
{
  daoId: number;
  moderatorId: number;
  treasuryVault: string;        // Optional - client can send funds here
  mintAuthVault: string;        // Optional - for mint authority transfer
  isChild: boolean;
  masterDaoId?: number;
}
```

### 4.2 Get DAO Endpoint

```
GET /api/daos/:id
```

Returns DAO details including treasury balance (informational).

### 4.3 Proposal Creation Endpoint (Modified)

```
POST /api/proposals
```

**Request**:
```typescript
{
  daoId: number;
  creator: string;
  length: number;
  fee: number;
  twapConfig: TWAPConfig;
  baseAmount: string;           // BN as string
  quoteAmount: string;          // BN as string
  title?: string;
  description?: string;
}
```

**Flow**:
```
1. Load DAO
2. Verify API key
3. If child DAO:
   a. Resolve master DAO
   b. Check master has no live proposal (direct or via any child)
   c. Build withdrawal from MASTER's spot pool
   d. Create proposal on MASTER's moderator
4. If master DAO:
   a. Build withdrawal from own spot pool
   b. Create proposal on own moderator
5. Store proposal with child_dao_id if applicable
6. Return proposal details
```

### 4.4 Proposal Query Mapping

Extend `qm_proposals`:

```sql
ALTER TABLE qm_proposals
ADD COLUMN child_dao_id INTEGER DEFAULT NULL REFERENCES qm_daos(id);
```

Proposals created via child DAO will have:
- `moderator_id` = master's moderator ID (on-chain owner)
- `child_dao_id` = child DAO ID (for UI routing)

---

## 5. Liquidity Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROPOSAL CREATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User requests proposal on Child Moderator (Token X)         │
│     └── Token X has NO spot pool (bootstrapping token)          │
│                           │                                      │
│                           ▼                                      │
│  2. Whitelist check: POOL_WHITELIST[childModeratorId]           │
│                           │                                      │
│                           ▼                                      │
│  3. Check master has no live proposal (direct or via child)     │
│                           │                                      │
│                           ▼                                      │
│  4. Resolve Master Moderator (Token Y)                          │
│                           │                                      │
│                           ▼                                      │
│  5. Withdraw liquidity from MASTER's spot pool (Token Y LP)     │
│     └── Returns: Token Y base + quote amounts                   │
│                           │                                      │
│                           ▼                                      │
│  6. Create proposal on Master Moderator (Token Y)               │
│     └── Uses Token Y mints                                      │
│     └── Creates Token Y conditional tokens                      │
│     └── Seeds Token Y liquidity to AMM pools                    │
│                           │                                      │
│                           ▼                                      │
│  7. Users trade Token Y conditional tokens directly             │
│     └── UI URL shows "Token X" label                            │
│     └── Actual trades are Token Y conditionals                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key point**: Child token has no liquidity involvement. All on-chain activity uses master token infrastructure.

---

## 6. UI Implications

| Aspect | Behavior |
|--------|----------|
| URL | Shows child token identifier (e.g., `/markets/tokenX/proposal-123`) |
| Trading | Users trade master's conditional tokens directly |
| Balances | Show master conditional token balances |
| Labels | No in-app label change - just URL routing |

---

## 7. Validation Rules

### 7.1 DAO Creation

| Rule | Error |
|------|-------|
| `master` equals `tokenMint` | `MASTER_CANNOT_BE_SELF` |
| `master` doesn't match any existing master DAO's token | `MASTER_NOT_FOUND` |
| Matched DAO is itself a child | `NESTED_CHILDREN_NOT_ALLOWED` |
| `tokenMint` already has a DAO | `DAO_ALREADY_EXISTS` |

### 7.2 Proposal Creation

| Rule | Error |
|------|-------|
| DAO not found | `DAO_NOT_FOUND` |
| Invalid API key | `INVALID_API_KEY` |
| Child's master DAO not found | `MASTER_DAO_NOT_FOUND` |
| Master DAO has a live proposal | `MASTER_HAS_ACTIVE_PROPOSAL` |
| Another child of same master has live proposal | `MASTER_HAS_ACTIVE_CHILD_PROPOSAL` |

---

## 8. API Summary

### SDK Functions

| Function | Description |
|----------|-------------|
| `createDAO(params)` | Create DAO with Squads multisigs, optionally as child |
| `createProposal(params)` | Create proposal (handles child→master routing) |
| `getDAO(id)` | Fetch DAO with master info |
| `getChildDAOs(masterDaoId)` | List all children of a master DAO |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/daos` | POST | Create DAO (with optional master) |
| `/api/daos` | GET | List all DAOs |
| `/api/daos/:id` | GET | Get DAO details |
| `/api/daos/:id/children` | GET | List child DAOs |
| `/api/proposals` | POST | Create proposal (handles child→master routing) |
| `/api/proposals/:id` | GET | Get proposal details |

---

## 9. Migration Path

1. **Database**: Create `qm_daos` table, extend `qm_moderators` and `qm_proposals`
2. **SDK**: Add `@sqds/multisig` dependency, implement `createDAO` and `createProposal`
3. **Backend**: Add DAO endpoints, modify proposal creation for child→master routing
4. **Existing moderators**: Unaffected (can be linked to DAOs retroactively if needed)

---

## 10. Resolved Design Decisions

1. **Liquidity source**: Child token has no spot pool. All liquidity comes from master's spot pool.

2. **Finalization**: No special handling needed. Users hold and redeem master's conditional tokens directly.

3. **One proposal per master at a time**: A master's liquidity can only support one live proposal. Fails if:
   - Master itself has a live proposal (`MASTER_HAS_ACTIVE_PROPOSAL`)
   - Another child of the same master has a live proposal (`MASTER_HAS_ACTIVE_CHILD_PROPOSAL`)

4. **Nesting**: Not allowed. A child cannot be another moderator's master.
