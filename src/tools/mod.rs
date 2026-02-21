//! Skill / tool runner.
//!
//! Provides the [`Skill`] trait plus three built-in skills
//! (`read_file`, `write_file`, `exec_shell`) that are always
//! sandboxed to a per-agent workspace directory.
//!
//! A **tools metadata registry** tracks every available tool's name,
//! description, and JSON-Schema for its arguments.  Call [`init()`]
//! at startup to register the builtins; use [`list_tools()`] to
//! retrieve the current catalogue (e.g. for prompt injection).

pub mod builtins;
pub mod parsing;

// Re-export submodules at their old paths for backward compatibility.
pub use builtins::browser_service;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;
use std::collections::HashSet;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use tracing::info;

// Re-export per-tool public functions so existing callers keep working.
pub use builtins::exec_shell::{exec_shell, extract_command_names};
pub use builtins::read_file::read_file;
pub use builtins::write_file::write_file;
pub use builtins::edit_file::edit_file;

// ── Tool metadata registry ──────────────────────────────────

/// Metadata describing a tool / skill available to agents.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolMeta {
    /// Short machine-friendly name (e.g. `"read_file"`).
    pub name: String,
    /// Human-readable one-liner describing what the tool does.
    pub description: String,
    /// JSON Schema object describing the expected `args` value.
    pub args_schema: Value,
}

/// Async handler function that tools register for dispatch.
pub type SkillHandler = Arc<
    dyn Fn(Value, PathBuf) -> Pin<Box<dyn Future<Output = anyhow::Result<Value>> + Send>>
        + Send
        + Sync,
>;

/// Metadata for a skill loaded from a SKILL.md manifest.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SkillEntry {
    pub instructions: String,
    pub scope: String,
    pub version: String,
    pub description: Option<String>,
    pub operator_managed: Option<bool>,
}

/// Combined registry entry: metadata + optional handler + optional skill data.
struct ToolEntry {
    meta: ToolMeta,
    handler: Option<SkillHandler>,
    /// Set for entries loaded from SKILL.md manifests (instruction-based context).
    skill: Option<SkillEntry>,
    /// When true, this tool is NOT injected into the prompt/function-defs
    /// upfront.  The agent must discover it via `search_tools` first.
    /// Deferred tools are still fully callable once discovered.
    deferred: bool,
}

/// Global tool registry.
static REGISTRY: Lazy<Mutex<Vec<ToolEntry>>> = Lazy::new(|| Mutex::new(Vec::new()));

/// Register a tool's metadata in the global registry (no handler).
///
/// Duplicate names are silently ignored (first-registration wins).
pub fn register_tool(meta: ToolMeta) {
    let mut reg = REGISTRY.lock().expect("tool registry poisoned");
    if reg.iter().any(|e| e.meta.name == meta.name) {
        return;
    }
    reg.push(ToolEntry {
        meta,
        handler: None,
        skill: None,
        deferred: false,
    });
}

/// Register a tool as deferred (discoverable via `search_tools` but not
/// injected into the prompt upfront).
pub fn register_tool_deferred(meta: ToolMeta) {
    let mut reg = REGISTRY.lock().expect("tool registry poisoned");
    if reg.iter().any(|e| e.meta.name == meta.name) {
        return;
    }
    reg.push(ToolEntry {
        meta,
        handler: None,
        skill: None,
        deferred: true,
    });
}

/// Attach a handler to an already-registered tool by name.
///
/// If no tool with the given name exists yet, this is a no-op.
pub fn register_handler(name: &str, handler: SkillHandler) {
    let mut reg = REGISTRY.lock().expect("tool registry poisoned");
    if let Some(entry) = reg.iter_mut().find(|e| e.meta.name == name) {
        entry.handler = Some(handler);
    }
}

/// Return metadata for every registered tool (including deferred).
pub fn list_tools() -> Vec<ToolMeta> {
    REGISTRY
        .lock()
        .expect("tool registry poisoned")
        .iter()
        .map(|e| e.meta.clone())
        .collect()
}

/// Return only *core* tools (non-deferred) — these are injected into the
/// agent prompt and function-calling definitions upfront.
pub fn list_tools_core() -> Vec<ToolMeta> {
    REGISTRY
        .lock()
        .expect("tool registry poisoned")
        .iter()
        .filter(|e| !e.deferred)
        .map(|e| e.meta.clone())
        .collect()
}

/// Search the tool registry by keyword.  Matches against tool name and
/// description (case-insensitive substring).  Returns matching `ToolMeta`
/// entries, including deferred tools.
///
/// Applies lightweight normalization:
/// - Case-insensitive
/// - Splits underscores/hyphens so "cron_job" matches query "job"
/// - Simple suffix stemming ("agents" → "agent", "scheduling" → "schedul")
/// - Small synonym table ("schedule"→"cron", "remember"→"memory", etc.)
pub fn search_tools_registry(query: &str, limit: usize) -> Vec<ToolMeta> {
    let reg = REGISTRY.lock().expect("tool registry poisoned");
    let lower_query = query.to_lowercase();
    let raw_terms: Vec<&str> = lower_query.split_whitespace().collect();

    // Expand query terms with stems + synonyms.
    let expanded: Vec<String> = raw_terms
        .iter()
        .flat_map(|t| {
            let mut set = vec![t.to_string()];
            let stemmed = naive_stem(t);
            if stemmed != *t {
                set.push(stemmed.clone());
            }
            // Add synonyms for the original and stemmed forms.
            for syn in synonyms(t).into_iter().chain(synonyms(&stemmed)) {
                if !set.contains(&syn) {
                    set.push(syn);
                }
            }
            set
        })
        .collect();

    let mut scored: Vec<(usize, &ToolMeta)> = reg
        .iter()
        .filter_map(|e| {
            let name_lower = e.meta.name.to_lowercase();
            let desc_lower = e.meta.description.to_lowercase();
            // Split name on underscores/hyphens for token-level matching.
            let name_tokens: Vec<&str> = name_lower
                .split(|c: char| c == '_' || c == '-')
                .collect();
            let mut score = 0usize;

            // Exact name match (highest priority).
            if name_lower == lower_query {
                score += 100;
            }
            // Name contains full query as substring.
            if name_lower.contains(&lower_query) {
                score += 50;
            }
            // Per-expanded-term matching.
            for term in &expanded {
                // Token-level match on name parts (e.g. "job" matches "cron_job").
                if name_tokens.iter().any(|tok| tok.contains(term.as_str())) {
                    score += 25;
                } else if name_lower.contains(term.as_str()) {
                    score += 20;
                }
                if desc_lower.contains(term.as_str()) {
                    score += 10;
                }
            }
            if score > 0 {
                Some((score, &e.meta))
            } else {
                None
            }
        })
        .collect();

    // Sort by score descending.
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored
        .into_iter()
        .take(limit)
        .map(|(_, m)| m.clone())
        .collect()
}

/// Naive English suffix stemmer — good enough for tool search.
fn naive_stem(word: &str) -> String {
    let w = word.to_lowercase();
    // Order matters: try longer suffixes first.
    for suffix in &["ying", "ling", "ring", "ning", "ting"] {
        if w.ends_with(suffix) && w.len() > suffix.len() + 2 {
            return w[..w.len() - suffix.len() + 1].to_string(); // keep consonant
        }
    }
    if w.ends_with("ies") && w.len() > 4 {
        return format!("{}y", &w[..w.len() - 3]);
    }
    if w.ends_with("ses") || w.ends_with("zes") || w.ends_with("xes") {
        return w[..w.len() - 2].to_string();
    }
    if w.ends_with("ing") && w.len() > 4 {
        return w[..w.len() - 3].to_string();
    }
    if w.ends_with("es") && w.len() > 3 {
        return w[..w.len() - 2].to_string();
    }
    if w.ends_with('s') && !w.ends_with("ss") && w.len() > 3 {
        return w[..w.len() - 1].to_string();
    }
    w
}

/// Small synonym/alias table for common tool-search intents.
fn synonyms(term: &str) -> Vec<String> {
    match term {
        "schedule" | "scheduled" | "timer" | "periodic" => {
            vec!["cron".into(), "job".into(), "schedule".into()]
        }
        "cron" => vec!["schedule".into(), "job".into(), "timer".into()],
        "remember" | "memorize" | "store" | "knowledge" => {
            vec!["memory".into(), "save".into(), "recall".into()]
        }
        "memory" | "memories" => vec!["save_memory".into(), "recall".into(), "forget".into()],
        "forget" | "delete" => vec!["forget".into(), "delete".into(), "remove".into()],
        "agent" | "bot" | "assistant" => {
            vec!["agent".into(), "list_agent".into(), "create_agent".into()]
        }
        "session" | "chat" | "conversation" => {
            vec!["session".into(), "chat".into()]
        }
        "skill" | "capability" | "plugin" => {
            vec!["skill".into(), "create_skill".into()]
        }
        "run" | "execute" | "shell" | "command" | "cmd" | "bash" => {
            vec!["exec".into(), "shell".into(), "exec_shell".into()]
        }
        "file" | "read" | "write" | "edit" | "list" | "ls" | "dir" => {
            vec!["file".into(), "read_file".into(), "write_file".into(), "edit_file".into(), "list_file".into()]
        }
        "browse" | "web" | "url" | "http" | "page" => {
            vec!["browser".into()]
        }
        _ => vec![],
    }
}

// ── Unified skill management ─────────────────────────────────
//
// Skills loaded from SKILL.md manifests are stored alongside builtins
// in the same REGISTRY.  This provides a single source of truth for
// all agent capabilities — callable tools AND instructional context.

/// Agent ID used for skill reload (stored at boot).
static SKILL_AGENT_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

/// Store the default agent ID so skill reload can reconstruct a
/// [`SkillRegistry`](crate::skills::SkillRegistry) loader.
pub fn set_skill_agent_id(id: Option<String>) {
    if let Ok(mut guard) = SKILL_AGENT_ID.lock() {
        *guard = id;
    }
}

/// Sync all skills from a loaded [`SkillRegistry`] into the unified
/// tool registry.  Existing non-builtin entries are cleared first.
///
/// If a skill name matches an existing builtin tool (e.g. `"browser"`),
/// the skill's instructions are attached to that entry rather than
/// creating a duplicate.
pub fn sync_skills(registry: &crate::skills::SkillRegistry) {
    let mut reg = REGISTRY.lock().expect("tool registry poisoned");

    // Remove previous skill entries (keep builtins).
    reg.retain(|e| e.skill.is_none());

    // Merge agent skills first (higher precedence), then global.
    let mut seen = HashSet::new();
    let iter = registry
        .agent_skills
        .iter()
        .chain(registry.global_skills.iter());

    for (id, skill) in iter {
        if !seen.insert(id.clone()) {
            continue; // agent override already processed
        }

        let skill_data = SkillEntry {
            instructions: skill.instructions.clone(),
            scope: skill.meta.scope.clone(),
            version: skill.meta.version.clone(),
            description: skill.meta.description.clone(),
            operator_managed: skill.meta.operator_managed,
        };

        // If a builtin tool already exists with this name, enrich it
        // with skill instructions rather than adding a duplicate.
        if let Some(existing) = reg.iter_mut().find(|e| e.meta.name == *id) {
            existing.skill = Some(skill_data);
            continue;
        }

        // New instruction-only entry (no handler, no schema).
        reg.push(ToolEntry {
            meta: ToolMeta {
                name: id.clone(),
                description: skill
                    .meta
                    .description
                    .clone()
                    .unwrap_or_default(),
                args_schema: serde_json::json!(null),
            },
            handler: None,
            skill: Some(skill_data),
            deferred: false,
        });
    }

    info!(
        total = reg.len(),
        skills = reg.iter().filter(|e| e.skill.is_some()).count(),
        "unified registry synced"
    );
}

/// Reload skills from disk and re-sync to the unified registry.
///
/// Used after skill creation/deletion to pick up changes without restart.
pub fn reload_skills(cfg: Option<&crate::config::Config>) {
    let agent_id = SKILL_AGENT_ID
        .lock()
        .ok()
        .and_then(|id| id.clone());
    let _ = crate::skills::defaults::seed_defaults();
    let mut loader = crate::skills::SkillRegistry::new(agent_id);
    let _ = loader.load_global_skills_with_config(cfg);
    let _ = loader.load_agent_skills_with_config(cfg);
    sync_skills(&loader);
}

/// Build the `<available_skills>` prompt fragment from all entries
/// that carry skill instructions.
///
/// When `enabled_ids` is `Some`, only include skills whose name is in
/// the list.  When `None`, include all with non-empty instructions.
pub fn prompt_instructions(enabled_ids: Option<&[String]>) -> String {
    let reg = REGISTRY.lock().expect("tool registry poisoned");
    let mut parts: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    for entry in reg.iter() {
        let skill = match &entry.skill {
            Some(s) if !s.instructions.trim().is_empty() => s,
            _ => continue,
        };
        if !seen.insert(&entry.meta.name) {
            continue;
        }
        if let Some(ids) = enabled_ids {
            if !ids.iter().any(|id| id == &entry.meta.name) {
                continue;
            }
        }
        parts.push(format!(
            "<skill>\n<name>{}</name>\n<instructions>\n{}\n</instructions>\n</skill>",
            entry.meta.name,
            skill.instructions.trim()
        ));
    }
    if parts.is_empty() {
        return String::new();
    }
    format!(
        "<available_skills>\n{}\n</available_skills>",
        parts.join("\n")
    )
}

/// Return skill metadata for API responses (e.g. `GET /api/skills`).
pub fn list_skill_entries() -> Vec<serde_json::Value> {
    let reg = REGISTRY.lock().expect("tool registry poisoned");
    let mut entries = Vec::new();
    let mut seen = HashSet::new();
    for entry in reg.iter() {
        if let Some(ref skill) = entry.skill {
            if !seen.insert(&entry.meta.name) {
                continue;
            }
            entries.push(serde_json::json!({
                "id": entry.meta.name,
                "version": skill.version,
                "scope": skill.scope,
                "description": skill.description,
                "operator_managed": skill.operator_managed,
            }));
        }
    }
    entries
}

/// Check if a capability (tool or skill) with the given name exists.
pub fn has_capability(name: &str) -> bool {
    let reg = REGISTRY.lock().expect("tool registry poisoned");
    reg.iter().any(|e| e.meta.name == name)
}

/// Total number of loaded skills (entries with skill data).
pub fn skill_count() -> usize {
    REGISTRY
        .lock()
        .expect("tool registry poisoned")
        .iter()
        .filter(|e| e.skill.is_some())
        .count()
}

// ── Skill trait ──────────────────────────────────────────────

/// Trait implemented by every tool / skill the agent can invoke.
#[async_trait]
pub trait Skill: Send + Sync {
    /// Execute the skill with the given JSON arguments.
    async fn call(&self, args: Value) -> anyhow::Result<Value>;
}

// ── Workspace sandboxing ─────────────────────────────────────

/// Resolve `raw` against `workspace` and ensure the result lives
/// inside the workspace.  Returns the canonicalized path on success.
///
/// Absolute paths and paths containing `..` are rejected outright.
pub(crate) fn sandbox_path(workspace: &Path, raw: &str) -> anyhow::Result<PathBuf> {
    // Reject absolute paths outright.
    if Path::new(raw).is_absolute() {
        anyhow::bail!("absolute paths are not allowed: {raw}");
    }

    // Reject paths containing '..' to prevent directory traversal.
    if raw.contains("..") {
        anyhow::bail!("path traversal ('..') is not allowed: {raw}");
    }

    let candidate = workspace.join(raw);

    // Canonicalize the workspace first (must already exist).
    let ws_canon = workspace
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("workspace canonicalize failed: {e}"))?;

    // For the candidate we need to handle the case where the file
    // does not yet exist (write_file).  Walk up until we find an
    // existing ancestor, canonicalize that, then re-append the tail.
    let resolved = canon_or_resolve(&candidate)?;

    if !resolved.starts_with(&ws_canon) {
        anyhow::bail!(
            "path escapes workspace: {} is not under {}",
            resolved.display(),
            ws_canon.display()
        );
    }

    Ok(resolved)
}

/// Best-effort canonicalize: if the full path doesn't exist yet,
/// canonicalize the longest existing prefix and append the rest.
pub(crate) fn canon_or_resolve(p: &Path) -> anyhow::Result<PathBuf> {
    if p.exists() {
        return Ok(p.canonicalize()?);
    }
    // Walk up to find an existing ancestor.
    let mut existing = p.to_path_buf();
    let mut tail = Vec::new();
    while !existing.exists() {
        if let Some(file) = existing.file_name() {
            tail.push(file.to_os_string());
        } else {
            anyhow::bail!("cannot resolve path: {}", p.display());
        }
        existing = existing
            .parent()
            .ok_or_else(|| anyhow::anyhow!("cannot resolve path: {}", p.display()))?
            .to_path_buf();
    }
    let mut resolved = existing.canonicalize()?;
    for component in tail.into_iter().rev() {
        resolved.push(component);
    }
    Ok(resolved)
}

/// Truncate a UTF-8 `String` to at most `max_bytes` on a char boundary,
/// returning the (possibly shortened) owned `String`.
pub(crate) fn truncate_utf8_owned(mut s: String, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    s.truncate(end);
    s
}

// ── Dispatcher ───────────────────────────────────────────────

/// Call a built-in skill by name.
///
/// This is the primary entry point used by the agent runtime;
/// it matches on the skill name and delegates to the correct
/// implementation.
pub async fn call_skill(name: &str, args: Value, workspace: &Path) -> anyhow::Result<Value> {
    // Look up handler in the unified registry first.
    let handler = {
        let reg = REGISTRY.lock().expect("tool registry poisoned");
        reg.iter()
            .find(|e| e.meta.name == name)
            .and_then(|e| e.handler.clone())
    };

    if let Some(h) = handler {
        return h(args, workspace.to_path_buf()).await;
    }

    // Fallback for tools registered without a handler (backward compat).
    match name {
        "read_file" => builtins::read_file::read_file(workspace, args).await,
        "write_file" => builtins::write_file::write_file(workspace, args).await,
        "exec_shell" => builtins::exec_shell::exec_shell(workspace, args).await,
        "browser" => builtins::browser::browser_tool(args).await,
        "save_memory" => builtins::memory::save_memory(workspace, args).await,
        "recall_memory" => builtins::memory::recall_memory(workspace, args).await,
        "forget_memory" => builtins::memory::forget_memory(workspace, args).await,
        "create_skill" => builtins::skill_author::create_skill(workspace, args).await,
        "list_skills" => builtins::skill_author::list_skills(workspace, args).await,
        "delete_skill" => builtins::skill_author::delete_skill(workspace, args).await,
        "edit_skill" => builtins::skill_author::edit_skill(workspace, args).await,
        "edit_file" => builtins::edit_file::edit_file(workspace, args).await,
        "list_files" => builtins::list_files::list_files(workspace, args).await,
        "list_agents" => builtins::agent::list_agents(workspace, args).await,
        "get_agent" => builtins::agent::get_agent(workspace, args).await,
        "create_agent" => builtins::agent::create_agent(workspace, args).await,
        "list_cron_jobs" => builtins::cron::list_cron_jobs(workspace, args).await,
        "create_cron_job" => builtins::cron::create_cron_job(workspace, args).await,
        "update_cron_job" => builtins::cron::update_cron_job(workspace, args).await,
        "delete_cron_job" => builtins::cron::delete_cron_job(workspace, args).await,
        "run_cron_job" => builtins::cron::run_cron_job(workspace, args).await,
        "cron_job_history" => builtins::cron::cron_job_history(workspace, args).await,
        "session_list" => builtins::session::session_list(workspace, args).await,
        "session_status" => builtins::session::session_status(workspace, args).await,
        "session_send" => builtins::session::session_send(workspace, args).await,
        "session_spawn" => builtins::session::session_spawn(workspace, args).await,
        "search_tools" => builtins::search_tools::search_tools(workspace, args).await,
        other => anyhow::bail!("unknown tool: {other}"),
    }
}

/// List the names of all built-in skills.
pub fn builtin_skill_names() -> &'static [&'static str] {
    &[
        "read_file",
        "write_file",
        "edit_file",
        "list_files",
        "exec_shell",
        "save_memory",
        "recall_memory",
        "forget_memory",
        "create_skill",
        "list_skills",
        "delete_skill",
        "edit_skill",
        "browser",
        "list_agents",
        "get_agent",
        "create_agent",
        "list_cron_jobs",
        "create_cron_job",
        "update_cron_job",
        "delete_cron_job",
        "run_cron_job",
        "cron_job_history",
        "session_list",
        "session_status",
        "session_send",
        "session_spawn",
        "search_tools",
    ]
}

/// Module initialization (called from main).
///
/// Registers all built-in skills in the tool metadata registry.
pub fn init() {
    builtins::read_file::register();
    builtins::write_file::register();
    builtins::edit_file::register();
    builtins::list_files::register();
    builtins::exec_shell::register();
    builtins::memory::register();
    builtins::skill_author::register();
    builtins::browser::register();
    builtins::agent::register();
    builtins::cron::register();
    builtins::session::register();
    builtins::search_tools::register();
    builtins::send_message::register();

    // Attach handlers to the built-in tools.
    register_handler(
        "read_file",
        Arc::new(|args, ws| Box::pin(async move { builtins::read_file::read_file(&ws, args).await })),
    );
    register_handler(
        "write_file",
        Arc::new(|args, ws| Box::pin(async move { builtins::write_file::write_file(&ws, args).await })),
    );
    register_handler(
        "edit_file",
        Arc::new(|args, ws| Box::pin(async move { builtins::edit_file::edit_file(&ws, args).await })),
    );
    register_handler(
        "list_files",
        Arc::new(|args, ws| Box::pin(async move { builtins::list_files::list_files(&ws, args).await })),
    );
    register_handler(
        "exec_shell",
        Arc::new(|args, ws| Box::pin(async move { builtins::exec_shell::exec_shell(&ws, args).await })),
    );
    register_handler(
        "save_memory",
        Arc::new(|args, ws| Box::pin(async move { builtins::memory::save_memory(&ws, args).await })),
    );
    register_handler(
        "recall_memory",
        Arc::new(|args, ws| Box::pin(async move { builtins::memory::recall_memory(&ws, args).await })),
    );
    register_handler(
        "forget_memory",
        Arc::new(|args, ws| Box::pin(async move { builtins::memory::forget_memory(&ws, args).await })),
    );
    register_handler(
        "create_skill",
        Arc::new(|args, ws| Box::pin(async move { builtins::skill_author::create_skill(&ws, args).await })),
    );
    register_handler(
        "list_skills",
        Arc::new(|args, ws| Box::pin(async move { builtins::skill_author::list_skills(&ws, args).await })),
    );
    register_handler(
        "delete_skill",
        Arc::new(|args, ws| Box::pin(async move { builtins::skill_author::delete_skill(&ws, args).await })),
    );
    register_handler(
        "edit_skill",
        Arc::new(|args, ws| Box::pin(async move { builtins::skill_author::edit_skill(&ws, args).await })),
    );
    register_handler(
        "browser",
        Arc::new(|args, _ws| Box::pin(async move { builtins::browser::browser_tool(args).await })),
    );
    register_handler(
        "list_agents",
        Arc::new(|args, ws| Box::pin(async move { builtins::agent::list_agents(&ws, args).await })),
    );
    register_handler(
        "get_agent",
        Arc::new(|args, ws| Box::pin(async move { builtins::agent::get_agent(&ws, args).await })),
    );
    register_handler(
        "create_agent",
        Arc::new(|args, ws| Box::pin(async move { builtins::agent::create_agent(&ws, args).await })),
    );
    register_handler(
        "list_cron_jobs",
        Arc::new(|args, ws| Box::pin(async move { builtins::cron::list_cron_jobs(&ws, args).await })),
    );
    register_handler(
        "create_cron_job",
        Arc::new(|args, ws| Box::pin(async move { builtins::cron::create_cron_job(&ws, args).await })),
    );
    register_handler(
        "update_cron_job",
        Arc::new(|args, ws| Box::pin(async move { builtins::cron::update_cron_job(&ws, args).await })),
    );
    register_handler(
        "delete_cron_job",
        Arc::new(|args, ws| Box::pin(async move { builtins::cron::delete_cron_job(&ws, args).await })),
    );
    register_handler(
        "run_cron_job",
        Arc::new(|args, ws| Box::pin(async move { builtins::cron::run_cron_job(&ws, args).await })),
    );
    register_handler(
        "cron_job_history",
        Arc::new(|args, ws| Box::pin(async move { builtins::cron::cron_job_history(&ws, args).await })),
    );
    register_handler(
        "session_list",
        Arc::new(|args, ws| Box::pin(async move { builtins::session::session_list(&ws, args).await })),
    );
    register_handler(
        "session_status",
        Arc::new(|args, ws| Box::pin(async move { builtins::session::session_status(&ws, args).await })),
    );
    register_handler(
        "session_send",
        Arc::new(|args, ws| Box::pin(async move { builtins::session::session_send(&ws, args).await })),
    );
    register_handler(
        "session_spawn",
        Arc::new(|args, ws| Box::pin(async move { builtins::session::session_spawn(&ws, args).await })),
    );    register_handler(
        "search_tools",
        Arc::new(|args, ws| Box::pin(async move { builtins::search_tools::search_tools(&ws, args).await })),
    );
    register_handler(
        "send_message",
        Arc::new(|args, ws| Box::pin(async move { builtins::send_message::send_message(&ws, args).await })),
    );

    // Mark less-common tools as deferred (discoverable via search_tools,
    // but not injected into the prompt upfront — saves tokens).
    {
        let deferred = [
            "list_agents", "get_agent", "create_agent",
            "list_cron_jobs", "create_cron_job", "update_cron_job",
            "delete_cron_job", "run_cron_job", "cron_job_history",
            "session_list", "session_status", "session_send", "session_spawn",
            "create_skill", "list_skills", "delete_skill", "edit_skill",
        ];
        let mut reg = REGISTRY.lock().expect("tool registry poisoned");
        for entry in reg.iter_mut() {
            if deferred.contains(&entry.meta.name.as_str()) {
                entry.deferred = true;
            }
        }
    }
    tracing::debug!(
        skills = ?builtin_skill_names(),
        "tools module loaded ({} total, {} core, {} deferred)",
        list_tools().len(),
        list_tools_core().len(),
        list_tools().len() - list_tools_core().len(),
    );
}
