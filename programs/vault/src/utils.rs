use anchor_lang::prelude::*;
use anchor_spl::associated_token;
use anchor_spl::token::{self, MintTo, Transfer, Burn};

// User-signed token transfer
pub fn transfer_tokens<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from,
        to,
        authority,
    };
    let cpi_program = token_program;
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)
}

// PDA-signed token transfer
pub fn transfer_signed<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = Transfer {
        from,
        to,
        authority,
    };
    let cpi_program = token_program;
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)
}

// PDA-signed minting
pub fn mint_to_signed<'info>(
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = MintTo {
        mint,
        to,
        authority,
    };
    let cpi_program = token_program;
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::mint_to(cpi_ctx, amount)
}

// User-signed token burn
pub fn burn_tokens<'info>(
    mint: AccountInfo<'info>,
    from: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Burn {
        mint,
        from,
        authority,
    };
    let cpi_program = token_program;
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, amount)
}

// Create ATA
pub fn create_associated_token_account<'info>(
    payer: AccountInfo<'info>,
    associated_token: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
) -> Result<()> {
    let cpi_accounts = associated_token::Create {
        payer,
        associated_token,
        authority,
        mint,
        system_program,
        token_program,
    };
    let cpi_program = associated_token_program;
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    associated_token::create(cpi_ctx)
}
