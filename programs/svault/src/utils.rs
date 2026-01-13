use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TransferChecked};

// User-signed token transfer
pub fn transfer_checked_ctx<'info>(
    from: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from,
        mint,
        to,
        authority,
    };
    let cpi_ctx = CpiContext::new(token_program, cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, decimals)
}

// PDA-signed token transfer
pub fn transfer_checked_signed<'info>(
    from: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from,
        mint,
        to,
        authority,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program, cpi_accounts, signer_seeds);
    token_interface::transfer_checked(cpi_ctx, amount, decimals)
}
