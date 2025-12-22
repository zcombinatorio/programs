use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{Instruction, AccountMeta}, program::invoke};
use crate::constants::*;

#[derive(Clone)]
pub struct SquadsMultisig { }

impl anchor_lang::Id for SquadsMultisig {
    fn id() -> Pubkey {
        pubkey!("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf")
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MultisigCreateArgsV2 {
    pub config_authority: Option<Pubkey>,
    pub threshold: u16,
    pub members: Vec<Member>,
    pub time_lock: u32,
    pub rent_collector: Option<Pubkey>,
    pub memo: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Member {
    pub key: Pubkey,
    pub permissions: Permissions,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Permissions {
    pub mask: u8,
}

impl SquadsMultisig {
    pub fn create_squads_multisig<'info>(
        program_config: AccountInfo<'info>,
        treasury: AccountInfo<'info>,
        multisig: AccountInfo<'info>,
        create_key: AccountInfo<'info>,
        creator: AccountInfo<'info>,
        system_program: AccountInfo<'info>,
        squads_program: AccountInfo<'info>,
        args: MultisigCreateArgsV2,
    ) -> Result<()> {
        // Discriminator for "multisig_create_v2" 
        // sha256("global:multisig_create_v2")[0..8]
        let discriminator: [u8; 8] = [50, 221, 199, 93, 40, 245, 139, 233];
    
        let mut data = discriminator.to_vec();
        args.serialize(&mut data)?;
    
        let ix = Instruction {
            program_id: SquadsMultisig::id(),
            accounts: vec![
                AccountMeta::new_readonly(program_config.key(), false),
                AccountMeta::new(treasury.key(), false),
                AccountMeta::new(multisig.key(), false),
                AccountMeta::new_readonly(create_key.key(), true),
                AccountMeta::new(creator.key(), true),
                AccountMeta::new_readonly(system_program.key(), false),
            ],
            data,
        };
    
        invoke(
            &ix,
            &[
                program_config,
                treasury,
                multisig,
                create_key,
                creator,
                system_program,
                squads_program,
            ],
        )?;
    
        Ok(())
    }

    pub fn treasury_multisig_create_args(
        cosigner: Pubkey,
        rent_collector: Option<Pubkey>
    ) -> MultisigCreateArgsV2 {
        MultisigCreateArgsV2 {
            config_authority: Some(TREASURY_MULTISIG_CONFIG_AUTH),
            threshold: 2, // 2 of 3 required
            members: vec![
                Member {
                    key: TREASURY_MULTISIG_KEY_A,
                    permissions: Permissions { mask: 7 }, // All permissions
                },
                Member {
                    key: TREASURY_MULTISIG_KEY_B,
                    permissions: Permissions { mask: 7 }, // All permissions
                },
                Member {
                    key: cosigner,
                    permissions: Permissions { mask: 7 }, // All permissions
                },
            ],
            time_lock: 0,
            rent_collector: rent_collector,
            memo: None,
        }
    }

    pub fn mint_multisig_create_args(
        rent_collector: Option<Pubkey>
    ) -> MultisigCreateArgsV2 {
        MultisigCreateArgsV2 {
            config_authority: Some(MINT_MULTISIG_CONFIG_AUTH),
            threshold: 2, // 2 of 2 required
            members: vec![
                Member {
                    key: MINT_MULTISIG_KEY_A,
                    permissions: Permissions { mask: 7 }, // All permissions
                },
                Member {
                    key: MINT_MULTISIG_KEY_B,
                    permissions: Permissions { mask: 7 }, // All permissions
                },
            ],
            time_lock: 0,
            rent_collector: rent_collector,
            memo: None,
        }
    }
}