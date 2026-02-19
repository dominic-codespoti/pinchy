//! Generic communication layer.
//!
//! Provides [`IncomingMessage`] -- a channel-agnostic envelope that any
//! connector (Discord, HTTP, CLI, ...) can produce -- and a process-wide
//! broadcast channel that the agent runtime subscribes to.
//!
//! The global channel is initialised lazily via `once_cell::sync::Lazy`.
//! Connectors call `sender()` to push messages; the agent runtime calls
//! `subscribe()` to obtain an independent receiver.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use tokio::sync::{broadcast, RwLock};

// ---------------------------------------------------------------------------
// RichMessage — platform-agnostic outbound content model
// ---------------------------------------------------------------------------

/// A section (field) within a rich message — rendered as embed fields on
/// Discord, key-value pairs in JSON for the gateway, etc.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Section {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub inline: bool,
}

/// Platform-agnostic rich outbound message.  Connectors translate this into
/// their native format (Discord embed, gateway JSON, plain text, …).
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct RichMessage {
    /// Main body text (always rendered, even on dumb connectors).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Embed title / subject line.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Structured sections rendered as embed fields / key-value pairs.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sections: Vec<Section>,
    /// Accent colour as a `#RRGGBB` hex string (Discord: embed sidebar).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Small footer line.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    /// Image URL to embed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    /// File attachment: `(filename, raw_bytes)`.
    #[serde(skip)]
    pub attachment: Option<(String, Vec<u8>)>,
    /// Escape-hatch: per-platform overrides.  Keys are connector names
    /// (e.g. `"discord"`), values are arbitrary JSON consumed by that
    /// connector only.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub channel_hints: HashMap<String, serde_json::Value>,
}

impl RichMessage {
    /// Flatten to a plain-text representation for connectors that don't
    /// support rich formatting.
    pub fn as_plain_text(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if let Some(t) = &self.title {
            parts.push(format!("**{}**", t));
        }
        if let Some(t) = &self.text {
            parts.push(t.clone());
        }
        for s in &self.sections {
            parts.push(format!("• {}: {}", s.name, s.value));
        }
        if let Some(f) = &self.footer {
            parts.push(format!("_{}_", f));
        }
        if parts.is_empty() {
            "(empty message)".to_string()
        } else {
            parts.join("\n")
        }
    }
}

// ---------------------------------------------------------------------------
// IncomingMessage
// ---------------------------------------------------------------------------

/// A channel-agnostic inbound message.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IncomingMessage {
    /// Target agent id, if determinable from context (e.g. channel mapping).
    pub agent_id: Option<String>,
    /// Originating channel identifier (e.g. Discord channel id).
    pub channel: String,
    /// Display name of the message author.
    pub author: String,
    /// Raw message content / text.
    pub content: String,
    /// Unix-epoch timestamp (seconds).
    pub timestamp: i64,
    /// Optional session override.  When set, the agent turn uses this
    /// session id instead of the agent's current session, without
    /// modifying `CURRENT_SESSION` on disk.  Used by cron jobs to run
    /// each fire in an isolated session.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Global broadcast channel
// ---------------------------------------------------------------------------

/// Capacity of the in-process broadcast channel.
const CHANNEL_CAPACITY: usize = 256;

/// Global broadcast sender, created once on first access.
static SENDER: Lazy<broadcast::Sender<IncomingMessage>> = Lazy::new(|| {
    let (tx, _rx) = broadcast::channel(CHANNEL_CAPACITY);
    tx
});

/// Obtain a clone of the global broadcast sender.
///
/// Call `sender().send(msg)` from any connector (Discord, web, etc.)
/// to push a message onto the bus.
pub fn sender() -> broadcast::Sender<IncomingMessage> {
    SENDER.clone()
}

/// Create a new receiver subscribed to the global bus.
///
/// Each call returns an independent `Receiver` that will see all
/// messages sent **after** subscription.
pub fn subscribe() -> broadcast::Receiver<IncomingMessage> {
    SENDER.subscribe()
}

/// Create a one-shot `(sender, receiver)` pair (useful for tests or
/// isolated pipelines that don't need the global bus).
pub fn message_bus() -> (
    broadcast::Sender<IncomingMessage>,
    broadcast::Receiver<IncomingMessage>,
) {
    broadcast::channel(CHANNEL_CAPACITY)
}

// ---------------------------------------------------------------------------
// ChannelConnector trait + global registry
// ---------------------------------------------------------------------------

/// A channel connector can send outbound messages to a specific platform.
///
/// Connectors are registered at startup; the agent runtime looks up the
/// matching connector by prefix when it needs to deliver a reply.
#[async_trait]
pub trait ChannelConnector: Send + Sync + 'static {
    /// A short identifier used to match against incoming `channel` values.
    /// E.g. `"discord"` matches channels that are numeric Discord channel ids,
    /// `"gateway"` matches channels prefixed with `"gateway:"`.
    fn name(&self) -> &str;

    /// Return true if this connector should handle the given channel string.
    fn matches(&self, channel: &str) -> bool;

    /// Deliver `text` to the specified channel.
    async fn send(&self, channel: &str, text: &str) -> anyhow::Result<()>;

    /// Deliver a [`RichMessage`] to the specified channel.
    ///
    /// Takes ownership so connectors can move attachment bytes into the
    /// platform SDK without cloning.  The default implementation flattens
    /// to plain text and delegates to [`send`].
    async fn send_rich(&self, channel: &str, msg: RichMessage) -> anyhow::Result<()> {
        self.send(channel, &msg.as_plain_text()).await
    }
}

/// Process-wide registry of channel connectors.
static CONNECTORS: Lazy<RwLock<HashMap<String, Arc<dyn ChannelConnector>>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// Register a channel connector. Replaces any previous connector with the
/// same `name()`.
pub async fn register_connector(connector: Arc<dyn ChannelConnector>) {
    let name = connector.name().to_string();
    CONNECTORS.write().await.insert(name, connector);
}

/// Send a reply through whichever connector matches `channel`.
///
/// Tries each registered connector's [`ChannelConnector::matches`] method.
/// Returns `Ok(())` if a connector handled it, or an error if none matched.
pub async fn send_reply(channel: &str, text: &str) -> anyhow::Result<()> {
    let connectors = CONNECTORS.read().await;
    for connector in connectors.values() {
        if connector.matches(channel) {
            return connector.send(channel, text).await;
        }
    }
    tracing::debug!(channel = %channel, "no connector matched channel — reply dropped");
    Ok(())
}

/// Send a rich message through whichever connector matches `channel`.
///
/// Takes ownership of the message so connectors can move attachment bytes
/// without cloning.
pub async fn send_rich_reply(channel: &str, msg: RichMessage) -> anyhow::Result<()> {
    let connectors = CONNECTORS.read().await;
    for connector in connectors.values() {
        if connector.matches(channel) {
            return connector.send_rich(channel, msg).await;
        }
    }
    tracing::debug!(channel = %channel, "no connector matched channel — rich reply dropped");
    Ok(())
}
