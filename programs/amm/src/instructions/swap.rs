use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::*, errors::*, state::PoolAccount, utils::{transfer_tokens, transfer_signed}};

#[event]
pub struct CondSwap {
    pub pool: Pubkey,
    pub trader: Pubkey,
    pub swap_a_to_b: bool,
    pub input_amount: u64,
    pub output_amount: u64,
    pub fee_amount: u64
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub trader: Signer<'info>,

    pub mint_a: Account<'info, Mint>,
    pub mint_b: Account<'info, Mint>,

    #[account(
        seeds = [
            POOL_SEED,
            pool.admin.as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
        ],
        bump = pool.bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool: Box<Account<'info, PoolAccount>>,

    // Pool reserves
    #[account(
        mut,
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            mint_a.key().as_ref(),
        ],
        bump,
        token::mint = mint_a,
        token::authority = pool,
    )]
    pub reserve_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            mint_b.key().as_ref(),
        ],
        bump,
        token::mint = mint_b,
        token::authority = pool,
    )]
    pub reserve_b: Account<'info, TokenAccount>,

    /// Fee vault with hardcoded fee authority wallet
    #[account(
        mut,
        seeds = [
            FEE_VAULT_SEED,
            pool.key().as_ref(),
        ],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    // Trader accounts
    #[account(
        mut,
        token::mint = mint_a,
        token::authority = trader,
    )]
    pub trader_account_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint_b,
        token::authority = trader,
    )]
    pub trader_account_b: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn swap_handler(
    ctx: Context<Swap>,
    swap_a_to_b: bool,
    input_amount: u64,
    min_output_amount: u64,
) -> Result<()> {
    require!(input_amount > 0, AmmError::InvalidAmount);
    require!(min_output_amount > 0, AmmError::InvalidAmount);

    let pool = &ctx.accounts.pool;
    let reserve_a = ctx.accounts.reserve_a.amount;
    let reserve_b = ctx.accounts.reserve_b.amount;
    let fee_bps = pool.fee as u64;

    // Prevent swaps on empty pool
    require!(reserve_a > 0 && reserve_b > 0, AmmError::EmptyPool);

    // Store invariant before swap
    let invariant_before = (reserve_a as u128)
        .checked_mul(reserve_b as u128)
        .ok_or(AmmError::MathOverflow)?;

    // Calculate fee and output based on swap direction
    // Fee is always collected in token A
    // Returns: (output, fee_amount, input_to_reserve, output_from_reserve)
    // The last two are for invariant checking (tracks what enters/exits the AMM math)
    let (output, fee_amount, input_to_reserve, output_from_reserve) = if swap_a_to_b {
        // A -> B: fee on input (A), then swap
        let mut fee = input_amount
            .checked_mul(fee_bps)
            .ok_or(AmmError::MathOverflow)?
            .checked_div(10000)
            .ok_or(AmmError::MathOverflow)?;
        // Prevent dust swaps from avoiding fees via integer truncation
        if fee_bps > 0 && fee == 0 { fee = 1; }
        let taxed_input = input_amount
            .checked_sub(fee)
            .ok_or(AmmError::MathOverflow)?;

        // AMM formula: output = (input * reserve_out) / (reserve_in + input)
        let numerator = (taxed_input as u128)
            .checked_mul(reserve_b as u128)
            .ok_or(AmmError::MathOverflow)?;
        let denominator = (reserve_a as u128)
            .checked_add(taxed_input as u128)
            .ok_or(AmmError::MathOverflow)?;
        let out = numerator
            .checked_div(denominator)
            .ok_or(AmmError::MathOverflow)? as u64;

        (out, fee, taxed_input, out)
    } else {
        // B -> A: swap first, then fee on output (A)
        // AMM formula: output = (input * reserve_out) / (reserve_in + input)
        let numerator = (input_amount as u128)
            .checked_mul(reserve_a as u128)
            .ok_or(AmmError::MathOverflow)?;
        let denominator = (reserve_b as u128)
            .checked_add(input_amount as u128)
            .ok_or(AmmError::MathOverflow)?;
        let gross_output = numerator
            .checked_div(denominator)
            .ok_or(AmmError::MathOverflow)? as u64;

        let mut fee = gross_output
            .checked_mul(fee_bps)
            .ok_or(AmmError::MathOverflow)?
            .checked_div(10000)
            .ok_or(AmmError::MathOverflow)?;
        // Prevent dust swaps from avoiding fees via integer truncation
        if fee_bps > 0 && fee == 0 { fee = 1; }
        let net_output = gross_output
            .checked_sub(fee)
            .ok_or(AmmError::MathOverflow)?;

        (net_output, fee, input_amount, gross_output)
    };

    // Ensure output is non-zero
    require!(output > 0, AmmError::OutputTooSmall);

    // For B->A swaps, verify reserve_a has enough for output + fee
    if !swap_a_to_b {
        require!(
            reserve_a >= output + fee_amount,
            AmmError::InsufficientReserve
        );
    }

    // Slippage check
    require!(output >= min_output_amount, AmmError::SlippageExceeded);

    // Verify invariant will hold after swap (checked before transfers)
    // Calculate expected reserves based on AMM math (independent of fee extraction)
    let (expected_reserve_a, expected_reserve_b) = if swap_a_to_b {
        // A→B: input_to_reserve (taxed_input) enters reserve_a, output leaves reserve_b
        (
            (reserve_a as u128)
                .checked_add(input_to_reserve as u128)
                .ok_or(AmmError::MathOverflow)?,
            (reserve_b as u128)
                .checked_sub(output_from_reserve as u128)
                .ok_or(AmmError::MathOverflow)?,
        )
    } else {
        // B→A: input enters reserve_b, output_from_reserve (gross_output) leaves reserve_a
        (
            (reserve_a as u128)
                .checked_sub(output_from_reserve as u128)
                .ok_or(AmmError::MathOverflow)?,
            (reserve_b as u128)
                .checked_add(input_to_reserve as u128)
                .ok_or(AmmError::MathOverflow)?,
        )
    };

    let invariant_after = expected_reserve_a
        .checked_mul(expected_reserve_b)
        .ok_or(AmmError::MathOverflow)?;
    require!(
        invariant_after >= invariant_before,
        AmmError::InvariantViolated
    );

    // Build pool signer seeds
    let seeds = &[
        POOL_SEED,
        pool.admin.as_ref(),
        pool.mint_a.as_ref(),
        pool.mint_b.as_ref(),
        &[pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    if swap_a_to_b {
        // A -> B
        // 1. Transfer input A (minus fee) to reserve
        transfer_tokens(
            ctx.accounts.trader_account_a.to_account_info(),
            ctx.accounts.reserve_a.to_account_info(),
            ctx.accounts.trader.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            input_amount - fee_amount,
        )?;
        // 2. Transfer fee to fee vault
        transfer_tokens(
            ctx.accounts.trader_account_a.to_account_info(),
            ctx.accounts.fee_vault.to_account_info(),
            ctx.accounts.trader.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            fee_amount,
        )?;
        // 3. Transfer output B to trader
        transfer_signed(
            ctx.accounts.reserve_b.to_account_info(),
            ctx.accounts.trader_account_b.to_account_info(),
            ctx.accounts.pool.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            output,
            signer_seeds,
        )?;
    } else {
        // B -> A
        // 1. Transfer input B to reserve
        transfer_tokens(
            ctx.accounts.trader_account_b.to_account_info(),
            ctx.accounts.reserve_b.to_account_info(),
            ctx.accounts.trader.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            input_amount,
        )?;
        // 2. Transfer output A to trader
        transfer_signed(
            ctx.accounts.reserve_a.to_account_info(),
            ctx.accounts.trader_account_a.to_account_info(),
            ctx.accounts.pool.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            output,
            signer_seeds,
        )?;
        // 3. Transfer fee from reserve A to fee vault
        transfer_signed(
            ctx.accounts.reserve_a.to_account_info(),
            ctx.accounts.fee_vault.to_account_info(),
            ctx.accounts.pool.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            fee_amount,
            signer_seeds,
        )?;
    }

    emit!(CondSwap {
        pool: ctx.accounts.pool.key(),
        trader: ctx.accounts.trader.key(),
        swap_a_to_b,
        input_amount,
        output_amount: output,
        fee_amount,
    });

    Ok(())
}