/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/amm.json`.
 */
export type Amm = {
  "address": "AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC",
  "metadata": {
    "name": "amm",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addLiquidity",
      "discriminator": [
        181,
        157,
        89,
        67,
        143,
        182,
        52,
        72
      ],
      "accounts": [
        {
          "name": "depositor",
          "signer": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.admin",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "depositorTokenAccA",
          "writable": true
        },
        {
          "name": "depositorTokenAccB",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amountA",
          "type": "u64"
        },
        {
          "name": "amountB",
          "type": "u64"
        }
      ]
    },
    {
      "name": "ceaseTrading",
      "discriminator": [
        187,
        140,
        73,
        84,
        119,
        249,
        38,
        212
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.admin",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "crankTwap",
      "discriminator": [
        43,
        127,
        177,
        237,
        243,
        153,
        31,
        162
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.admin",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveA",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveB",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        }
      ],
      "args": [],
      "returns": {
        "option": "u128"
      }
    },
    {
      "name": "createPool",
      "discriminator": [
        233,
        146,
        209,
        142,
        207,
        104,
        64,
        188
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "mintA"
        },
        {
          "name": "mintB"
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "account",
                "path": "mintA"
              },
              {
                "kind": "account",
                "path": "mintB"
              }
            ]
          }
        },
        {
          "name": "reserveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "mintA"
              }
            ]
          }
        },
        {
          "name": "reserveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "mintB"
              }
            ]
          }
        },
        {
          "name": "feeAuthority",
          "address": "FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC"
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fee",
          "type": "u16"
        },
        {
          "name": "startingObservation",
          "type": "u128"
        },
        {
          "name": "maxObservationDelta",
          "type": "u128"
        },
        {
          "name": "warmupDuration",
          "type": "u32"
        },
        {
          "name": "liquidityProvider",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "removeLiquidity",
      "discriminator": [
        80,
        85,
        209,
        72,
        24,
        206,
        177,
        108
      ],
      "accounts": [
        {
          "name": "depositor",
          "signer": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.admin",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "depositorTokenAccA",
          "writable": true
        },
        {
          "name": "depositorTokenAccB",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amountA",
          "type": "u64"
        },
        {
          "name": "amountB",
          "type": "u64"
        }
      ]
    },
    {
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "trader",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.admin",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_a",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "reserveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.mint_b",
                "account": "poolAccount"
              }
            ]
          }
        },
        {
          "name": "feeVault",
          "docs": [
            "Fee vault with hardcoded fee authority wallet"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "traderAccountA",
          "writable": true
        },
        {
          "name": "traderAccountB",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "swapAToB",
          "type": "bool"
        },
        {
          "name": "inputAmount",
          "type": "u64"
        },
        {
          "name": "minOutputAmount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "poolAccount",
      "discriminator": [
        116,
        210,
        187,
        119,
        196,
        196,
        52,
        137
      ]
    }
  ],
  "events": [
    {
      "name": "condSwap",
      "discriminator": [
        99,
        23,
        169,
        57,
        70,
        218,
        240,
        69
      ]
    },
    {
      "name": "liquidityAdded",
      "discriminator": [
        154,
        26,
        221,
        108,
        238,
        64,
        217,
        161
      ]
    },
    {
      "name": "liquidityRemoved",
      "discriminator": [
        225,
        105,
        216,
        39,
        124,
        116,
        169,
        189
      ]
    },
    {
      "name": "poolCreated",
      "discriminator": [
        202,
        44,
        41,
        88,
        104,
        220,
        157,
        82
      ]
    },
    {
      "name": "twapUpdate",
      "discriminator": [
        48,
        209,
        39,
        135,
        187,
        76,
        144,
        38
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAdmin",
      "msg": "Invalid admin"
    },
    {
      "code": 6001,
      "name": "invalidDepositor",
      "msg": "Invalid depositor"
    },
    {
      "code": 6002,
      "name": "invalidState",
      "msg": "Invalid state"
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6004,
      "name": "slippageExceeded",
      "msg": "Slippage exceeded"
    },
    {
      "code": 6005,
      "name": "invariantViolated",
      "msg": "Invariant violated"
    },
    {
      "code": 6006,
      "name": "emptyPool",
      "msg": "Pool is empty"
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6008,
      "name": "mathUnderflow",
      "msg": "Math underflow"
    },
    {
      "code": 6009,
      "name": "outputTooSmall",
      "msg": "Output too small"
    },
    {
      "code": 6010,
      "name": "insufficientReserve",
      "msg": "Insufficient reserve balance"
    },
    {
      "code": 6011,
      "name": "invalidFee",
      "msg": "Fee exceeds maximum"
    }
  ],
  "types": [
    {
      "name": "condSwap",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "swapAToB",
            "type": "bool"
          },
          {
            "name": "inputAmount",
            "type": "u64"
          },
          {
            "name": "outputAmount",
            "type": "u64"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidityAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "amountA",
            "type": "u64"
          },
          {
            "name": "amountB",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidityRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "amountA",
            "type": "u64"
          },
          {
            "name": "amountB",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poolAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bumps",
            "type": {
              "defined": {
                "name": "poolBumps"
              }
            }
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "poolState"
              }
            }
          },
          {
            "name": "mintA",
            "type": "pubkey"
          },
          {
            "name": "mintB",
            "type": "pubkey"
          },
          {
            "name": "fee",
            "type": "u16"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "liquidityProvider",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "twapOracle"
              }
            }
          }
        ]
      }
    },
    {
      "name": "poolBumps",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "u8"
          },
          {
            "name": "reserveA",
            "type": "u8"
          },
          {
            "name": "reserveB",
            "type": "u8"
          },
          {
            "name": "feeVault",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "mintA",
            "type": "pubkey"
          },
          {
            "name": "mintB",
            "type": "pubkey"
          },
          {
            "name": "fee",
            "type": "u16"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "poolState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "trading"
          },
          {
            "name": "finalized"
          }
        ]
      }
    },
    {
      "name": "twapUpdate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "unixTime",
            "type": "i64"
          },
          {
            "name": "price",
            "type": "u128"
          },
          {
            "name": "observation",
            "type": "u128"
          },
          {
            "name": "cumulativeObservations",
            "type": "u128"
          },
          {
            "name": "twap",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "twapOracle",
      "docs": [
        "TWAP oracle that tracks time-weighted average prices with manipulation resistance.",
        "",
        "Observations are rate-limited to prevent flash loan and single-block attacks.",
        "The cumulative_observations field accumulates (observation * time_elapsed) which",
        "can be divided by total time to get the TWAP."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cumulativeObservations",
            "docs": [
              "Running sum of (observation * seconds_elapsed) used for TWAP calculation.",
              "On overflow, wraps back to 0 - clients should handle this edge case."
            ],
            "type": "u128"
          },
          {
            "name": "lastUpdateUnixTime",
            "docs": [
              "Unix timestamp of the most recent price recording"
            ],
            "type": "i64"
          },
          {
            "name": "createdAtUnixTime",
            "docs": [
              "Unix timestamp when this oracle was initialized"
            ],
            "type": "i64"
          },
          {
            "name": "lastPrice",
            "docs": [
              "Most recent raw price from pool reserves (reserves_a / reserves_b * PRICE_SCALE)"
            ],
            "type": "u128"
          },
          {
            "name": "lastObservation",
            "docs": [
              "Rate-limited observation that moves toward price bounded by max_observation_delta"
            ],
            "type": "u128"
          },
          {
            "name": "maxObservationDelta",
            "docs": [
              "Maximum amount observation can change per crank (manipulation resistance)"
            ],
            "type": "u128"
          },
          {
            "name": "startingObservation",
            "docs": [
              "Initial value for last_observation when oracle is created"
            ],
            "type": "u128"
          },
          {
            "name": "warmupDuration",
            "docs": [
              "Seconds after creation before TWAP accumulation begins"
            ],
            "type": "u32"
          },
          {
            "name": "minRecordingInterval",
            "docs": [
              "Minimum time in-between TWAP recordings"
            ],
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "ammVersion",
      "type": "u8",
      "value": "1"
    },
    {
      "name": "feeAuthority",
      "type": "pubkey",
      "value": "FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC"
    },
    {
      "name": "feeVaultSeed",
      "type": "bytes",
      "value": "[102, 101, 101, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "maxFee",
      "type": "u16",
      "value": "5000"
    },
    {
      "name": "poolSeed",
      "type": "bytes",
      "value": "[112, 111, 111, 108]"
    },
    {
      "name": "reserveSeed",
      "type": "bytes",
      "value": "[114, 101, 115, 101, 114, 118, 101]"
    }
  ]
};
