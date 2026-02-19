//! Persistent memory tool — cross-session knowledge store.
//!
//! Storage: `agents/<id>/workspace/memory.db` (SQLite + FTS5)
//!
//! Tools exposed to the agent:
//! - `save_memory { key, value, tags? }` — upsert a memory entry
//! - `recall_memory { query?, tag?, limit? }` — ranked full-text search
//! - `forget_memory { key }` — delete a memory entry

use std::path::Path;

use serde_json::Value;

use crate::tools::register_tool;
use crate::tools::ToolMeta;

/// `save_memory` tool — upsert a memory entry by key.
pub async fn save_memory(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let key = args["key"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("save_memory requires a 'key' string"))?
        .to_string();
    let value = args["value"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("save_memory requires a 'value' string"))?
        .to_string();
    let tags: Vec<String> = args["tags"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let store = crate::memory::MemoryStore::open(workspace)?;
    store.save(&key, &value, &tags)?;
    // Invalidate cached embedding so it gets re-computed on next semantic search.
    let _ = store.delete_embedding(&key);

    Ok(serde_json::json!({
        "status": "saved",
        "key": key,
    }))
}

/// `recall_memory` tool — search memories with FTS5 ranked search.
///
/// When mode is unspecified (the default), this auto-detects whether an
/// embedding provider is available and prefers semantic search if so.
pub async fn recall_memory(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let query = args["query"].as_str().unwrap_or("");
    let tag = args["tag"].as_str();
    let limit = args["limit"].as_u64().unwrap_or(10) as usize;
    let explicit_mode = args["mode"].as_str();

    let store = crate::memory::MemoryStore::open(workspace)?;

    // Determine effective mode: if the caller didn't specify, auto-detect
    // embedding availability and prefer semantic search when possible.
    let use_semantic = match explicit_mode {
        Some("semantic") => true,
        Some("text") => false,
        _ => {
            // Auto-detect: try semantic if a query was given and an
            // embedding provider is available.
            if query.is_empty() {
                false
            } else {
                has_embedding_provider()
            }
        }
    };

    let results = if use_semantic {
        match recall_semantic(&store, query, tag, limit).await {
            Ok(r) => r,
            Err(e) => {
                // Fallback to text search if semantic fails.
                tracing::debug!(error = %e, "semantic recall failed, falling back to text search");
                store.search(query, tag, limit)?
            }
        }
    } else {
        store.search(query, tag, limit)?
    };

    let items: Vec<Value> = results
        .iter()
        .map(|e| {
            let mut obj = serde_json::json!({
                "key": e.key,
                "value": e.value,
                "tags": e.tags,
                "timestamp": e.timestamp,
            });
            if let Some(score) = e.score {
                obj["relevance"] = serde_json::json!(score);
            }
            obj
        })
        .collect();

    Ok(serde_json::json!({ "memories": items }))
}

/// Check whether an embedding provider is currently available.
fn has_embedding_provider() -> bool {
    use crate::models::GLOBAL_PROVIDERS;
    match GLOBAL_PROVIDERS.get() {
        Some(mutex) => {
            if let Ok(guard) = mutex.lock() {
                // Check provider count — if at least one provider exists,
                // there's a chance it supports embeddings. The actual
                // embed call will fail gracefully if not.
                guard.provider_count() > 0
            } else {
                false
            }
        }
        None => false,
    }
}

/// Helper: semantic recall via embedding provider.
async fn recall_semantic(
    store: &crate::memory::MemoryStore,
    query: &str,
    tag: Option<&str>,
    limit: usize,
) -> anyhow::Result<Vec<crate::memory::MemoryEntry>> {
    use crate::models::GLOBAL_PROVIDERS;

    if query.is_empty() {
        anyhow::bail!("semantic recall requires a non-empty query");
    }

    // Clone the Arc out of the mutex so we can drop the guard before await.
    let pm = {
        let guard = GLOBAL_PROVIDERS
            .get()
            .ok_or_else(|| anyhow::anyhow!("no providers initialised — cannot embed"))?
            .lock()
            .map_err(|_| anyhow::anyhow!("provider lock poisoned"))?;
        std::sync::Arc::clone(&guard)
    };

    // Embed the query.
    let query_vecs = pm
        .embed(&[query])
        .await?
        .ok_or_else(|| anyhow::anyhow!("no provider supports embeddings"))?;

    let query_emb = query_vecs
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("embedding returned empty result"))?;

    // Ensure all memories have cached embeddings (best-effort).
    let missing = store.keys_without_embeddings()?;
    if !missing.is_empty() {
        let entries = store.search("", None, 10000)?;
        let texts_to_embed: Vec<(&str, &str)> = entries
            .iter()
            .filter(|e| missing.iter().any(|k| k == &e.key))
            .map(|e| (e.key.as_str(), e.value.as_str()))
            .collect();

        if !texts_to_embed.is_empty() {
            let text_refs: Vec<&str> = texts_to_embed.iter().map(|(_, v)| *v).collect();
            if let Ok(Some(vecs)) = pm.embed(&text_refs).await {
                for ((key, _), vec) in texts_to_embed.iter().zip(vecs.iter()) {
                    let _ = store.save_embedding(key, vec);
                }
            }
        }
    }

    store.search_semantic(&query_emb, tag, limit)
}

/// `forget_memory` tool — delete a memory entry by key.
pub async fn forget_memory(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let key = args["key"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("forget_memory requires a 'key' string"))?
        .to_string();

    let store = crate::memory::MemoryStore::open(workspace)?;
    let deleted = store.forget(&key)?;
    let _ = store.delete_embedding(&key);

    Ok(serde_json::json!({
        "status": if deleted { "deleted" } else { "not_found" },
        "key": key,
    }))
}

/// Build the `<memory>` block for system prompt injection.
pub async fn memory_prompt_block(workspace: &Path, max_chars: usize) -> String {
    match crate::memory::MemoryStore::open(workspace) {
        Ok(store) => {
            // Auto-migrate legacy JSONL on first access.
            let _ = store.migrate_from_jsonl(workspace);
            store.prompt_block(max_chars)
        }
        Err(_) => String::new(),
    }
}

/// Register memory tools in the global tool registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "save_memory".into(),
        description: "Save a piece of information to persistent memory. Survives across sessions."
            .into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Short identifier for this memory (e.g. 'user_timezone', 'project_goal')"
                },
                "value": {
                    "type": "string",
                    "description": "The information to remember"
                },
                "tags": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional tags for categorisation"
                }
            },
            "required": ["key", "value"]
        }),
    });

    register_tool(ToolMeta {
        name: "recall_memory".into(),
        description: "Search persistent memory. Auto-detects embedding support: uses semantic (meaning-based) search when available, falls back to keyword search (FTS5/BM25). Override with mode parameter.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search terms (ranked by relevance)"
                },
                "tag": {
                    "type": "string",
                    "description": "Filter by tag"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 10)"
                },
                "mode": {
                    "type": "string",
                    "enum": ["text", "semantic"],
                    "description": "Search mode: 'text' (default, keyword) or 'semantic' (embedding similarity)"
                }
            }
        }),
    });

    register_tool(ToolMeta {
        name: "forget_memory".into(),
        description: "Delete a specific memory entry by key.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "The key of the memory entry to delete"
                }
            },
            "required": ["key"]
        }),
    });
}
