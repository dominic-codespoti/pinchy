//! Unified memory tools — persistent SQLite memory + curated prompt memory.
//!
//! Storage: `agents/<id>/workspace/memory.db` (SQLite + FTS5)
//!
//! Tools exposed to the agent:
//! - `save_memory { key?, value, tags?, storage_mode?, target? }`
//! - `recall_memory { query?, tag?, limit?, storage_mode?, target? }`
//! - `forget_memory { key, storage_mode?, target? }`

use std::path::Path;
use std::sync::Arc;

use serde::Deserialize;
use serde_json::Value;

use crate::tools::register_tool;
use crate::tools::ToolMeta;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
enum StorageMode {
    #[default]
    Persistent,
    Curated,
}

#[derive(Debug, Deserialize, Default)]
struct SaveMemoryArgs {
    key: Option<String>,
    value: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    storage_mode: StorageMode,
    #[serde(default)]
    target: crate::memory::curated::CuratedTarget,
}

#[derive(Debug, Deserialize, Default)]
struct RecallMemoryArgs {
    query: Option<String>,
    tag: Option<String>,
    limit: Option<usize>,
    mode: Option<String>,
    #[serde(default)]
    storage_mode: StorageMode,
    #[serde(default)]
    target: crate::memory::curated::CuratedTarget,
}

#[derive(Debug, Deserialize, Default)]
struct ForgetMemoryArgs {
    key: Option<String>,
    #[serde(default)]
    storage_mode: StorageMode,
    #[serde(default)]
    target: crate::memory::curated::CuratedTarget,
}

#[derive(Debug, Deserialize, Default)]
struct CuratedMemoryCompatArgs {
    operation: Option<String>,
    action: Option<String>,
    key: Option<String>,
    value: Option<String>,
    target: Option<crate::memory::curated::CuratedTarget>,
}

fn normalize_non_empty_value(value: Option<String>) -> anyhow::Result<String> {
    let value = value.ok_or_else(|| anyhow::anyhow!("save_memory requires a 'value' string"))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("save_memory requires a non-empty 'value' string");
    }
    Ok(trimmed.to_string())
}

fn normalize_optional_key(key: Option<String>, field: &str) -> anyhow::Result<Option<String>> {
    match key {
        Some(key) => {
            let trimmed = key.trim();
            if trimmed.is_empty() {
                anyhow::bail!("{field} requires a non-empty '{field}' string");
            }
            Ok(Some(trimmed.to_string()))
        }
        None => Ok(None),
    }
}

/// `save_memory` tool — upsert a memory entry by key.
pub async fn save_memory(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: SaveMemoryArgs = serde_json::from_value(args)?;
    let value = normalize_non_empty_value(args.value)?;
    let key = normalize_optional_key(args.key, "key")?;

    if args.storage_mode == StorageMode::Curated {
        let store = crate::memory::curated::CuratedStore::open(workspace)?;
        store.save(args.target, key.as_deref(), &value)?;

        return Ok(serde_json::json!({
            "status": "saved",
            "storage_mode": "curated",
            "target": args.target.as_str(),
            "key": key,
        }));
    }

    let key = key.ok_or_else(|| anyhow::anyhow!("save_memory requires a 'key' string"))?;
    let tags: Vec<String> = args
        .tags
        .into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect();

    let store = Arc::new(crate::memory::MemoryStore::open(workspace)?);
    let store2 = Arc::clone(&store);
    let key2 = key.clone();
    let value2 = value.clone();
    tokio::task::spawn_blocking(move || {
        store2.save(&key2, &value2, &tags)?;
        // Invalidate cached embedding so it gets re-computed on next semantic search.
        let _ = store2.delete_embedding(&key2);
        Ok::<_, anyhow::Error>(())
    })
    .await??;

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
    let args: RecallMemoryArgs = serde_json::from_value(args)?;

    if args.storage_mode == StorageMode::Curated {
        let store = crate::memory::curated::CuratedStore::open(workspace)?;
        let entries = store.list(args.target)?;
        let rendered = store.render(args.target)?;
        let items: Vec<Value> = entries
            .iter()
            .map(|entry| {
                serde_json::json!({
                    "key": entry.key,
                    "value": entry.value,
                })
            })
            .collect();

        return Ok(serde_json::json!({
            "storage_mode": "curated",
            "target": args.target.as_str(),
            "memories": items,
            "content": rendered,
        }));
    }

    let query = args.query.unwrap_or_default().trim().to_string();
    let tag = args.tag.and_then(|tag| {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    let limit = args.limit.unwrap_or(10);
    let explicit_mode = args.mode;

    let store = Arc::new(crate::memory::MemoryStore::open(workspace)?);

    // Determine effective mode: if the caller didn't specify, auto-detect
    // embedding availability and prefer hybrid search when possible.
    let mode = match explicit_mode.as_deref() {
        Some("semantic") => "semantic",
        Some("text") => "text",
        Some("hybrid") => "hybrid",
        _ => {
            // Auto-detect: prefer hybrid when embeddings are available.
            if query.is_empty() {
                "text"
            } else if has_embedding_provider() {
                "hybrid"
            } else {
                "text"
            }
        }
    };

    let results = match mode {
        "hybrid" => {
            // Try hybrid (BM25 + vector RRF), fall back gracefully.
            // First ensure embeddings exist (backfill if needed).
            if let Err(e) = backfill_embeddings(&store, &query).await {
                tracing::debug!(error = %e, "embedding backfill failed, hybrid will degrade to BM25");
            }
            let s = Arc::clone(&store);
            let q = query.clone();
            let t = tag.clone();
            tokio::task::spawn_blocking(move || s.search_hybrid(&q, t.as_deref(), limit)).await??
        }
        "semantic" => match recall_semantic(&store, &query, tag.as_deref(), limit).await {
            Ok(r) => r,
            Err(e) => {
                tracing::debug!(error = %e, "semantic recall failed, falling back to text search");
                let s = Arc::clone(&store);
                let q = query.clone();
                let t = tag.clone();
                tokio::task::spawn_blocking(move || s.search(&q, t.as_deref(), limit)).await??
            }
        },
        _ => {
            let s = Arc::clone(&store);
            let q = query.clone();
            let t = tag.clone();
            tokio::task::spawn_blocking(move || s.search(&q, t.as_deref(), limit)).await??
        }
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
    match crate::models::get_global_providers() {
        Some(pm) => pm.provider_count() > 0,
        None => false,
    }
}

/// Helper: semantic recall via embedding provider.
async fn recall_semantic(
    store: &Arc<crate::memory::MemoryStore>,
    query: &str,
    tag: Option<&str>,
    limit: usize,
) -> anyhow::Result<Vec<crate::memory::MemoryEntry>> {
    if query.is_empty() {
        anyhow::bail!("semantic recall requires a non-empty query");
    }

    let pm = crate::models::get_global_providers()
        .ok_or_else(|| anyhow::anyhow!("no providers initialised — cannot embed"))?;

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
    let s = Arc::clone(store);
    let missing = tokio::task::spawn_blocking(move || s.keys_without_embeddings()).await??;
    if !missing.is_empty() {
        let s = Arc::clone(store);
        let entries = tokio::task::spawn_blocking(move || s.search("", None, 10000)).await??;
        let texts_to_embed: Vec<(String, String)> = entries
            .iter()
            .filter(|e| missing.iter().any(|k| k == &e.key))
            .map(|e| (e.key.clone(), e.value.clone()))
            .collect();

        if !texts_to_embed.is_empty() {
            let text_refs: Vec<&str> = texts_to_embed.iter().map(|(_, v)| v.as_str()).collect();
            if let Ok(Some(vecs)) = pm.embed(&text_refs).await {
                let s = Arc::clone(store);
                let pairs: Vec<(String, Vec<f32>)> = texts_to_embed
                    .iter()
                    .map(|(k, _)| k.clone())
                    .zip(vecs.into_iter())
                    .collect();
                tokio::task::spawn_blocking(move || {
                    for (key, vec) in &pairs {
                        let _ = s.save_embedding(key, vec);
                    }
                })
                .await?;
            }
        }
    }

    let s = Arc::clone(store);
    let tag_owned = tag.map(String::from);
    tokio::task::spawn_blocking(move || s.search_semantic(&query_emb, tag_owned.as_deref(), limit))
        .await?
}

/// Backfill missing embeddings for memories that don't have them yet.
/// Called before hybrid search to ensure vector results are available.
async fn backfill_embeddings(
    store: &Arc<crate::memory::MemoryStore>,
    _query: &str,
) -> anyhow::Result<()> {
    let pm =
        crate::models::get_global_providers().ok_or_else(|| anyhow::anyhow!("no providers"))?;

    let s = Arc::clone(store);
    let missing = tokio::task::spawn_blocking(move || s.keys_without_embeddings()).await??;
    if missing.is_empty() {
        return Ok(());
    }

    let s = Arc::clone(store);
    let entries = tokio::task::spawn_blocking(move || s.search("", None, 10000)).await??;
    let texts_to_embed: Vec<(String, String)> = entries
        .iter()
        .filter(|e| missing.iter().any(|k| k == &e.key))
        .map(|e| (e.key.clone(), e.value.clone()))
        .collect();

    if texts_to_embed.is_empty() {
        return Ok(());
    }

    // Batch in chunks of 100 to avoid huge payloads.
    for chunk in texts_to_embed.chunks(100) {
        let text_refs: Vec<&str> = chunk.iter().map(|(_, v)| v.as_str()).collect();
        if let Ok(Some(vecs)) = pm.embed(&text_refs).await {
            let s = Arc::clone(store);
            let pairs: Vec<(String, Vec<f32>)> = chunk
                .iter()
                .map(|(k, _)| k.clone())
                .zip(vecs.into_iter())
                .collect();
            tokio::task::spawn_blocking(move || {
                for (key, vec) in &pairs {
                    let _ = s.save_embedding(key, vec);
                }
            })
            .await?;
        }
    }
    Ok(())
}

/// `forget_memory` tool — delete a memory entry by key.
pub async fn forget_memory(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: ForgetMemoryArgs = serde_json::from_value(args)?;
    let key = normalize_optional_key(args.key, "key")?
        .ok_or_else(|| anyhow::anyhow!("forget_memory requires a 'key' string"))?;

    if args.storage_mode == StorageMode::Curated {
        let store = crate::memory::curated::CuratedStore::open(workspace)?;
        let deleted = store.forget(args.target, &key)?;

        return Ok(serde_json::json!({
            "status": if deleted { "deleted" } else { "not_found" },
            "storage_mode": "curated",
            "target": args.target.as_str(),
            "key": key,
        }));
    }

    let store = Arc::new(crate::memory::MemoryStore::open(workspace)?);
    let key2 = key.clone();
    let deleted = tokio::task::spawn_blocking(move || {
        let deleted = store.forget(&key2)?;
        let _ = store.delete_embedding(&key2);
        Ok::<_, anyhow::Error>(deleted)
    })
    .await??;

    Ok(serde_json::json!({
        "status": if deleted { "deleted" } else { "not_found" },
        "key": key,
    }))
}

pub async fn curated_memory(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: CuratedMemoryCompatArgs = serde_json::from_value(args)?;
    let operation = args
        .operation
        .or(args.action)
        .unwrap_or_else(|| "save".to_string())
        .trim()
        .to_ascii_lowercase();
    let target = args.target.unwrap_or_default();

    match operation.as_str() {
        "save" | "set" | "add" => {
            save_memory(
                workspace,
                serde_json::json!({
                    "storage_mode": "curated",
                    "target": target,
                    "key": args.key,
                    "value": args.value,
                }),
            )
            .await
        }
        "recall" | "list" | "get" | "read" => {
            recall_memory(
                workspace,
                serde_json::json!({
                    "storage_mode": "curated",
                    "target": target,
                }),
            )
            .await
        }
        "forget" | "delete" | "remove" => {
            forget_memory(
                workspace,
                serde_json::json!({
                    "storage_mode": "curated",
                    "target": target,
                    "key": args.key,
                }),
            )
            .await
        }
        other => anyhow::bail!("curated_memory: unsupported operation '{other}'"),
    }
}

/// Register memory tools in the global tool registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "save_memory".into(),
        description: "Save memory. Default storage_mode is persistent SQLite memory; use storage_mode='curated' for always-in-prompt curated MEMORY.md / USER.md entries.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Short identifier for this memory. Required for persistent storage; optional metadata for curated storage."
                },
                "value": {
                    "type": "string",
                    "description": "The information to remember"
                },
                "tags": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional tags for categorisation in persistent storage"
                },
                "storage_mode": {
                    "type": "string",
                    "enum": ["persistent", "curated"],
                    "description": "Storage backend. Defaults to 'persistent'. Use 'curated' to write to MEMORY.md or USER.md instead of memory.db."
                },
                "target": {
                    "type": "string",
                    "enum": ["memory", "user"],
                    "description": "Curated target file. Defaults to 'memory'. Ignored for persistent storage."
                }
            },
            "required": ["value"],
            "additionalProperties": false
        }),
    });

    register_tool(ToolMeta {
        name: "recall_memory".into(),
        description: "Recall memory. Default storage_mode is persistent SQLite memory with text/semantic recall; use storage_mode='curated' to read curated MEMORY.md / USER.md entries.".into(),
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
                    "enum": ["text", "semantic", "hybrid"],
                    "description": "Search mode: 'hybrid' (default, BM25 + vector fusion), 'semantic' (embedding only), or 'text' (keyword only)"
                },
                "storage_mode": {
                    "type": "string",
                    "enum": ["persistent", "curated"],
                    "description": "Storage backend. Defaults to 'persistent'. Use 'curated' to read curated MEMORY.md or USER.md entries."
                },
                "target": {
                    "type": "string",
                    "enum": ["memory", "user"],
                    "description": "Curated target file. Defaults to 'memory'. Ignored for persistent storage."
                }
            },
            "additionalProperties": false
        }),
    });

    register_tool(ToolMeta {
        name: "forget_memory".into(),
        description: "Delete memory. Default storage_mode is persistent SQLite memory by key; use storage_mode='curated' to remove a curated MEMORY.md / USER.md entry.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "The key of the memory entry to delete"
                },
                "storage_mode": {
                    "type": "string",
                    "enum": ["persistent", "curated"],
                    "description": "Storage backend. Defaults to 'persistent'. Use 'curated' to remove from MEMORY.md or USER.md."
                },
                "target": {
                    "type": "string",
                    "enum": ["memory", "user"],
                    "description": "Curated target file. Defaults to 'memory'. Ignored for persistent storage."
                }
            },
            "required": ["key"],
            "additionalProperties": false
        }),
    });
}
