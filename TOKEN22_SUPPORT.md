# Token-2022 Support Roadmap

This document outlines the changes required to support Token-2022 (SPL Token Extensions) base mints in the Futarchy governance system.

## Current Status

**Token-2022 base mints are NOT currently supported.**

The DAO API endpoints will reject Token-2022 base mints with a clear error message. Only SPL Token base mints are accepted.

## Why Token-2022 Is Not Supported

The Futarchy on-chain program validates that base and quote mints are owned by the SPL Token program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`). Token-2022 mints are owned by a different program (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`), causing validation to fail.

## Changes Required

### 1. On-Chain Program Changes (Futarchy)

The following files need to be updated to accept both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID:

#### 1.1 `programs/futarchy/src/instructions/initialize_moderator.rs`

**Current code (lines 6, 15-23):**
```rust
use anchor_spl::token;

/// CHECK: checked via owner
#[account(
    owner = token::ID @ FutarchyError::InvalidMint
)]
pub base_mint: UncheckedAccount<'info>,
/// CHECK: checked via owner
#[account(
    owner = token::ID @ FutarchyError::InvalidMint
)]
pub quote_mint: UncheckedAccount<'info>,
```

**Required change:**
```rust
use anchor_spl::{token::ID as TOKEN_PROGRAM_ID, token_2022::ID as TOKEN_2022_PROGRAM_ID};

/// CHECK: checked via owner constraint
#[account(
    constraint = (
        *base_mint.owner == TOKEN_PROGRAM_ID ||
        *base_mint.owner == TOKEN_2022_PROGRAM_ID
    ) @ FutarchyError::InvalidMint
)]
pub base_mint: UncheckedAccount<'info>,
/// CHECK: checked via owner constraint
#[account(
    constraint = (
        *quote_mint.owner == TOKEN_PROGRAM_ID ||
        *quote_mint.owner == TOKEN_2022_PROGRAM_ID
    ) @ FutarchyError::InvalidMint
)]
pub quote_mint: UncheckedAccount<'info>,
```

#### 1.2 `programs/futarchy/src/instructions/initialize_parent_dao.rs`

**Lines to update:** 7, 41-50

Apply the same pattern as above for `base_mint` and `quote_mint` account constraints.

#### 1.3 `programs/futarchy/src/instructions/upgrade_dao.rs`

**Lines to update:** 6, 61-70

Apply the same pattern as above for `base_mint` and `quote_mint` account constraints.

#### 1.4 Reference Implementation

`programs/futarchy/src/instructions/initialize_child_dao.rs` **already supports Token-2022** and can be used as a reference:

```rust
use anchor_spl::{token::ID as TOKEN_PROGRAM_ID, token_2022::ID as TOKEN_2022_PROGRAM_ID};

/// CHECK: checked via owner
#[account(
    constraint = (
        *token_mint.owner == TOKEN_PROGRAM_ID ||
        *token_mint.owner == TOKEN_2022_PROGRAM_ID
    ) @ FutarchyError::InvalidMint
)]
pub token_mint: UncheckedAccount<'info>,
```

### 2. On-Chain Program Changes (Vault) - Optional

#### 2.1 `programs/vault/src/common.rs`

**Current code (line 96):**
```rust
require!(
    user_ata_info.owner == &TOKEN_PROGRAM_ID,
    VaultError::InvalidAccountOwner
);
```

**Required change:**
```rust
require!(
    user_ata_info.owner == &TOKEN_PROGRAM_ID ||
    user_ata_info.owner == &TOKEN_2022_PROGRAM_ID,
    VaultError::InvalidAccountOwner
);
```

Also add the import:
```rust
use anchor_spl::token_2022::ID as TOKEN_2022_PROGRAM_ID;
```

### 3. SDK Changes (@zcomb/programs-sdk)

The SDK needs updates to support Token-2022 **base and quote mints only**. Conditional mints (pass/fail tokens) are always created by the vault program using the regular SPL Token program, so they do not need changes.

#### 3.1 Scope Clarification

| Token Type | Token Program | Needs SDK Changes? |
|------------|---------------|-------------------|
| Base mint (e.g., OOGWAY, governance token) | Could be Token-2022 | **Yes** |
| Quote mint (e.g., USDC) | Could be Token-2022 | **Yes** |
| Conditional mints (pass/fail tokens) | Always SPL Token | **No** |

#### 3.2 Files Requiring Changes

**`sdk/src/vault/client.ts`** (~3 changes):
| Line | Code | Reason |
|------|------|--------|
| 83 | `userAta: getAssociatedTokenAddressSync(mint, user)` | Base/quote user ATA |
| 91 | `getAssociatedTokenAddressSync(mint, vaultPda, true)` | Base/quote vault ATA |
| 100 | `getAccount(connection, ata)` | Missing programId parameter |

**`sdk/src/futarchy/client.ts`** (~15 changes for base/quote ATAs):
| Lines | Description |
|-------|-------------|
| 214-215 | `baseTokenAcc`, `quoteTokenAcc` for vault |
| 335-338 | `vault_base_ata`, `vault_quote_ata`, `user_base_ata`, `user_quote_ata` |
| 504-505 | Vault base ATA, user base ATA |
| 516-517 | Vault quote ATA, user quote ATA |
| 576-580 | Vault and user base/quote ATAs |
| 773-777 | Moderator base/quote ATAs |

**Files that do NOT need changes** (conditional mint ATAs - always SPL):
- `sdk/src/vault/instructions.ts:90,121,164` - Conditional token ATAs
- `sdk/src/vault/client.ts:84` - Conditional token user ATAs
- `sdk/src/amm/client.ts` - AMM pools use conditional tokens
- `sdk/src/futarchy/client.ts:317-318,422-423,491-492,511,522,593-594,797-798` - Conditional ATAs

#### 3.3 Required Pattern

**Option A: Detect token program automatically (recommended)**
```typescript
async function getTokenProgramForMint(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(mint);
  if (!accountInfo) throw new Error(`Mint not found: ${mint.toBase58()}`);
  return accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
}

// Usage
const tokenProgram = await getTokenProgramForMint(connection, mint);
const ata = getAssociatedTokenAddressSync(mint, user, false, tokenProgram);
```

**Option B: Accept token program as parameter**
```typescript
// Add tokenProgram parameter to SDK methods
async function getUserVaultAccounts(
  connection: Connection,
  user: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  baseTokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  quoteTokenProgram: PublicKey = TOKEN_PROGRAM_ID,
) {
  const baseAta = getAssociatedTokenAddressSync(baseMint, user, false, baseTokenProgram);
  // ...
}
```

#### 3.4 getAccount Calls

All `getAccount` calls for base/quote token accounts need the token program:
```typescript
// Before
const account = await getAccount(connection, ata);

// After
const account = await getAccount(connection, ata, 'confirmed', tokenProgram);
```

### 4. UI Changes (os-percent/ui)

#### 4.1 Completed

The following files have been updated to pass `programId` to `getAccount` calls:

- `ui/hooks/useWalletBalances.ts:86,100` - Base/quote token balance fetching
- `ui/lib/programs/futarchy.ts:184-185` - Winning mint balance fetching
- `ui/lib/programs/vault.ts:243-244` - Winning mint balance fetching

These changes use the existing `getTokenProgramForMint()` utility in `ui/lib/programs/utils.ts` which correctly detects Token-2022 mints.

#### 4.2 Blocking Logic

- `routes/dao/creation.ts` - Added `isToken2022Mint()` check to reject Token-2022 base mints until on-chain and SDK support is complete

### 5. Implementation Order

1. **Phase 1: On-Chain Program**
   - Update `initialize_moderator.rs`
   - Update `initialize_parent_dao.rs`
   - Update `upgrade_dao.rs`
   - (Optional) Update `vault/common.rs`
   - Deploy updated programs

2. **Phase 2: SDK**
   - Add token program detection utility
   - Update ~18 `getAssociatedTokenAddressSync` calls for base/quote mints
   - Update `getAccount` calls with programId
   - Publish new SDK version

3. **Phase 3: UI**
   - Remove Token-2022 blocking logic from `routes/dao/creation.ts`
   - Verify all flows work with Token-2022 base mints

### 6. Testing Checklist

After implementing changes:

- [ ] Create Token-2022 token with MetadataPointer extension
- [ ] Create DAMM pool with Token-2022 base + SOL quote
- [ ] Create DAMM pool with Token-2022 base + USDC quote
- [ ] Create DLMM pool with Token-2022 base + SOL quote
- [ ] Create DLMM pool with Token-2022 base + USDC quote
- [ ] Create parent DAO with Token-2022 base mint
- [ ] Create child DAO with Token-2022 base mint
- [ ] Create and finalize proposal with Token-2022 DAO
- [ ] Verify liquidity operations (withdraw, deposit, cleanup-swap)
- [ ] Verify conditional token minting/burning works correctly

### 7. Notes

- Quote tokens (SOL via WSOL, USDC) are typically SPL Token, but could be Token-2022
- **Conditional tokens (pass/fail) are always created by the vault program as SPL Token** - this is why ~30 of the SDK's `getAssociatedTokenAddressSync` calls do not need changes
- MetadataPointer extension is required for Token-2022 tokens to work with Meteora DLMM pools
- DAMM pool creation already supports Token-2022 base tokens

---

**Last Updated:** 2025-01-09
**Status:** Phase 3 in progress (UI fixes applied)
