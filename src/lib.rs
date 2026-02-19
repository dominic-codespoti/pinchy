//! mini_claw — lightweight Rust agent platform.
//!
//! This library crate re-exports modules so integration tests
//! (under `tests/`) can access them.

pub mod agent;
pub mod auth;
pub mod cli;
pub mod comm;
pub mod config;
pub mod context;
pub mod discord;
pub mod gateway;
pub mod logs;
pub mod memory;
pub mod models;
pub mod scheduler;
pub mod secrets;
pub mod session;
pub mod skills;
pub mod slash;
pub mod tools;
pub mod utils;

/// Return the Pinchy home directory.
///
/// Resolution order:
/// 1. `PINCHY_HOME` environment variable
/// 2. `$HOME/.pinchy`
pub fn pinchy_home() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("PINCHY_HOME") {
        std::path::PathBuf::from(p)
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join(".pinchy")
    }
}
