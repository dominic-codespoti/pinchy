//! Live log broadcasting via a tracing [`Layer`].
//!
//! [`BroadcastLayer`] captures each tracing event, formats it as a single
//! JSON line, and sends it through a [`broadcast::Sender`].  The gateway
//! exposes a `/ws/logs` endpoint that streams these lines to WebSocket
//! clients.

use std::fmt;
use std::sync::OnceLock;
use tokio::sync::broadcast;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

// ---------------------------------------------------------------------------
// Global broadcast channel
// ---------------------------------------------------------------------------

static LOGS_TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

/// Initialise the global log broadcast channel and return the sender.
///
/// Subsequent calls return a clone of the original sender.
pub fn init_broadcast() -> broadcast::Sender<String> {
    LOGS_TX
        .get_or_init(|| {
            let (tx, _) = broadcast::channel::<String>(512);
            tx
        })
        .clone()
}

/// Obtain a receiver for the log broadcast stream.
///
/// Returns `None` if [`init_broadcast`] has not been called yet.
pub fn subscribe() -> Option<broadcast::Receiver<String>> {
    LOGS_TX.get().map(|tx| tx.subscribe())
}

// ---------------------------------------------------------------------------
// Tracing layer
// ---------------------------------------------------------------------------

/// A [`tracing_subscriber::Layer`] that serialises events as JSON and
/// broadcasts them to all subscribers of the global log channel.
pub struct BroadcastLayer {
    tx: broadcast::Sender<String>,
}

impl BroadcastLayer {
    pub fn new(tx: broadcast::Sender<String>) -> Self {
        Self { tx }
    }
}

impl<S: Subscriber> Layer<S> for BroadcastLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        let level = meta.level();
        let target = meta.target();

        let mut visitor = JsonVisitor::default();
        event.record(&mut visitor);

        let message = visitor.message.unwrap_or_default();

        // Build a compact JSON payload.
        let json = serde_json::json!({
            "type": "log",
            "level": level_str(level),
            "target": target,
            "message": message,
            "fields": visitor.fields,
            "ts": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        });

        if let Ok(line) = serde_json::to_string(&json) {
            // Best-effort; drop if no receivers.
            let _ = self.tx.send(line);
        }
    }
}

fn level_str(level: &Level) -> &'static str {
    match *level {
        Level::ERROR => "ERROR",
        Level::WARN => "WARN",
        Level::INFO => "INFO",
        Level::DEBUG => "DEBUG",
        Level::TRACE => "TRACE",
    }
}

// ---------------------------------------------------------------------------
// Field visitor
// ---------------------------------------------------------------------------

#[derive(Default)]
struct JsonVisitor {
    message: Option<String>,
    fields: serde_json::Map<String, serde_json::Value>,
}

impl Visit for JsonVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        let val = format!("{value:?}");
        if field.name() == "message" {
            self.message = Some(val);
        } else {
            self.fields
                .insert(field.name().to_string(), serde_json::Value::String(val));
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = Some(value.to_string());
        } else {
            self.fields.insert(
                field.name().to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields.insert(
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        );
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields.insert(
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        );
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields
            .insert(field.name().to_string(), serde_json::Value::Bool(value));
    }
}
