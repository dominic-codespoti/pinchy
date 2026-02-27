use anyhow::Context as _;
use tokio::fs;
use tracing::{debug, warn};

use crate::comm::IncomingMessage;
use crate::session::{Exchange, SessionStore};

use super::types::{epoch_millis, epoch_secs, Agent, TurnReceipt};

impl Agent {
    pub async fn persist_exchange(&self, msg: &IncomingMessage, reply: &str) -> anyhow::Result<()> {
        let ts_ms = epoch_millis();
        let ts = epoch_secs();

        let user_exchange = Exchange {
            timestamp: ts_ms,
            role: "user".into(),
            content: msg.content.clone(),
            metadata: Some(serde_json::json!({
                "author": msg.author,
                "channel": msg.channel,
            })),
        };
        let assistant_exchange = Exchange {
            timestamp: ts_ms,
            role: "assistant".into(),
            content: reply.to_string(),
            metadata: None,
        };

        if let Some(ref session_id) = self.current_session {
            SessionStore::append(&self.workspace, session_id, &user_exchange).await?;
            SessionStore::append(&self.workspace, session_id, &assistant_exchange).await?;
        } else {
            let sessions_dir = self.workspace.join("sessions");
            fs::create_dir_all(&sessions_dir)
                .await
                .context("create sessions dir")?;

            let path = sessions_dir.join(format!("{ts}.jsonl"));
            let user_line = serde_json::to_string(&user_exchange)?;
            let assistant_line = serde_json::to_string(&assistant_exchange)?;

            use tokio::io::AsyncWriteExt;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .await
                .with_context(|| format!("open session file {}", path.display()))?;

            file.write_all(user_line.as_bytes()).await?;
            file.write_all(b"\n").await?;
            file.write_all(assistant_line.as_bytes()).await?;
            file.write_all(b"\n").await?;

            debug!(path = %path.display(), "session exchange persisted");
        }

        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "session_message",
            "agent": self.id,
            "session": self.current_session,
            "role": "user",
            "content": msg.content,
            "timestamp": ts_ms
        }));
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
        let receipts_dir = self.workspace.join("sessions");
        if fs::create_dir_all(&receipts_dir).await.is_err() {
            return;
        }

        let filename = match &self.current_session {
            Some(sid) => format!("{sid}.receipts.jsonl"),
            None => "receipts.jsonl".into(),
        };
        let path = receipts_dir.join(filename);

        let line = match serde_json::to_string(receipt) {
            Ok(l) => l,
            Err(e) => {
                warn!(error = %e, "failed to serialise turn receipt");
                return;
            }
        };

        use tokio::io::AsyncWriteExt;
        match fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
        {
            Ok(mut f) => {
                let _ = f.write_all(line.as_bytes()).await;
                let _ = f.write_all(b"\n").await;
                debug!(path = %path.display(), "turn receipt persisted");
            }
            Err(e) => {
                warn!(error = %e, "failed to open receipts file");
            }
        }
    }
}
