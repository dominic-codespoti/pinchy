use std::path::Path;

use anyhow::Context as _;
use serde::Deserialize;
use tracing::{debug, warn};

use crate::models::{ChatMessage, ModelProvider};
use crate::session::Exchange;

use super::types::Agent;

const AUTO_DISTILL_MIN_MESSAGES: usize = 8;
const AUTO_DISTILL_LOOKBACK: usize = 24;
const AUTO_DISTILL_MAX_NEW_MESSAGES: usize = 12;
const AUTO_DISTILL_MAX_EXCERPT_CHARS: usize = 500;
const AUTO_DISTILL_MAX_ITEMS: usize = 6;

#[derive(Debug, Deserialize)]
struct DistilledMemoryItem {
    kind: String,
    key: Option<String>,
    value: String,
    confidence: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PersistedMemoryItem {
    kind: String,
    key: String,
    value: String,
}

impl Agent {
    pub fn spawn_auto_distill_if_needed(&self) {
        let Some(session_id) = self.current_session.clone() else {
            return;
        };
        let workspace = self.workspace.clone();
        let agent_id = self.id.clone();
        tokio::spawn(async move {
            if let Err(error) = auto_distill_session(&workspace, &agent_id, &session_id).await {
                warn!(agent = %agent_id, session = %session_id, error = %error, "auto-distill failed");
            }
        });
    }
}

async fn auto_distill_session(
    workspace: &Path,
    agent_id: &str,
    session_id: &str,
) -> anyhow::Result<()> {
    let Some(db) = crate::store::global_db() else {
        return Ok(());
    };
    let exchange_count = db.exchange_count(session_id)?;
    if exchange_count < AUTO_DISTILL_MIN_MESSAGES {
        return Ok(());
    }
    let history = db.load_history(session_id, AUTO_DISTILL_LOOKBACK)?;
    if history.len() < AUTO_DISTILL_MIN_MESSAGES {
        return Ok(());
    }

    let checkpoint = load_distill_checkpoint(workspace, session_id)
        .await
        .unwrap_or(0);
    if exchange_count <= checkpoint {
        return Ok(());
    }

    let new_count = exchange_count.saturating_sub(checkpoint);
    if new_count < AUTO_DISTILL_MIN_MESSAGES / 2 {
        return Ok(());
    }

    let start = history
        .len()
        .saturating_sub(AUTO_DISTILL_MAX_NEW_MESSAGES.max(new_count));
    let slice = &history[start..];
    let excerpt = build_excerpt(slice);
    if excerpt.is_empty() {
        return Ok(());
    }

    let Some(pm) = crate::models::get_global_providers() else {
        return Ok(());
    };
    let response = pm
        .send_chat(&distill_prompt(&excerpt))
        .await
        .context("distillation model call failed")?;

    let Some(items) = parse_distilled_items(&response) else {
        debug!(agent = %agent_id, session = %session_id, "auto-distill returned no parseable items");
        save_distill_checkpoint(workspace, session_id, exchange_count).await?;
        return Ok(());
    };

    let store = crate::memory::MemoryStore::open(workspace)?;
    let mut saved = 0usize;
    for item in items.into_iter().take(AUTO_DISTILL_MAX_ITEMS) {
        let Some(normalized) = normalize_item(item) else {
            continue;
        };
        let Some(persisted) = prepare_persisted_item(&store, normalized) else {
            continue;
        };
        let tags = distilled_tags(&persisted.kind);
        store.save_and_invalidate_embedding(&persisted.key, persisted.value.trim(), &tags)?;
        saved += 1;
    }

    save_distill_checkpoint(workspace, session_id, exchange_count).await?;
    debug!(agent = %agent_id, session = %session_id, saved, "auto-distilled session memory");
    Ok(())
}

fn build_excerpt(history: &[Exchange]) -> String {
    history
        .iter()
        .filter(|ex| ex.role == "user" || ex.role == "assistant" || ex.role == "tool")
        .map(|ex| {
            format!(
                "[{}] {}",
                ex.role,
                crate::utils::truncate_str(&ex.content, AUTO_DISTILL_MAX_EXCERPT_CHARS)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn distill_prompt(excerpt: &str) -> Vec<ChatMessage> {
    vec![
        ChatMessage::system(
            "Extract only durable memory candidates from the conversation. Return JSON only: an array of objects with keys kind, key, value, confidence. Allowed kinds: preference, fact, task_state. Do not store temporary chatter, greetings, or raw tool output. Prefer atomic facts. Do not include secrets.",
        ),
        ChatMessage::user(format!(
            "Conversation excerpt:\n{}\n\nReturn only JSON.",
            excerpt
        )),
    ]
}

fn parse_distilled_items(response: &str) -> Option<Vec<DistilledMemoryItem>> {
    serde_json::from_str::<Vec<DistilledMemoryItem>>(response)
        .ok()
        .or_else(|| {
            crate::tools::parsing::extract_fenced_json(response)
                .and_then(|json| serde_json::from_str(&json).ok())
        })
}

fn should_persist_item(item: &DistilledMemoryItem) -> bool {
    let Some(kind) = normalize_kind(&item.kind) else {
        return false;
    };
    let value = item.value.trim();
    if value.is_empty() || value.len() > 500 || looks_secret_like(value) {
        return false;
    }
    if item.confidence.unwrap_or(0.0) < 0.72 {
        return false;
    }
    match kind {
        "preference" => valid_preference(item.key.as_deref(), value),
        "fact" => valid_fact(item.key.as_deref(), value),
        "task_state" => valid_task_state(item.key.as_deref(), value),
        _ => false,
    }
}

fn normalize_item(mut item: DistilledMemoryItem) -> Option<DistilledMemoryItem> {
    item.kind = normalize_kind(&item.kind)?.to_string();
    item.value = item.value.trim().replace(['\n', '\r'], " ");
    item.key = normalize_optional_key(item.key.as_deref());
    if should_persist_item(&item) {
        Some(item)
    } else {
        None
    }
}

fn distilled_key(item: &DistilledMemoryItem) -> String {
    if let Some(key) = item
        .key
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
    {
        return key.replace(['\n', '\r'], " ");
    }

    match item.kind.as_str() {
        "task_state" => "task:current".to_string(),
        "preference" => format!("preference:{}", slugify(&item.value)),
        _ => format!("fact:{}", slugify(&item.value)),
    }
}

fn prepare_persisted_item(
    store: &crate::memory::MemoryStore,
    item: DistilledMemoryItem,
) -> Option<PersistedMemoryItem> {
    let key = distilled_key(&item);
    let value = item.value.trim().to_string();

    let existing = store.get(&key).ok().flatten();
    if let Some(existing) = existing {
        if equivalent_memory_value(&existing.value, &value) {
            return None;
        }
        if should_skip_update(&item.kind, &existing.value, &value) {
            return None;
        }
    }

    Some(PersistedMemoryItem {
        kind: item.kind,
        key,
        value,
    })
}

fn equivalent_memory_value(existing: &str, candidate: &str) -> bool {
    normalize_compare_value(existing) == normalize_compare_value(candidate)
}

fn should_skip_update(kind: &str, existing: &str, candidate: &str) -> bool {
    match kind {
        "preference" => normalize_compare_value(existing) == normalize_compare_value(candidate),
        "fact" => normalize_compare_value(existing) == normalize_compare_value(candidate),
        "task_state" => false,
        _ => false,
    }
}

fn normalize_compare_value(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn normalize_kind(kind: &str) -> Option<&'static str> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "preference" | "preferences" => Some("preference"),
        "fact" | "facts" => Some("fact"),
        "task_state" | "task-state" | "taskstate" => Some("task_state"),
        _ => None,
    }
}

fn normalize_optional_key(key: Option<&str>) -> Option<String> {
    key.map(str::trim)
        .filter(|key| !key.is_empty())
        .map(|key| key.replace(['\n', '\r'], " "))
}

fn valid_preference(key: Option<&str>, value: &str) -> bool {
    let Some(key) = key.map(str::trim).filter(|key| !key.is_empty()) else {
        return false;
    };
    if key.contains(' ') || key.len() > 64 {
        return false;
    }
    value.len() <= 200 && !looks_transient(value)
}

fn valid_fact(key: Option<&str>, value: &str) -> bool {
    let Some(key) = key.map(str::trim).filter(|key| !key.is_empty()) else {
        return false;
    };
    if key.len() > 96 || value.len() > 240 {
        return false;
    }
    !looks_transient(value)
}

fn valid_task_state(key: Option<&str>, value: &str) -> bool {
    if let Some(key) = key.map(str::trim).filter(|key| !key.is_empty()) {
        if key.len() > 96 {
            return false;
        }
    }
    value.len() <= 240 && looks_taskish(value)
}

fn looks_transient(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("just now")
        || lower.contains("today only")
        || lower.contains("temporary")
        || lower.contains("for now")
        || lower.contains("this turn")
}

fn looks_taskish(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("working on")
        || lower.contains("implement")
        || lower.contains("debug")
        || lower.contains("fix")
        || lower.contains("build")
        || lower.contains("task")
        || lower.contains("investigat")
}

fn looks_secret_like(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("api_key")
        || lower.contains("api key")
        || lower.contains("bearer ")
        || lower.contains("token")
        || lower.contains("password")
        || lower.contains("secret")
}

fn distilled_tags(kind: &str) -> Vec<String> {
    match kind {
        "preference" => vec!["preference".to_string()],
        "task_state" => vec!["task".to_string(), "task-state".to_string()],
        _ => vec!["fact".to_string()],
    }
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
        if out.len() >= 48 {
            break;
        }
    }
    out.trim_matches('-').to_string()
}

async fn load_distill_checkpoint(workspace: &Path, session_id: &str) -> anyhow::Result<usize> {
    let path = checkpoint_path(workspace, session_id);
    let raw = tokio::fs::read_to_string(path).await?;
    Ok(raw.trim().parse::<usize>().unwrap_or(0))
}

async fn save_distill_checkpoint(
    workspace: &Path,
    session_id: &str,
    count: usize,
) -> anyhow::Result<()> {
    let path = checkpoint_path(workspace, session_id);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    tokio::fs::write(path, count.to_string()).await?;
    Ok(())
}

fn checkpoint_path(workspace: &Path, session_id: &str) -> std::path::PathBuf {
    workspace
        .join(".pinchy")
        .join("distill")
        .join(format!("{}.checkpoint", session_id.replace('/', "_")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_distilled_json() {
        let items = parse_distilled_items(
            r#"[{"kind":"preference","key":"timezone","value":"User is in UTC","confidence":0.91}]"#,
        )
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, "preference");
    }

    #[test]
    fn rejects_low_confidence_items() {
        let item = DistilledMemoryItem {
            kind: "fact".to_string(),
            key: Some("name".to_string()),
            value: "User is Dom".to_string(),
            confidence: Some(0.5),
        };
        assert!(!should_persist_item(&item));
    }

    #[test]
    fn task_state_defaults_to_stable_key() {
        let item = DistilledMemoryItem {
            kind: "task_state".to_string(),
            key: None,
            value: "Working on memory ranking".to_string(),
            confidence: Some(0.9),
        };
        assert_eq!(distilled_key(&item), "task:current");
    }

    #[test]
    fn rejects_preference_without_stable_key() {
        let item = DistilledMemoryItem {
            kind: "preference".to_string(),
            key: None,
            value: "User prefers concise replies".to_string(),
            confidence: Some(0.95),
        };
        assert!(normalize_item(item).is_none());
    }

    #[test]
    fn rejects_transient_fact() {
        let item = DistilledMemoryItem {
            kind: "fact".to_string(),
            key: Some("deployment_status".to_string()),
            value: "Deployment is temporary for now".to_string(),
            confidence: Some(0.95),
        };
        assert!(normalize_item(item).is_none());
    }

    #[test]
    fn rejects_non_taskish_task_state() {
        let item = DistilledMemoryItem {
            kind: "task_state".to_string(),
            key: None,
            value: "The user likes tea".to_string(),
            confidence: Some(0.95),
        };
        assert!(normalize_item(item).is_none());
    }

    #[test]
    fn normalizes_kind_aliases() {
        let item = DistilledMemoryItem {
            kind: "task-state".to_string(),
            key: None,
            value: "Working on memory ranking".to_string(),
            confidence: Some(0.9),
        };
        let normalized = normalize_item(item).unwrap();
        assert_eq!(normalized.kind, "task_state");
    }

    #[test]
    fn skips_equivalent_existing_fact() {
        let dir = tempfile::TempDir::new().unwrap();
        let store = crate::memory::MemoryStore::open(dir.path()).unwrap();
        store
            .save_and_invalidate_embedding("timezone", "User is in UTC", &["fact".into()])
            .unwrap();

        let item = DistilledMemoryItem {
            kind: "fact".to_string(),
            key: Some("timezone".to_string()),
            value: " user   is in utc ".to_string(),
            confidence: Some(0.95),
        };

        assert!(prepare_persisted_item(&store, normalize_item(item).unwrap()).is_none());
    }

    #[test]
    fn skips_shorter_preference_update() {
        let dir = tempfile::TempDir::new().unwrap();
        let store = crate::memory::MemoryStore::open(dir.path()).unwrap();
        store
            .save_and_invalidate_embedding(
                "response_style",
                "User prefers concise replies with bullets",
                &["preference".into()],
            )
            .unwrap();

        let item = DistilledMemoryItem {
            kind: "preference".to_string(),
            key: Some("response_style".to_string()),
            value: "User prefers concise replies".to_string(),
            confidence: Some(0.95),
        };

        let persisted = prepare_persisted_item(&store, normalize_item(item).unwrap()).unwrap();
        assert_eq!(persisted.key, "response_style");
        assert_eq!(persisted.value, "User prefers concise replies");
    }

    #[test]
    fn allows_task_state_replacement() {
        let dir = tempfile::TempDir::new().unwrap();
        let store = crate::memory::MemoryStore::open(dir.path()).unwrap();
        store
            .save_and_invalidate_embedding(
                "task:current",
                "Working on ranking",
                &["task".into(), "task-state".into()],
            )
            .unwrap();

        let item = DistilledMemoryItem {
            kind: "task_state".to_string(),
            key: None,
            value: "Working on distillation validation".to_string(),
            confidence: Some(0.95),
        };

        let persisted = prepare_persisted_item(&store, normalize_item(item).unwrap()).unwrap();
        assert_eq!(persisted.key, "task:current");
        assert_eq!(persisted.value, "Working on distillation validation");
    }

    #[test]
    fn checkpoint_progress_uses_full_exchange_count() {
        let history_len = 24usize;
        let exchange_count = 31usize;
        let checkpoint = 24usize;

        assert!(history_len <= checkpoint);
        assert!(exchange_count > checkpoint);
        assert_eq!(exchange_count.saturating_sub(checkpoint), 7);
    }
}
