/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/futarchy.json`.
 */
export type Futarchy = {
  "address": "FUT2Nd1EdJGZLgKdNkNeyTGS3nX76PRTQa4Wx9YcDfZC",
  "metadata": {
    "name": "futarchy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addHistoricalProposal",
      "discriminator": [
        125,
        119,
        66,
        65,
        159,
        52,
        65,
        160
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "moderator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "moderator.id",
                "account": "moderatorAccount"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "moderator"
              },
              {
                "kind": "account",
                "path": "moderator.proposal_id_counter",
                "account": "moderatorAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "numOptions",
          "type": "u8"
        },
        {
          "name": "winningIdx",
          "type": "u8"
        },
        {
          "name": "length",
          "type": "u16"
        },
        {
          "name": "createdAt",
          "type": "i64"
        }
      ],
      "returns": "u16"
    },
    {
      "name": "addOption",
      "discriminator": [
        229,
        150,
        102,
        127,
        99,
        5,
        34,
        196
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.moderator",
                "account": "proposalAccount"
              },
              {
                "kind": "account",
                "path": "proposal.id",
                "account": "proposalAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "vaultProgram",
          "address": "VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC"
        },
        {
          "name": "ammProgram",
          "address": "AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeProposal",
      "discriminator": [
        23,
        68,
        51,
        167,
        109,
        173,
        187,
        164
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.moderator",
                "account": "proposalAccount"
              },
              {
                "kind": "account",
                "path": "proposal.id",
                "account": "proposalAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultProgram",
          "address": "VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC"
        },
        {
          "name": "ammProgram",
          "address": "AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC"
        }
      ],
      "args": []
    },
    {
      "name": "initializeModerator",
      "discriminator": [
        142,
        175,
        48,
        111,
        170,
        41,
        76,
        51
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "moderator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "global_config.moderator_id_counter",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [],
      "returns": "u32"
    },
    {
      "name": "initializeProposal",
      "discriminator": [
        50,
        73,
        156,
        98,
        129,
        149,
        21,
        158
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "moderator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "moderator.id",
                "account": "moderatorAccount"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "moderator"
              },
              {
                "kind": "account",
                "path": "moderator.proposal_id_counter",
                "account": "moderatorAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "vaultProgram",
          "address": "VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC"
        },
        {
          "name": "ammProgram",
          "address": "AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "length",
          "type": "u16"
        },
        {
          "name": "fee",
          "type": "u16"
        },
        {
          "name": "twapConfig",
          "type": {
            "defined": {
              "name": "twapConfig"
            }
          }
        }
      ],
      "returns": "u16"
    },
    {
      "name": "launchProposal",
      "discriminator": [
        16,
        211,
        189,
        119,
        245,
        72,
        0,
        229
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.moderator",
                "account": "proposalAccount"
              },
              {
                "kind": "account",
                "path": "proposal.id",
                "account": "proposalAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "vaultProgram",
          "address": "VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC"
        },
        {
          "name": "ammProgram",
          "address": "AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "baseAmount",
          "type": "u64"
        },
        {
          "name": "quoteAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemLiquidity",
      "discriminator": [
        180,
        117,
        142,
        137,
        227,
        225,
        97,
        211
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "proposal",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.moderator",
                "account": "proposalAccount"
              },
              {
                "kind": "account",
                "path": "proposal.id",
                "account": "proposalAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vaultProgram",
          "address": "VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC"
        },
        {
          "name": "ammProgram",
          "address": "AMMAMtHtLPKwDgkDEyccLD8Sd7AtaemgawsNTC9ccQZC"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "moderatorAccount",
      "discriminator": [
        129,
        208,
        190,
        35,
        9,
        28,
        249,
        53
      ]
    },
    {
      "name": "proposalAccount",
      "discriminator": [
        164,
        190,
        4,
        248,
        203,
        124,
        243,
        64
      ]
    }
  ],
  "events": [
    {
      "name": "liquidityRedeemed",
      "discriminator": [
        78,
        81,
        213,
        176,
        1,
        84,
        138,
        65
      ]
    },
    {
      "name": "moderatorInitialized",
      "discriminator": [
        28,
        29,
        85,
        133,
        161,
        89,
        54,
        108
      ]
    },
    {
      "name": "optionAdded",
      "discriminator": [
        136,
        202,
        18,
        117,
        144,
        187,
        122,
        249
      ]
    },
    {
      "name": "proposalFinalized",
      "discriminator": [
        159,
        104,
        210,
        220,
        86,
        209,
        61,
        51
      ]
    },
    {
      "name": "proposalInitialized",
      "discriminator": [
        148,
        198,
        58,
        182,
        198,
        50,
        13,
        60
      ]
    },
    {
      "name": "proposalLaunched",
      "discriminator": [
        39,
        113,
        126,
        109,
        167,
        203,
        187,
        47
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidVault",
      "msg": "Vault account mismatch"
    },
    {
      "code": 6001,
      "name": "invalidPools",
      "msg": "Pool account mismatch"
    },
    {
      "code": 6002,
      "name": "invalidMint",
      "msg": "Mint mismatch"
    },
    {
      "code": 6003,
      "name": "invalidPoolProgram",
      "msg": "Invalid Pool Program"
    },
    {
      "code": 6004,
      "name": "notEnoughOptions",
      "msg": "Minimum 2 options required"
    },
    {
      "code": 6005,
      "name": "tooManyOptions",
      "msg": "Too many options"
    },
    {
      "code": 6006,
      "name": "invalidRemainingAccounts",
      "msg": "Invalid remaining accounts"
    },
    {
      "code": 6007,
      "name": "invalidState",
      "msg": "Invalid proposal state"
    },
    {
      "code": 6008,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6009,
      "name": "proposalNotExpired",
      "msg": "Proposal has not expired yet"
    },
    {
      "code": 6010,
      "name": "twapNotReady",
      "msg": "TWAP not ready"
    },
    {
      "code": 6011,
      "name": "counterOverflow",
      "msg": "Counter overflow"
    },
    {
      "code": 6012,
      "name": "invalidWinningIndex",
      "msg": "Winning index exceeds number of options"
    },
    {
      "code": 6013,
      "name": "invalidVersion",
      "msg": "Invalid account version"
    }
  ],
  "types": [
    {
      "name": "globalConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "moderatorIdCounter",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "liquidityRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposalId",
            "type": "u16"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "redeemer",
            "type": "pubkey"
          },
          {
            "name": "winningIdx",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "moderatorAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "proposalIdCounter",
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
      "name": "moderatorInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "moderator",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "optionAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposalId",
            "type": "u16"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "optionIndex",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proposalAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "moderator",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "numOptions",
            "type": "u8"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "proposalState"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "length",
            "type": "u16"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "pools",
            "type": {
              "array": [
                "pubkey",
                6
              ]
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "fee",
            "type": "u16"
          },
          {
            "name": "twapConfig",
            "type": {
              "defined": {
                "name": "twapConfig"
              }
            }
          }
        ]
      }
    },
    {
      "name": "proposalFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposalId",
            "type": "u16"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "winningIdx",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proposalInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "proposalId",
            "type": "u16"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "moderator",
            "type": "pubkey"
          },
          {
            "name": "length",
            "type": "u16"
          },
          {
            "name": "creator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "proposalLaunched",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposalId",
            "type": "u16"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "numOptions",
            "type": "u8"
          },
          {
            "name": "baseAmount",
            "type": "u64"
          },
          {
            "name": "quoteAmount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "proposalState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "setup"
          },
          {
            "name": "pending"
          },
          {
            "name": "resolved",
            "fields": [
              "u8"
            ]
          }
        ]
      }
    },
    {
      "name": "twapConfig",
      "type": {
        "kind": "struct",
        "fields": [
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
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "globalConfigSeed",
      "type": "bytes",
      "value": "[103, 108, 111, 98, 97, 108, 95, 99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "globalConfigVersion",
      "type": "u8",
      "value": "1"
    },
    {
      "name": "maxOptions",
      "type": "u8",
      "value": "6"
    },
    {
      "name": "minOptions",
      "type": "u8",
      "value": "2"
    },
    {
      "name": "moderatorSeed",
      "type": "bytes",
      "value": "[109, 111, 100, 101, 114, 97, 116, 111, 114]"
    },
    {
      "name": "moderatorVersion",
      "type": "u8",
      "value": "1"
    },
    {
      "name": "proposalSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 112, 111, 115, 97, 108]"
    },
    {
      "name": "proposalVersion",
      "type": "u8",
      "value": "1"
    }
  ]
};
