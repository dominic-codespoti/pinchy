//! `send_message` tool — send a rich (or plain) message to a channel.
//!
//! Allows the agent to proactively push content to Discord, the gateway,
//! or any registered connector.  Supports embeds, sections, colours,
//! images, file attachments, and per-platform `channel_hints`.

use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

use crate::comm::{RichMessage, Section};
use crate::tools::{register_tool, ToolMeta};

/// Maximum attachment size (8 MiB — matches Discord's default upload limit
/// and keeps memory usage sane on a Pi).
const MAX_ATTACHMENT_BYTES: u64 = 8 * 1024 * 1024;

/// Execute the `send_message` tool.
pub async fn send_message(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let channel_id = match args["channel_id"].as_str() {
        Some(id) => id.to_string(),
        None => {
            let config_path = crate::pinchy_home().join("config.yaml");
            let cfg = crate::config::Config::load(&config_path).await?;
            cfg.channels
                .default_channel
                .map(|dc| dc.to_channel_string())
                .ok_or_else(|| anyhow::anyhow!(
                    "send_message requires 'channel_id' (string) or channels.default_channel in config"
                ))?
        }
    };

    // Build the RichMessage from args.
    let text = args["text"].as_str().map(String::from);
    let title = args["title"].as_str().map(String::from);
    let color = args["color"].as_str().map(String::from);
    let footer = args["footer"].as_str().map(String::from);
    let image_url = args["image_url"].as_str().map(String::from);

    let sections: Vec<Section> = args["sections"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    let name = v["name"].as_str()?.to_string();
                    let value = v["value"].as_str()?.to_string();
                    let inline = v["inline"].as_bool().unwrap_or(false);
                    Some(Section {
                        name,
                        value,
                        inline,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    // Validate that at least some content is present *before* doing file I/O.
    let has_attachment_path = args["attachment_path"].as_str().is_some();
    if text.is_none()
        && title.is_none()
        && sections.is_empty()
        && image_url.is_none()
        && !has_attachment_path
    {
        anyhow::bail!(
            "send_message requires at least one of: text, title, sections, image_url, or attachment_path"
        );
    }

    // Attachment: read file from workspace (sandboxed).
    let attachment = if let Some(rel_path) = args["attachment_path"].as_str() {
        let full = workspace.join(rel_path);

        // Sandbox check: resolved path must be under workspace.
        let canonical_ws = workspace
            .canonicalize()
            .unwrap_or_else(|_| workspace.to_path_buf());
        let canonical_file = full
            .canonicalize()
            .map_err(|e| anyhow::anyhow!("attachment not found: {rel_path} ({e})"))?;
        if !canonical_file.starts_with(&canonical_ws) {
            anyhow::bail!("attachment_path escapes workspace: {rel_path}");
        }

        // Size check — prevent OOM on large files.
        let meta = tokio::fs::metadata(&canonical_file).await.map_err(|e| {
            anyhow::anyhow!("cannot stat attachment {}: {e}", canonical_file.display())
        })?;
        if meta.len() > MAX_ATTACHMENT_BYTES {
            anyhow::bail!(
                "attachment too large ({:.1} MiB, max {} MiB): {rel_path}",
                meta.len() as f64 / (1024.0 * 1024.0),
                MAX_ATTACHMENT_BYTES / (1024 * 1024),
            );
        }

        let bytes = tokio::fs::read(&canonical_file).await.map_err(|e| {
            anyhow::anyhow!("failed to read attachment {}: {e}", canonical_file.display())
        })?;
        let filename = canonical_file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "attachment".to_string());
        Some((filename, bytes))
    } else {
        None
    };

    // channel_hints: pass through as-is.
    let channel_hints: HashMap<String, Value> = args["channel_hints"]
        .as_object()
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        })
        .unwrap_or_default();

    let rich = RichMessage {
        text,
        title,
        sections,
        color,
        footer,
        image_url,
        attachment,
        channel_hints,
    };

    crate::comm::send_rich_reply(&channel_id, rich).await?;

    Ok(serde_json::json!({
        "status": "sent",
        "channel": channel_id,
    }))
}

pub fn register() {
    register_tool(ToolMeta {
        name: "send_message".into(),
        description:
            "Send a rich message (embed with title, sections, colour, images, attachments) to a channel. Works with Discord, gateway, and other connectors."
                .into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "channel_id": {
                    "type": "string",
                    "description": "Target channel identifier (e.g. Discord numeric channel id, or 'gateway:...'). Optional — defaults to channels.default_channel from config if omitted."
                },
                "text": {
                    "type": "string",
                    "description": "Main body text of the message"
                },
                "title": {
                    "type": "string",
                    "description": "Embed title / subject line"
                },
                "sections": {
                    "type": "array",
                    "description": "Structured fields rendered as embed fields",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string" },
                            "value": { "type": "string" },
                            "inline": { "type": "boolean" }
                        },
                        "required": ["name", "value"]
                    }
                },
                "color": {
                    "type": "string",
                    "description": "Accent colour as #RRGGBB hex (e.g. '#FF5733')"
                },
                "footer": {
                    "type": "string",
                    "description": "Small footer line"
                },
                "image_url": {
                    "type": "string",
                    "description": "URL of an image to embed"
                },
                "attachment_path": {
                    "type": "string",
                    "description": "Relative path (within workspace) to a file to attach"
                },
                "channel_hints": {
                    "type": "object",
                    "description": "Per-platform overrides (e.g. { \"discord\": { \"reactions\": [\"👍\"] } })"
                }
            },
            "required": []
        }),
    });
}
