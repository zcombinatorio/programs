# Architecture Comparison: Moderator-DAO Relationships

This document compares two architectural approaches for organizing the relationship between moderators, DAOs, and liquidity.

---

## Core Entities

| Entity | Description |
|--------|-------------|
| **DAO** | Governance infrastructure: treasury multisig + mint authority multisig |
| **Moderator** | On-chain entity that owns spot liquidity and creates proposal markets |
| **Spot Liquidity** | LP position in a spot pool (DAMM/DLMM) used to seed proposal markets |

---

## System A: Moderators Own Multiple DAOs

### Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         MODERATOR                                │
│              (owns spot liquidity, creates markets)              │
├─────────────────────────────────────────────────────────────────┤
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│              ▼               ▼               ▼                  │
│           ┌─────┐        ┌─────┐        ┌─────┐                │
│           │DAO A│        │DAO B│        │DAO C│                │
│           └─────┘        └─────┘        └─────┘                │
│          treasury       treasury       treasury                 │
│          mint auth      mint auth      mint auth                │
└─────────────────────────────────────────────────────────────────┘
```

### Relationships

| Relationship | Cardinality |
|--------------|-------------|
| Moderator → DAO | 1:N (one moderator owns many DAOs) |
| DAO → Moderator | N:1 (each DAO belongs to exactly one moderator) |

### Responsibilities

| Entity | Responsibilities |
|--------|------------------|
| **Moderator** | Owns spot liquidity, creates proposal markets, executes on-chain proposal creation |
| **DAO** | Holds treasury, holds mint authority, manages proposal whitelist, initiates proposals |

### Proposal Flow

```
1. User requests proposal on DAO A
2. DAO A checks whitelist
3. DAO A forwards to its Moderator
4. Moderator withdraws from spot LP
5. Moderator creates proposal markets
6. Proposal is associated with DAO A
```

### Data Model

```sql
-- Moderators own spot liquidity
CREATE TABLE moderators (
  id SERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,        -- Spot LP pool
  pool_type TEXT NOT NULL,           -- 'damm' | 'dlmm'
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  moderator_pda TEXT NOT NULL        -- On-chain moderator account
);

-- DAOs are governance shells, owned by moderators
CREATE TABLE daos (
  id SERIAL PRIMARY KEY,
  moderator_id INTEGER NOT NULL REFERENCES moderators(id),
  token_mint TEXT NOT NULL,
  treasury_vault TEXT NOT NULL,
  mint_auth_vault TEXT NOT NULL,
  whitelist JSONB                    -- Authorized proposal creators
);

-- Proposals belong to DAOs
CREATE TABLE proposals (
  id SERIAL PRIMARY KEY,
  dao_id INTEGER NOT NULL REFERENCES daos(id),
  -- ... proposal fields
);
```

### Pros

- Clear separation: Moderators = liquidity, DAOs = governance
- Multiple tokens can share one liquidity source explicitly
- Moderator is the "platform" concept, DAOs are "clients"

### Cons

- Extra indirection layer
- "Moderator owns DAOs" may be confusing terminology
- Whitelist lives on DAO but liquidity lives on Moderator

---

## System B: Parent/Child DAO Hierarchy

### Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                       PARENT DAO                                 │
│         (has treasury, mint auth, AND spot liquidity)           │
│                            │                                     │
│                     ┌──────┴──────┐                             │
│                     │  MODERATOR  │ ◄── 1:1 relationship        │
│                     └──────┬──────┘                             │
│                            │                                     │
├─────────────────────────────────────────────────────────────────┤
│                            │                                     │
│              ┌─────────────┼─────────────┐                      │
│              │             │             │                      │
│              ▼             ▼             ▼                      │
│        ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│        │ CHILD DAO│  │ CHILD DAO│  │ CHILD DAO│                │
│        │    A     │  │    B     │  │    C     │                │
│        └──────────┘  └──────────┘  └──────────┘                │
│        treasury      treasury      treasury                     │
│        mint auth     mint auth     mint auth                    │
│        NO liquidity  NO liquidity  NO liquidity                 │
│        NO moderator  NO moderator  NO moderator                 │
└─────────────────────────────────────────────────────────────────┘
```

### Relationships

| Relationship | Cardinality |
|--------------|-------------|
| Parent DAO → Moderator | 1:1 |
| Parent DAO → Child DAO | 1:N |
| Child DAO → Parent DAO | N:1 |
| Child DAO → Moderator | None (proxied through parent) |

### Responsibilities

| Entity | Responsibilities |
|--------|------------------|
| **Parent DAO** | Treasury, mint auth, spot liquidity (via moderator), can create proposals directly |
| **Child DAO** | Treasury, mint auth, whitelist, initiates proposals (proxied to parent) |
| **Moderator** | On-chain proposal creation, 1:1 with parent DAO |

### Proposal Flow

```
1. User requests proposal on Child DAO A
2. Child DAO A checks whitelist
3. Child DAO A proxies request to Parent DAO
4. Parent DAO's Moderator withdraws from spot LP
5. Moderator creates proposal markets
6. Proposal is associated with Child DAO A (but uses Parent's liquidity)
```

### Data Model

```sql
-- DAOs can be parent or child
CREATE TABLE daos (
  id SERIAL PRIMARY KEY,
  token_mint TEXT NOT NULL,
  treasury_vault TEXT NOT NULL,
  mint_auth_vault TEXT NOT NULL,
  whitelist JSONB,

  -- Parent/child relationship
  parent_dao_id INTEGER REFERENCES daos(id),  -- NULL if parent

  -- Only parent DAOs have moderators and liquidity
  moderator_id INTEGER REFERENCES moderators(id),  -- NULL if child
  pool_address TEXT,                               -- NULL if child
  pool_type TEXT                                   -- NULL if child
);

-- Moderators are 1:1 with parent DAOs
CREATE TABLE moderators (
  id SERIAL PRIMARY KEY,
  dao_id INTEGER NOT NULL UNIQUE REFERENCES daos(id),
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  moderator_pda TEXT NOT NULL
);

-- Proposals track which DAO initiated them
CREATE TABLE proposals (
  id SERIAL PRIMARY KEY,
  parent_dao_id INTEGER NOT NULL REFERENCES daos(id),  -- Always parent
  child_dao_id INTEGER REFERENCES daos(id),            -- NULL if parent-initiated
  -- ... proposal fields
);
```

### Pros

- Simpler mental model: DAOs are the primary entity
- Parent/child is intuitive for "platform token" / "client token" relationship
- Whitelist and liquidity both conceptually "belong to" DAOs

### Cons

- Moderator becomes an implementation detail rather than a first-class concept
- 1:1 moderator-parent relationship may feel redundant
- "Parent DAO" does double duty (governance + liquidity)

---

## Comparison Table

| Aspect | System A (Moderator-centric) | System B (DAO-centric) |
|--------|------------------------------|------------------------|
| **Primary entity** | Moderator | DAO |
| **Liquidity ownership** | Moderator | Parent DAO (via moderator) |
| **Governance ownership** | DAO | DAO |
| **Hierarchy** | Moderator → DAOs | Parent DAO → Child DAOs |
| **Moderator cardinality** | 1 moderator : N DAOs | 1 moderator : 1 parent DAO |
| **Whitelist location** | DAO | DAO |
| **Proposal proxy** | DAO → Moderator | Child DAO → Parent DAO |
| **Mental model** | "Platform with clients" | "Parent with children" |

---

## Key Questions

1. **Who is the "owner" in the client's mental model?**
   - If they think of themselves as a "platform" with a liquidity pool serving multiple client tokens → System A
   - If they think of themselves as a "parent token" with child tokens → System B

2. **Should moderators be visible to clients?**
   - If yes → System A (moderator is explicit)
   - If no → System B (moderator is implementation detail)

3. **Could a DAO ever need to switch moderators/parents?**
   - System A: Easier (just update foreign key)
   - System B: Harder (would need to restructure hierarchy)

4. **Could a moderator ever need to own DAOs from different liquidity sources?**
   - System A: No (moderator = one liquidity source)
   - System B: N/A (moderator is 1:1 with parent)

---

## Recommendation

**System B (Parent/Child DAO hierarchy)** appears to be the better fit for the current use case because:

1. The client already thinks in terms of "their token" (parent) and "client tokens" (children)
2. Moderator as an implementation detail reduces cognitive load
3. The 1:1 parent-moderator relationship avoids confusion about which liquidity source serves which DAO
4. Proposal proxying from child → parent is intuitive

However, **System A** could be better if:
- Multiple independent liquidity sources need to be managed
- The platform wants to explicitly expose the "moderator" concept to clients
- DAOs need to be reorganized between moderators frequently
