use anchor_lang::prelude::*;

declare_id!("4oiXvA71BdpWsdcmjMysn57W3FzB9uqbujtq7Vpzt7ag");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
