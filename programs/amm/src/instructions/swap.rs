use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::{PoolState, constants::*, errors::*, state::PoolAccount, utils::{transfer_signed, transfer_tokens}};

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

    #[account(
        mut,
        seeds = [
            POOL_SEED,
            pool.admin.as_ref(),
            pool.mint_a.as_ref(),
            pool.mint_b.as_ref(),
        ],
        bump = pool.bump,
        constraint = pool.state == PoolState::Trading @ AmmError::InvalidState
    )]
    pub pool: Box<Account<'info, PoolAccount>>,

    // Pool reserves
    #[account(
        mut,
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            pool.mint_a.as_ref(),
        ],
        bump,
        token::mint = pool.mint_a,
        token::authority = pool,
    )]
    pub reserve_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            RESERVE_SEED,
            pool.key().as_ref(),
            pool.mint_b.as_ref(),
        ],
        bump,
        token::mint = pool.mint_b,
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
        token::mint = pool.mint_a,
        token::authority = trader,
    )]
    pub trader_account_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = pool.mint_b,
        token::authority = trader,
    )]
    pub trader_account_b: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Swap<'info> {
    /// Constant product invariant: k = reserve_a * reserve_b
    pub fn invariant(reserve_a: u128, reserve_b: u128) -> Result<u128> {
        reserve_a
            .checked_mul(reserve_b)
            .ok_or(AmmError::MathOverflow.into())
    }

    /// AMM output formula: output = (input * reserve_out) / (reserve_in + input)
    pub fn compute_output(input: u64, reserve_in: u64, reserve_out: u64) -> Result<u64> {
        let numerator = (input as u128)
            .checked_mul(reserve_out as u128)
            .ok_or(AmmError::MathOverflow)?;
        let denominator = (reserve_in as u128)
            .checked_add(input as u128)
            .ok_or(AmmError::MathOverflow)?;
        let output = numerator
            .checked_div(denominator)
            .ok_or(AmmError::MathOverflow)? as u64;
        Ok(output)
    }
}

pub fn swap_handler(
    ctx: Context<Swap>,
    swap_a_to_b: bool,
    input_amount: u64,
    min_output_amount: u64,
) -> Result<()> {
    require!(input_amount > 0, AmmError::InvalidAmount);
    require!(min_output_amount > 0, AmmError::InvalidAmount);

    let reserve_a = ctx.accounts.reserve_a.amount;
    let reserve_b = ctx.accounts.reserve_b.amount;
    let fee_bps = ctx.accounts.pool.fee as u64;

    // Crank TWAP oracle
    ctx.accounts.pool.oracle.crank_twap(reserve_a, reserve_b)?;

    // Prevent swaps on empty pool
    require!(reserve_a > 0 && reserve_b > 0, AmmError::EmptyPool);

    // Store invariant before swap
    let invariant_before = Swap::invariant(reserve_a as u128, reserve_b as u128)?;

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

        let out = Swap::compute_output(taxed_input, reserve_a, reserve_b)?;
        require!(reserve_b >= out, AmmError::InsufficientReserve);

        (out, fee, taxed_input, out)
    } else {
        // B -> A: swap first, then fee on output (A)
        let gross_output = Swap::compute_output(input_amount, reserve_b, reserve_a)?;
        require!(reserve_a >= gross_output, AmmError::InsufficientReserve);

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

    // Pre-transfer invariant check (validates our math)
    let invariant_after = Swap::invariant(expected_reserve_a, expected_reserve_b)?;
    require!(invariant_after >= invariant_before, AmmError::InvariantViolated);

    // Build pool signer seeds
    let pool = &ctx.accounts.pool;
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
            input_to_reserve,
        )?;
        // 2. Transfer fee to fee vault (skip if zero)
        if fee_amount > 0 {
            transfer_tokens(
                ctx.accounts.trader_account_a.to_account_info(),
                ctx.accounts.fee_vault.to_account_info(),
                ctx.accounts.trader.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                fee_amount,
            )?;
        }
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
        // 3. Transfer fee from reserve A to fee vault (skip if zero)
        if fee_amount > 0 {
            transfer_signed(
                ctx.accounts.reserve_a.to_account_info(),
                ctx.accounts.fee_vault.to_account_info(),
                ctx.accounts.pool.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                fee_amount,
                signer_seeds,
            )?;
        }
    }

    // Post-transfer invariant check (expensive sanity check)
    ctx.accounts.reserve_a.reload()?;
    ctx.accounts.reserve_b.reload()?;
    let invariant_final = Swap::invariant(
        ctx.accounts.reserve_a.amount as u128,
        ctx.accounts.reserve_b.amount as u128,
    )?;
    require!(invariant_final >= invariant_before, AmmError::InvariantViolated);

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