/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vault.json`.
 */
export type Vault = {
  "address": "VLTDn5Rst9FL8Wg84SNCLHuouFD8KTDxw1AMRZgTFZC",
  "metadata": {
    "name": "vault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "activate",
      "discriminator": [
        194,
        203,
        35,
        100,
        151,
        55,
        170,
        82
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer for account rent"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "Owner of the vault - used for PDA derivation. Can be a PDA or signer."
          ],
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "vaultAccount"
              },
              {
                "kind": "account",
                "path": "vault.nonce",
                "account": "vaultAccount"
              }
            ]
          }
        }
      ],
      "args": []
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
          "name": "payer",
          "docs": [
            "Payer for account rent"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "Owner of the vault — needs to sign"
          ],
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "vaultAccount"
              },
              {
                "kind": "account",
                "path": "vault.nonce",
                "account": "vaultAccount"
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
          "name": "condBaseMint",
          "writable": true
        },
        {
          "name": "condQuoteMint",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "vaultAccount"
              },
              {
                "kind": "account",
                "path": "vault.nonce",
                "account": "vaultAccount"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "userAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
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
      "args": [
        {
          "name": "vaultType",
          "type": {
            "defined": {
              "name": "vaultType"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalize",
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer for account rent"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "Owner of the vault — needs to sign"
          ],
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "vaultAccount"
              },
              {
                "kind": "account",
                "path": "vault.nonce",
                "account": "vaultAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "winningIdx",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer for account rent"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "Owner of the vault — needs to sign"
          ],
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "nonce"
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
          "name": "baseTokenAcc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "baseMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "quoteTokenAcc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "condBaseMint0",
          "writable": true
        },
        {
          "name": "condBaseMint1",
          "writable": true
        },
        {
          "name": "condQuoteMint0",
          "writable": true
        },
        {
          "name": "condQuoteMint1",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
          "name": "nonce",
          "type": "u16"
        }
      ]
    },
    {
      "name": "redeemWinnings",
      "discriminator": [
        209,
        5,
        204,
        87,
        134,
        122,
        239,
        185
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "vaultAccount"
              },
              {
                "kind": "account",
                "path": "vault.nonce",
                "account": "vaultAccount"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "userAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
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
      "args": [
        {
          "name": "vaultType",
          "type": {
            "defined": {
              "name": "vaultType"
            }
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "vaultAccount"
              },
              {
                "kind": "account",
                "path": "vault.nonce",
                "account": "vaultAccount"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "userAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
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
      "args": [
        {
          "name": "vaultType",
          "type": {
            "defined": {
              "name": "vaultType"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "vaultAccount",
      "discriminator": [
        230,
        251,
        241,
        83,
        139,
        202,
        93,
        28
      ]
    }
  ],
  "events": [
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
      "name": "vaultActivated",
      "discriminator": [
        76,
        220,
        220,
        110,
        216,
        252,
        88,
        84
      ]
    },
    {
      "name": "vaultDeposit",
      "discriminator": [
        4,
        248,
        234,
        163,
        99,
        238,
        140,
        45
      ]
    },
    {
      "name": "vaultFinalized",
      "discriminator": [
        200,
        144,
        206,
        248,
        111,
        213,
        163,
        0
      ]
    },
    {
      "name": "vaultInitialized",
      "discriminator": [
        180,
        43,
        207,
        2,
        18,
        71,
        3,
        75
      ]
    },
    {
      "name": "vaultWithdrawal",
      "discriminator": [
        168,
        109,
        95,
        252,
        76,
        240,
        237,
        56
      ]
    },
    {
      "name": "winningsRedeemed",
      "discriminator": [
        165,
        63,
        125,
        179,
        230,
        236,
        63,
        99
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "vaultAlreadyExists",
      "msg": "Vault already exists"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6002,
      "name": "invalidState",
      "msg": "Invalid state"
    },
    {
      "code": 6003,
      "name": "notEnoughOptions",
      "msg": "Minimum 2 options required"
    },
    {
      "code": 6004,
      "name": "tooManyOptions",
      "msg": "Too many options"
    },
    {
      "code": 6005,
      "name": "optionLimitReached",
      "msg": "Option limit reached"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6007,
      "name": "indexOutOfBounds",
      "msg": "Index out of bounds"
    },
    {
      "code": 6008,
      "name": "invalidNumberOfAccounts",
      "msg": "Invalid number of accounts"
    },
    {
      "code": 6009,
      "name": "invalidConditionalMint",
      "msg": "Invalid conditional mint"
    },
    {
      "code": 6010,
      "name": "invalidUserAta",
      "msg": "Invalid user ATA"
    },
    {
      "code": 6011,
      "name": "invalidAccountOwner",
      "msg": "Invalid account owner"
    },
    {
      "code": 6012,
      "name": "noConditionalTokens",
      "msg": "No conditional tokens"
    },
    {
      "code": 6013,
      "name": "invalidMint",
      "msg": "Invalid mint for vault type"
    }
  ],
  "types": [
    {
      "name": "optionAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "optionIndex",
            "type": "u8"
          },
          {
            "name": "condBaseMint",
            "type": "pubkey"
          },
          {
            "name": "condQuoteMint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "vaultAccount",
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
            "name": "owner",
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
            "name": "nonce",
            "type": "u16"
          },
          {
            "name": "proposalId",
            "type": "u16"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "vaultState"
              }
            }
          },
          {
            "name": "numOptions",
            "type": "u8"
          },
          {
            "name": "condBaseMints",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "condQuoteMints",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          }
        ]
      }
    },
    {
      "name": "vaultActivated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "numOptions",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vaultDeposit",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "vaultType",
            "type": {
              "defined": {
                "name": "vaultType"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "winningIdx",
            "type": "u8"
          },
          {
            "name": "winningBaseMint",
            "type": "pubkey"
          },
          {
            "name": "winningQuoteMint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "vaultInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
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
            "name": "nonce",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vaultState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "setup"
          },
          {
            "name": "active"
          },
          {
            "name": "finalized",
            "fields": [
              "u8"
            ]
          }
        ]
      }
    },
    {
      "name": "vaultType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "base"
          },
          {
            "name": "quote"
          }
        ]
      }
    },
    {
      "name": "vaultWithdrawal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "vaultType",
            "type": {
              "defined": {
                "name": "vaultType"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "winningsRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "vaultType",
            "type": {
              "defined": {
                "name": "vaultType"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "conditionalMintSeed",
      "type": "bytes",
      "value": "[99, 109, 105, 110, 116]"
    },
    {
      "name": "maxOptions",
      "type": "u8",
      "value": "8"
    },
    {
      "name": "minOptions",
      "type": "u8",
      "value": "2"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    },
    {
      "name": "vaultVersion",
      "type": "u8",
      "value": "1"
    }
  ]
};
