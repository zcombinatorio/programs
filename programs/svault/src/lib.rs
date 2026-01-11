use anchor_lang::prelude::*;

pub mod state;

declare_id!("2DM31xJgZUPRP8bSwHgFv9S7iWhdiGVAndCjtkqeiRyJ");

#[program]
pub mod svault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
