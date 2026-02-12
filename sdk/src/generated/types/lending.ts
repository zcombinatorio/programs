/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/lending.json`.
 */
export type Lending = {
  "address": "LEND7YMJZSudGFhVmx1xJCAahk8Vv62RQ9p4QkyeBH8",
  "metadata": {
    "name": "lending",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Lending program for Z Combinator"
  },
  "instructions": [
    {
      "name": "addLiquidity",
      "docs": [
        "Add base token liquidity to the vault (admin only)",
        "",
        "# Arguments",
        "* `amount` - Amount of base tokens to deposit"
      ],
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
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "baseMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "adminBaseAta",
          "docs": [
            "Admin's base token account to transfer from"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeVault",
      "docs": [
        "Initialize a new lending vault",
        "",
        "# Arguments",
        "* `nonce` - Unique identifier for this vault (allows multiple vaults per mint pair)",
        "* `ltv_bps` - Loan-to-value ratio in basis points (e.g., 5000 = 50%)",
        "* `liquidation_threshold_bps` - Threshold for health-based liquidation (e.g., 8000 = 80%)",
        "* `loan_duration_seconds` - Time before position becomes liquidatable",
        "* `pool_type` - Type of AMM pool (DammV2 or Dlmm)"
      ],
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "baseMint",
          "docs": [
            "Base mint (what users borrow)"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote mint (what users deposit as collateral)"
          ]
        },
        {
          "name": "pool",
          "docs": [
            "AMM pool for price oracle and liquidation swaps"
          ]
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
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "baseVault",
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
                  116,
                  95,
                  98,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
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
                  116,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u16"
        },
        {
          "name": "ltvBps",
          "type": "u16"
        },
        {
          "name": "liquidationThresholdBps",
          "type": "u16"
        },
        {
          "name": "loanDurationSeconds",
          "type": "u64"
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
      "name": "liquidateCpAmm",
      "docs": [
        "Liquidate a position using CP-AMM (DAMM v2) swap",
        "Permissionless - anyone can call this",
        "",
        "# Arguments",
        "* `min_amount_out` - Minimum base tokens expected from swap (slippage protection)"
      ],
      "discriminator": [
        142,
        73,
        156,
        75,
        22,
        254,
        98,
        186
      ],
      "accounts": [
        {
          "name": "liquidator",
          "docs": [
            "Anyone can liquidate (permissionless)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "The user who owns the position (receives rent refund)"
          ],
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "position.user",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "baseMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "baseVault",
          "docs": [
            "Vault's base token account (receives swapped base)"
          ],
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteVault",
          "docs": [
            "Vault's quote token account (source of collateral for swap)"
          ],
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "poolAuthority",
          "address": "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC"
        },
        {
          "name": "pool",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenAVault",
          "writable": true
        },
        {
          "name": "tokenBVault",
          "writable": true
        },
        {
          "name": "tokenAMint"
        },
        {
          "name": "tokenBMint"
        },
        {
          "name": "tokenAProgram"
        },
        {
          "name": "tokenBProgram"
        },
        {
          "name": "referralTokenAccount",
          "writable": true,
          "optional": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "cpAmmProgram",
          "address": "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "minAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "liquidateDlmm",
      "docs": [
        "Liquidate a position using DLMM swap",
        "Permissionless - anyone can call this",
        "Bin arrays must be passed as remaining accounts",
        "",
        "# Arguments",
        "* `min_amount_out` - Minimum base tokens expected from swap (slippage protection)"
      ],
      "discriminator": [
        164,
        177,
        172,
        201,
        53,
        22,
        184,
        98
      ],
      "accounts": [
        {
          "name": "liquidator",
          "docs": [
            "Anyone can liquidate (permissionless)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "The user who owns the position (receives rent refund)"
          ],
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "position.user",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "baseMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "baseVault",
          "docs": [
            "Vault's base token account (receives swapped base)"
          ],
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteVault",
          "docs": [
            "Vault's quote token account (source of collateral for swap)"
          ],
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "lbPair",
          "writable": true
        },
        {
          "name": "binArrayBitmapExtension",
          "optional": true
        },
        {
          "name": "reserveX",
          "writable": true
        },
        {
          "name": "reserveY",
          "writable": true
        },
        {
          "name": "tokenXMint"
        },
        {
          "name": "tokenYMint"
        },
        {
          "name": "oracle",
          "writable": true
        },
        {
          "name": "hostFeeIn",
          "writable": true,
          "optional": true
        },
        {
          "name": "dlmmProgram",
          "address": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "tokenXProgram"
        },
        {
          "name": "tokenYProgram"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "minAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openPosition",
      "docs": [
        "Open a new borrowing position",
        "User deposits quote tokens as collateral and borrows base tokens",
        "",
        "# Arguments",
        "* `collateral_amount` - Amount of quote tokens to deposit as collateral",
        "* `borrow_amount` - Amount of base tokens to borrow"
      ],
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "baseMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "userQuoteAta",
          "docs": [
            "User's quote token account (collateral source)"
          ],
          "writable": true
        },
        {
          "name": "userBaseAta",
          "docs": [
            "User's base token account (borrow destination)"
          ],
          "writable": true
        },
        {
          "name": "pool",
          "docs": [
            "Pool for price oracle (CP-AMM or DLMM)"
          ],
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "collateralAmount",
          "type": "u64"
        },
        {
          "name": "borrowAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "removeLiquidity",
      "docs": [
        "Remove base token liquidity from the vault (admin only)",
        "Can only remove liquidity that isn't currently borrowed",
        "",
        "# Arguments",
        "* `amount` - Amount of base tokens to withdraw"
      ],
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
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "baseMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "adminBaseAta",
          "docs": [
            "Admin's base token account to receive tokens"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "repay",
      "docs": [
        "Repay a borrowing position",
        "User returns borrowed base tokens and receives collateral back",
        "Position is closed and account rent is returned"
      ],
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "baseMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "userBaseAta",
          "docs": [
            "User's base token account (repayment source)"
          ],
          "writable": true
        },
        {
          "name": "userQuoteAta",
          "docs": [
            "User's quote token account (collateral destination)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "lendingVault",
      "discriminator": [
        0,
        74,
        47,
        254,
        64,
        13,
        66,
        21
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
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
      "name": "positionClosed",
      "discriminator": [
        157,
        163,
        227,
        228,
        13,
        97,
        138,
        121
      ]
    },
    {
      "name": "positionLiquidated",
      "discriminator": [
        40,
        107,
        90,
        214,
        96,
        30,
        61,
        128
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
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
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow"
    },
    {
      "code": 6001,
      "name": "invalidFee"
    },
    {
      "code": 6002,
      "name": "exceededSlippage"
    },
    {
      "code": 6003,
      "name": "poolDisabled"
    },
    {
      "code": 6004,
      "name": "exceedMaxFeeBps"
    },
    {
      "code": 6005,
      "name": "invalidAdmin"
    },
    {
      "code": 6006,
      "name": "amountIsZero"
    },
    {
      "code": 6007,
      "name": "typeCastFailed"
    },
    {
      "code": 6008,
      "name": "unableToModifyActivationPoint"
    },
    {
      "code": 6009,
      "name": "invalidAuthorityToCreateThePool"
    },
    {
      "code": 6010,
      "name": "invalidActivationType"
    },
    {
      "code": 6011,
      "name": "invalidActivationPoint"
    },
    {
      "code": 6012,
      "name": "invalidQuoteMint"
    },
    {
      "code": 6013,
      "name": "invalidFeeCurve"
    },
    {
      "code": 6014,
      "name": "invalidPriceRange"
    },
    {
      "code": 6015,
      "name": "priceRangeViolation"
    },
    {
      "code": 6016,
      "name": "invalidParameters"
    },
    {
      "code": 6017,
      "name": "invalidCollectFeeMode"
    },
    {
      "code": 6018,
      "name": "invalidInput"
    },
    {
      "code": 6019,
      "name": "cannotCreateTokenBadgeOnSupportedMint"
    },
    {
      "code": 6020,
      "name": "invalidTokenBadge"
    },
    {
      "code": 6021,
      "name": "invalidMinimumLiquidity"
    },
    {
      "code": 6022,
      "name": "invalidVestingInfo"
    },
    {
      "code": 6023,
      "name": "insufficientLiquidity"
    },
    {
      "code": 6024,
      "name": "invalidVestingAccount"
    },
    {
      "code": 6025,
      "name": "invalidPoolStatus"
    },
    {
      "code": 6026,
      "name": "unsupportNativeMintToken2022"
    },
    {
      "code": 6027,
      "name": "invalidRewardIndex"
    },
    {
      "code": 6028,
      "name": "invalidRewardDuration"
    },
    {
      "code": 6029,
      "name": "rewardInitialized"
    },
    {
      "code": 6030,
      "name": "rewardUninitialized"
    },
    {
      "code": 6031,
      "name": "invalidRewardVault"
    },
    {
      "code": 6032,
      "name": "mustWithdrawnIneligibleReward"
    },
    {
      "code": 6033,
      "name": "identicalRewardDuration"
    },
    {
      "code": 6034,
      "name": "rewardCampaignInProgress"
    },
    {
      "code": 6035,
      "name": "identicalFunder"
    },
    {
      "code": 6036,
      "name": "invalidFunder"
    },
    {
      "code": 6037,
      "name": "rewardNotEnded"
    },
    {
      "code": 6038,
      "name": "feeInverseIsIncorrect"
    },
    {
      "code": 6039,
      "name": "positionIsNotEmpty"
    },
    {
      "code": 6040,
      "name": "invalidPoolCreatorAuthority"
    },
    {
      "code": 6041,
      "name": "invalidConfigType"
    },
    {
      "code": 6042,
      "name": "invalidPoolCreator"
    },
    {
      "code": 6043,
      "name": "rewardVaultFrozenSkipRequired"
    },
    {
      "code": 6044,
      "name": "invalidSplitPositionParameters"
    },
    {
      "code": 6045,
      "name": "unsupportPositionHasVestingLock"
    },
    {
      "code": 6046,
      "name": "samePosition"
    },
    {
      "code": 6047,
      "name": "invalidBaseFeeMode"
    },
    {
      "code": 6048,
      "name": "invalidFeeRateLimiter"
    },
    {
      "code": 6049,
      "name": "failToValidateSingleSwapInstruction"
    },
    {
      "code": 6050,
      "name": "invalidFeeTimeScheduler"
    },
    {
      "code": 6051,
      "name": "undeterminedError"
    },
    {
      "code": 6052,
      "name": "invalidPoolVersion"
    },
    {
      "code": 6053,
      "name": "invalidAuthority"
    },
    {
      "code": 6054,
      "name": "invalidPermission"
    },
    {
      "code": 6055,
      "name": "invalidFeeMarketCapScheduler"
    },
    {
      "code": 6056,
      "name": "cannotUpdateBaseFee"
    },
    {
      "code": 6057,
      "name": "invalidDynamicFeeParameters"
    },
    {
      "code": 6058,
      "name": "invalidUpdatePoolFeesParameters"
    },
    {
      "code": 6059,
      "name": "missingOperatorAccount"
    },
    {
      "code": 6060,
      "name": "incorrectAta"
    },
    {
      "code": 6061,
      "name": "invalidZapOutParameters"
    },
    {
      "code": 6062,
      "name": "invalidWithdrawProtocolFeeZapAccounts"
    },
    {
      "code": 6063,
      "name": "mintRestrictedFromZap"
    },
    {
      "code": 6064,
      "name": "cpiDisabled"
    },
    {
      "code": 6065,
      "name": "missingZapOutInstruction"
    },
    {
      "code": 6066,
      "name": "invalidZapAccounts"
    }
  ],
  "types": [
    {
      "name": "lendingVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "Bump for PDA derivation"
            ],
            "type": "u8"
          },
          {
            "name": "nonce",
            "docs": [
              "Nonce for multiple vaults"
            ],
            "type": "u16"
          },
          {
            "name": "admin",
            "docs": [
              "Admin who can manage the vault"
            ],
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "docs": [
              "Base mint (what users borrow)"
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "docs": [
              "Quote mint (what users deposit as collateral)"
            ],
            "type": "pubkey"
          },
          {
            "name": "baseVault",
            "docs": [
              "Vault-owned ATA for base tokens (liquidity pool)"
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteVault",
            "docs": [
              "Vault-owned ATA for quote tokens (collateral storage)"
            ],
            "type": "pubkey"
          },
          {
            "name": "pool",
            "docs": [
              "AMM pool address (DAMM v2 or DLMM) - must be base/quote pair"
            ],
            "type": "pubkey"
          },
          {
            "name": "poolType",
            "docs": [
              "Pool type for CPI routing"
            ],
            "type": {
              "defined": {
                "name": "poolType"
              }
            }
          },
          {
            "name": "isPoolBaseTokenA",
            "docs": [
              "True if pool's token A/X is the vault's base mint (false = need to invert price)"
            ],
            "type": "bool"
          },
          {
            "name": "ltvBps",
            "docs": [
              "Loan-to-Value ratio in basis points (max borrow ratio at entry)",
              "e.g., 5000 = 50% = can borrow up to 50% of collateral value"
            ],
            "type": "u16"
          },
          {
            "name": "liquidationThresholdBps",
            "docs": [
              "Liquidation threshold in basis points",
              "e.g., 8000 = 80% = liquidatable when loan/collateral >= 80%"
            ],
            "type": "u16"
          },
          {
            "name": "loanDurationSeconds",
            "docs": [
              "Loan duration in seconds (time-based liquidation)"
            ],
            "type": "u64"
          },
          {
            "name": "totalBaseLiquidity",
            "docs": [
              "Total base tokens available for borrowing"
            ],
            "type": "u64"
          },
          {
            "name": "totalBaseBorrowed",
            "docs": [
              "Total base tokens currently borrowed"
            ],
            "type": "u64"
          },
          {
            "name": "totalQuoteCollateral",
            "docs": [
              "Total quote tokens held as collateral"
            ],
            "type": "u64"
          },
          {
            "name": "openPositions",
            "docs": [
              "Number of open positions"
            ],
            "type": "u32"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "liquidationReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "expired"
          },
          {
            "name": "undercollateralized"
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
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalLiquidity",
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
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalLiquidity",
            "type": "u64"
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
            "name": "cpAmm"
          },
          {
            "name": "dlmm"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "Bump for PDA derivation"
            ],
            "type": "u8"
          },
          {
            "name": "vault",
            "docs": [
              "The vault this position belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "user",
            "docs": [
              "The user who owns this position"
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "Amount of quote tokens deposited as collateral"
            ],
            "type": "u64"
          },
          {
            "name": "borrowedAmount",
            "docs": [
              "Amount of base tokens borrowed"
            ],
            "type": "u64"
          },
          {
            "name": "openedAt",
            "docs": [
              "When the position was opened"
            ],
            "type": "i64"
          },
          {
            "name": "isActive",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "positionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "collateralReturned",
            "type": "u64"
          },
          {
            "name": "baseRepaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "positionLiquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "borrowedAmount",
            "type": "u64"
          },
          {
            "name": "baseRecovered",
            "type": "u64"
          },
          {
            "name": "basePrice",
            "type": "u64"
          },
          {
            "name": "liquidationReason",
            "type": {
              "defined": {
                "name": "liquidationReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "borrowedAmount",
            "type": "u64"
          },
          {
            "name": "basePrice",
            "type": "u64"
          },
          {
            "name": "openedAt",
            "type": "i64"
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
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
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
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "ltvBps",
            "type": "u16"
          },
          {
            "name": "liquidationThresholdBps",
            "type": "u16"
          },
          {
            "name": "loanDurationSeconds",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "vaultBaseAtaSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116, 95, 98, 97, 115, 101]"
    },
    {
      "name": "vaultQuoteAtaSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116, 95, 113, 117, 111, 116, 101]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
