//! Persistent memory tool — cross-session knowledge store.
//!
//! Storage: `agents/<id>/workspace/memory.db` (SQLite + FTS5)
//!
//! Tools exposed to the agent:
//! - `save_memory { key, value, tags? }` — upsert a memory entry
//! - `recall_memory { query?, tag?, limit? }` — ranked full-text search
//! - `forget_memory { key }` — delete a memory entry

use std::path::Path;
use std::sync::Arc;

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
    let query = args["query"].as_str().unwrap_or("").to_string();
    let tag = args["tag"].as_str().map(String::from);
    let limit = args["limit"].as_u64().unwrap_or(10) as usize;
    let explicit_mode = args["mode"].as_str().map(String::from);

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
    let key = args["key"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("forget_memory requires a 'key' string"))?
        .to_string();

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
                    "enum": ["text", "semantic", "hybrid"],
                    "description": "Search mode: 'hybrid' (default, BM25 + vector fusion), 'semantic' (embedding only), or 'text' (keyword only)"
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
