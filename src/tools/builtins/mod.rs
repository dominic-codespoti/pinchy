//! Built-in tool implementations.
//!
//! Each sub-module implements one (or a small family of) tool(s) that
//! the agent can invoke.  Helper services (e.g. the browser sidecar
//! client) also live here alongside the tools that use them.

pub mod agent;
pub mod browser;
pub mod browser_service;
pub mod cron;
pub mod edit_file;
pub mod exec_shell;
pub mod list_files;
pub mod memory;
pub mod read_file;
pub mod search_tools;
pub mod send_message;
pub mod session;
pub mod skill_author;
pub mod write_file;
