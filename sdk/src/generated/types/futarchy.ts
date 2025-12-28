/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/futarchy.json`.
 */
export type Futarchy = {
  "address": "FUTKPrt66uGGCTpk6f9tmRX2325cWgXzGCwvWhyyzjea",
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
          "name": "admin",
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
                "path": "moderator.name",
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
          "name": "creator",
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
          "address": "VLTEetGyPKtffi1u3Jr8btWATv33NeDyUuRsPENFPTU"
        },
        {
          "name": "ammProgram",
          "address": "AMMSgtnttAKx5Ad2Y1socKJ3CcQYCB2ctg8U2SAHcVEx"
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
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "vaultProgram",
          "address": "VLTEetGyPKtffi1u3Jr8btWATv33NeDyUuRsPENFPTU"
        },
        {
          "name": "ammProgram",
          "address": "AMMSgtnttAKx5Ad2Y1socKJ3CcQYCB2ctg8U2SAHcVEx"
        }
      ],
      "args": []
    },
    {
      "name": "initializeChildDao",
      "discriminator": [
        241,
        144,
        136,
        34,
        152,
        26,
        21,
        190
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "parentAdmin",
          "signer": true
        },
        {
          "name": "dao",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "parentDao",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "parent_dao.name",
                "account": "daoAccount"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "programConfig"
        },
        {
          "name": "programConfigTreasury",
          "writable": true
        },
        {
          "name": "treasuryMultisig",
          "writable": true
        },
        {
          "name": "mintMultisig",
          "writable": true
        },
        {
          "name": "mintCreateKey",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  107,
                  101,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "squadsProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "treasuryCosigner",
          "type": "pubkey"
        }
      ]
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
          "name": "admin",
          "writable": true,
          "signer": true
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
                "kind": "arg",
                "path": "name"
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
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeParentDao",
      "discriminator": [
        188,
        86,
        227,
        249,
        221,
        148,
        66,
        241
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "parentAdmin",
          "signer": true
        },
        {
          "name": "dao",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
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
                "kind": "arg",
                "path": "name"
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
          "name": "programConfig"
        },
        {
          "name": "programConfigTreasury",
          "writable": true
        },
        {
          "name": "treasuryMultisig",
          "writable": true
        },
        {
          "name": "mintMultisig",
          "writable": true
        },
        {
          "name": "mintCreateKey",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  107,
                  101,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "squadsProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "treasuryCosigner",
          "type": "pubkey"
        },
        {
          "name": "pool",
          "type": "pubkey"
        },
        {
          "name": "poolType",
          "type": {
            "defined": {
              "name": "poolType"
            }
          }
        }
      ]
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
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "moderator",
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
                "path": "moderator.name",
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
          "address": "VLTEetGyPKtffi1u3Jr8btWATv33NeDyUuRsPENFPTU"
        },
        {
          "name": "ammProgram",
          "address": "AMMSgtnttAKx5Ad2Y1socKJ3CcQYCB2ctg8U2SAHcVEx"
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
          "name": "proposalParams",
          "type": {
            "defined": {
              "name": "proposalParams"
            }
          }
        },
        {
          "name": "metadata",
          "type": {
            "option": "string"
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
          "name": "creator",
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
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "vaultProgram",
          "address": "VLTEetGyPKtffi1u3Jr8btWATv33NeDyUuRsPENFPTU"
        },
        {
          "name": "ammProgram",
          "address": "AMMSgtnttAKx5Ad2Y1socKJ3CcQYCB2ctg8U2SAHcVEx"
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
          "name": "creator",
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
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vaultProgram",
          "address": "VLTEetGyPKtffi1u3Jr8btWATv33NeDyUuRsPENFPTU"
        },
        {
          "name": "ammProgram",
          "address": "AMMSgtnttAKx5Ad2Y1socKJ3CcQYCB2ctg8U2SAHcVEx"
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
    },
    {
      "name": "upgradeDao",
      "discriminator": [
        81,
        178,
        57,
        196,
        156,
        38,
        145,
        93
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "parentAdmin",
          "signer": true
        },
        {
          "name": "dao",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "daoAccount"
              }
            ]
          }
        },
        {
          "name": "parentDao",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "parent_dao.name",
                "account": "daoAccount"
              }
            ]
          }
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
                "path": "dao.name",
                "account": "daoAccount"
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "pool",
          "type": "pubkey"
        },
        {
          "name": "poolType",
          "type": {
            "defined": {
              "name": "poolType"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "daoAccount",
      "discriminator": [
        204,
        10,
        113,
        79,
        232,
        184,
        83,
        201
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
      "name": "daoInitialized",
      "discriminator": [
        17,
        212,
        203,
        144,
        165,
        153,
        118,
        92
      ]
    },
    {
      "name": "daoUpgraded",
      "discriminator": [
        8,
        62,
        51,
        188,
        195,
        69,
        78,
        7
      ]
    },
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
    },
    {
      "code": 6014,
      "name": "nameTooLong",
      "msg": "Name exceeds 32 bytes"
    },
    {
      "code": 6015,
      "name": "metadataTooLong",
      "msg": "Metadata CID exceeds 64 bytes"
    },
    {
      "code": 6016,
      "name": "invalidDao",
      "msg": "Invalid DAO account"
    },
    {
      "code": 6017,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6018,
      "name": "invalidProposalParams",
      "msg": "Invalid proposal parameters"
    }
  ],
  "types": [
    {
      "name": "daoAccount",
      "docs": [
        "Seeds: [DAO_SEED, &dao_id.to_le_bytes()]"
      ],
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
            "name": "name",
            "type": "string"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "cosigner",
            "type": "pubkey"
          },
          {
            "name": "treasuryMultisig",
            "type": "pubkey"
          },
          {
            "name": "mintAuthMultisig",
            "type": "pubkey"
          },
          {
            "name": "daoType",
            "type": {
              "defined": {
                "name": "daoType"
              }
            }
          }
        ]
      }
    },
    {
      "name": "daoInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasuryMultisig",
            "type": "pubkey"
          },
          {
            "name": "mintMultisig",
            "type": "pubkey"
          },
          {
            "name": "daoType",
            "type": {
              "defined": {
                "name": "daoType"
              }
            }
          }
        ]
      }
    },
    {
      "name": "daoType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "parent",
            "fields": [
              {
                "name": "moderator",
                "type": "pubkey"
              },
              {
                "name": "pool",
                "type": "pubkey"
              },
              {
                "name": "poolType",
                "type": {
                  "defined": {
                    "name": "poolType"
                  }
                }
              }
            ]
          },
          {
            "name": "child",
            "fields": [
              {
                "name": "parentDao",
                "type": "pubkey"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "daoUpgraded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dao",
            "type": "pubkey"
          },
          {
            "name": "parentDao",
            "type": "pubkey"
          },
          {
            "name": "daoType",
            "type": {
              "defined": {
                "name": "daoType"
              }
            }
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
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
      "docs": [
        "Seeds: [MODERATOR_SEED, &id.to_le_bytes()]"
      ],
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
            "name": "name",
            "type": "string"
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
            "name": "moderator",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
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
      "name": "poolType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "damm"
          },
          {
            "name": "dlmm"
          }
        ]
      }
    },
    {
      "name": "proposalAccount",
      "docs": [
        "Seeds: [PROPOSAL_SEED, moderator.key(), &id.to_le_bytes()]"
      ],
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
            "name": "creator",
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
            "name": "config",
            "type": {
              "defined": {
                "name": "proposalParams"
              }
            }
          },
          {
            "name": "metadata",
            "type": {
              "option": "string"
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
      "name": "proposalParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "length",
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
            "name": "marketBias",
            "type": "u16"
          },
          {
            "name": "fee",
            "type": "u16"
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
    }
  ],
  "constants": [
    {
      "name": "daoSeed",
      "type": "bytes",
      "value": "[100, 97, 111]"
    },
    {
      "name": "maxOptions",
      "type": "u8",
      "value": "6"
    },
    {
      "name": "mintCreateKeySeed",
      "type": "bytes",
      "value": "[109, 105, 110, 116, 95, 107, 101, 121]"
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
      "name": "proposalSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 112, 111, 115, 97, 108]"
    }
  ]
};
