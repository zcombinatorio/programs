// Meteora CPI interfaces
// Generated from IDLs using declare_program! macro

pub mod cp_amm;
pub mod dlmm;

// Re-export just the program IDs to avoid conflicts
pub use cp_amm::CP_AMM_PROGRAM_ID;
pub use dlmm::DLMM_PROGRAM_ID;
