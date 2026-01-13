#!/bin/bash

# Converts a Solana JSON wallet to base58 public and private keys
# Usage: ./wallet-to-base58.sh <wallet.json>

if [ -z "$1" ]; then
    echo "Usage: $0 <wallet.json>"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Error: File '$1' not found"
    exit 1
fi

WALLET_PATH="$1" python3 << 'EOF'
import json
import os

# Base58 alphabet used by Bitcoin/Solana
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def base58_encode(data: bytes) -> str:
    """Encode bytes to base58 string."""
    # Count leading zeros
    leading_zeros = 0
    for byte in data:
        if byte == 0:
            leading_zeros += 1
        else:
            break

    # Convert bytes to integer
    num = int.from_bytes(data, 'big')

    # Encode to base58
    result = ""
    while num > 0:
        num, remainder = divmod(num, 58)
        result = ALPHABET[remainder] + result

    # Add leading '1's for each leading zero byte
    return '1' * leading_zeros + result

wallet_path = os.environ['WALLET_PATH']

with open(wallet_path, 'r') as f:
    keypair_bytes = json.load(f)

if not isinstance(keypair_bytes, list) or len(keypair_bytes) != 64:
    print("Error: Invalid wallet format. Expected 64-byte array.")
    exit(1)

keypair = bytes(keypair_bytes)
public_key = keypair[32:]

# Private key is the full 64-byte keypair in Solana convention
private_key_b58 = base58_encode(keypair)
public_key_b58 = base58_encode(public_key)

print(f"Public Key:  {public_key_b58}")
print(f"Private Key: {private_key_b58}")
EOF
