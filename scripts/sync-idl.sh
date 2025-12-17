#!/bin/bash

# Sync IDL and types from anchor build output to SDK
# Run this after `anchor build` to update SDK generated files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

IDL_DIR="$ROOT_DIR/target/idl"
TYPES_DIR="$ROOT_DIR/target/types"
SDK_DIR="$ROOT_DIR/sdk/src"

# Programs to sync
PROGRAMS=("amm" "futarchy" "vault")

echo "Syncing IDL and types to SDK..."

for prog in "${PROGRAMS[@]}"; do
    echo "  → $prog"

    # Copy IDL JSON
    if [ -f "$IDL_DIR/$prog.json" ]; then
        cp "$IDL_DIR/$prog.json" "$SDK_DIR/$prog/generated/$prog.json"
    else
        echo "    ⚠️  IDL not found: $IDL_DIR/$prog.json"
    fi

    # Copy types TS
    if [ -f "$TYPES_DIR/$prog.ts" ]; then
        cp "$TYPES_DIR/$prog.ts" "$SDK_DIR/$prog/generated/$prog.ts"
    else
        echo "    ⚠️  Types not found: $TYPES_DIR/$prog.ts"
    fi
done

echo "✓ Done"
