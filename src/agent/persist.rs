use tracing::{debug, warn};

use crate::comm::IncomingMessage;
use crate::models::ChatMessage;
use crate::session::Exchange;

use super::types::{epoch_millis, Agent, TurnReceipt};

impl Agent {
    /// Persist a batch of tool-loop messages (assistant tool_calls +
    /// tool results) so they survive in session history.
    pub async fn persist_tool_messages(&self, messages: &[ChatMessage]) {
        let Some(ref session_id) = self.current_session else {
            return;
        };
        let ts_ms = epoch_millis();
        let exchanges: Vec<Exchange> = messages
            .iter()
            .filter(|m| m.is_tool() || (m.is_assistant() && m.tool_calls.is_some()))
            .map(|m| Exchange {
                timestamp: ts_ms,
                role: m.role.clone(),
                content: m.content.clone(),
                metadata: None,
                tool_calls: m.tool_calls.clone(),
                tool_call_id: m.tool_call_id.clone(),
                images: m.images.clone(),
            })
            .collect();

        if let Some(ref db) = self.db {
            if let Err(e) = db.append_exchanges(session_id, &exchanges) {
                warn!(error = %e, count = exchanges.len(), "failed to persist tool messages to db");
            }
        } else {
            tracing::warn!("no database available — skipping persist");
        }
    }

    /// Persist just the user message to the session.
    /// Called at the start of a turn, before tool loop execution.
    pub async fn persist_user_message(&self, msg: &IncomingMessage) -> anyhow::Result<()> {
        let ts_ms = epoch_millis();

        let user_exchange = Exchange {
            timestamp: ts_ms,
            role: "user".into(),
            content: msg.content.clone(),
            metadata: Some(serde_json::json!({
                "author": msg.author,
                "channel": msg.channel,
            })),
            tool_calls: None,
            tool_call_id: None,
            images: msg.images.clone(),
        };

        if let Some(ref session_id) = self.current_session {
            if let Some(ref db) = self.db {
                db.append_exchange(session_id, &user_exchange)?;
            } else {
                tracing::warn!("no database available — skipping persist");
            }
        }

        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "session_message",
            "agent": self.id,
            "session": self.current_session,
            "role": "user",
            "content": msg.content,
            "timestamp": ts_ms
        }));

        Ok(())
    }

    /// Persist just the final assistant reply to the session.
    /// Called after the tool loop completes.
    pub async fn persist_assistant_reply(&self, reply: &str) -> anyhow::Result<()> {
        let ts_ms = epoch_millis();

        let assistant_exchange = Exchange {
            timestamp: ts_ms,
            role: "assistant".into(),
            content: reply.to_string(),
            metadata: None,
            tool_calls: None,
            tool_call_id: None,
            images: Vec::new(),
        };

        if let Some(ref session_id) = self.current_session {
            if let Some(ref db) = self.db {
                db.append_exchange(session_id, &assistant_exchange)?;
            } else {
                tracing::warn!("no database available — skipping persist");
            }
        } else {
            warn!("persist_assistant_reply called with no current session — skipping");
        }

        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "session_message",
            "agent": self.id,
            "session": self.current_session,
            "role": "assistant",
            "content": reply,
            "timestamp": ts_ms
        }));

        Ok(())
    }

    pub async fn persist_receipt(&self, receipt: &TurnReceipt) {
        if let Some(ref db) = self.db {
            if let Err(e) = db.insert_receipt(receipt) {
                warn!(error = %e, "failed to persist receipt to db");
            } else {
                debug!("turn receipt persisted to db");
            }
        } else {
            tracing::warn!("no database available — skipping persist");
        }
    }
}
