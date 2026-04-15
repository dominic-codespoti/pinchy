//! Built-in tool implementations.
//!
//! Each sub-module implements one (or a small family of) tool(s) that
//! the agent can invoke.  Helper services (e.g. the browser sidecar
//! client) also live here alongside the tools that use them.

pub mod agent;
pub mod apply_patch;
pub mod browser_extract;
pub mod browser_form;
pub mod browser_research;
pub mod browser_screenshot;
pub mod cron;
pub mod delegate;
pub mod edit_file;
pub mod exec_shell;
pub mod list_files;
pub mod mcp;
pub mod memory;
pub mod read_file;
pub mod self_update;
pub mod send_message;
pub mod session;
pub mod session_yield;
pub mod skill_author;
pub mod write_file;
