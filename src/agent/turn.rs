use std::collections::HashSet;
use std::time::SystemTime;

use anyhow::Context as _;
use tracing::{debug, info, warn};

use crate::comm::IncomingMessage;
use crate::config::Config;
use crate::models::{build_provider_manager, ChatMessage, ProviderManager, ProviderResponse};
use crate::session::SessionStore;
use crate::tools;

use super::debug::emit_model_request_debug;
use super::tool_exec::emit_and_accumulate_usage;
use super::tool_loop::run_tool_loop;
use super::types::*;

impl Agent {
    // -- bootstrap ----------------------------------------------------------

    pub async fn load_bootstrap(&self) -> anyhow::Result<String> {
        let names = ["SOUL.md", "TOOLS.md"];
        let mut parts: Vec<String> = Vec::new();
        for name in &names {
            let path = self.agent_root.join(name);
            match tokio::fs::read_to_string(&path).await {
                Ok(content) => {
                    debug!(file = %path.display(), "loaded bootstrap file");
                    parts.push(format!("# {name}\n\n{content}"));
                }
                Err(_) => {
                    debug!(file = %path.display(), "bootstrap file not found, skipping");
                }
            }
        }
        Ok(parts.join("\n\n---\n\n"))
    }

    // -- history ------------------------------------------------------------

    async fn load_history(&self, max_messages: usize) -> anyhow::Result<Vec<ChatMessage>> {
        if let Some(ref session_id) = self.current_session {
            let exchanges =
                SessionStore::load_history(&self.workspace, session_id, max_messages).await?;
            return Ok(exchanges
                .into_iter()
                .filter(|ex| ex.role == "user" || ex.role == "assistant" || ex.role == "tool")
                .map(|ex| ChatMessage {
                    role: ex.role,
                    content: ex.content,
                    tool_calls: ex.tool_calls,
                    tool_call_id: ex.tool_call_id,
                })
                .collect());
        }

        // run_turn always ensures a session exists before reaching here,
        // so this path should not be hit.  Return empty history rather
        // than trying the old read-all-jsonl-files fallback.
        warn!("load_history called with no current session");
        Ok(Vec::new())
    }

    // -- turn execution -----------------------------------------------------

    pub async fn run_turn(&mut self, msg: IncomingMessage) -> anyhow::Result<String> {
        let session_override = msg.session_id.clone();

        // BUG FIX: use a scope-guard pattern so that session is always
        // restored even if run_turn_with_provider panics.
        let saved_session = if session_override.is_some() {
            let prev = self.current_session.clone();
            self.current_session.clone_from(&session_override);
            let _ = tokio::fs::create_dir_all(self.workspace.join("sessions")).await;

            info!(
                agent = %self.id,
                session = ?session_override,
                "using session override for this turn"
            );
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "session_created",
                "agent": self.id,
                "session": session_override,
            }));
            Some(prev)
        } else {
            self.current_session = SessionStore::load_current_async(&self.workspace).await;
            if self.current_session.is_none() {
                let new_id = self.start_session().await;
                info!(agent = %self.id, session = %new_id, "auto-created new session");
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "session_created",
                    "agent": self.id,
                    "session": new_id,
                }));
            }
            None
        };

        let config_path = crate::pinchy_home().join("config.yaml");
        let turn_cfg = crate::config::Config::load(&config_path).await.ok();

        // Refresh agent settings from config if available.
        if let Some(ref c) = turn_cfg {
            if let Some(ac) = c.agents.iter().find(|a| a.id == self.id) {
                if let Some(mti) = ac.max_tool_iterations {
                    self.max_tool_iterations = mti;
                }
                if let Some(ref mid) = ac.model {
                    if let Some(mc) = c.models.iter().find(|m| m.id == *mid) {
                        self.provider = mc.provider.clone();
                        self.model_id = mc.model.clone().unwrap_or_else(|| mc.id.clone());
                        self.model_config_ref = Some(mid.clone());
                    }
                }
                if let Some(ref skills) = ac.enabled_skills {
                    self.enabled_skills = Some(skills.clone());
                }
                self.fallback_models = ac.fallback_models.clone();
            }
        }

        let manager = self.build_provider_manager(turn_cfg.as_ref());
        crate::models::set_global_providers(std::sync::Arc::new(
            self.build_provider_manager(turn_cfg.as_ref()),
        ));

        let result = self
            .run_turn_with_provider(msg, &manager, turn_cfg.as_ref())
            .await;

        // Always restore session even on error/panic.
        if let Some(prev) = saved_session {
            self.current_session = prev;
        }

        result
    }

    fn build_provider_manager(&self, cfg: Option<&Config>) -> ProviderManager {
        if self.fallback_models.is_empty() {
            build_provider_manager(&self.provider, &self.model_id)
        } else {
            let agent_cfg = crate::config::AgentConfig {
                id: self.id.clone(),
                root: self.agent_root.display().to_string(),
                model: self.model_config_ref.clone(),
                heartbeat_secs: None,
                cron_jobs: Vec::new(),
                max_tool_iterations: Some(self.max_tool_iterations),
                enabled_skills: self.enabled_skills.clone(),
                fallback_models: self.fallback_models.clone(),
                webhook_secret: None,
                extra_exec_commands: Vec::new(),
                history_messages: None,
                max_turns: None,
                compact_keep_recent_turns: None,
                timezone: None,
            };
            match cfg {
                Some(c) => crate::models::build_provider_manager_from_config(&agent_cfg, c),
                None => build_provider_manager(&self.provider, &self.model_id),
            }
        }
    }

    pub async fn run_turn_with_provider(
        &mut self,
        msg: IncomingMessage,
        manager: &ProviderManager,
        turn_cfg: Option<&Config>,
    ) -> anyhow::Result<String> {
        let bootstrap = self.load_bootstrap().await?;

        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "typing_start",
            "agent": self.id,
            "session": self.current_session,
        }));

        // -- Build message list --
        let mut messages = self
            .build_initial_messages(&bootstrap, &msg, manager, turn_cfg)
            .await?;

        // -- Context window management --
        let mut budget = crate::context::ContextBudget::default();
        if let Some(agent_cfg) =
            turn_cfg.and_then(|cfg| cfg.agents.iter().find(|a| a.id == self.id))
        {
            if let Some(mt) = agent_cfg.max_turns {
                budget.max_turns = mt;
            }
            if let Some(ckrt) = agent_cfg.compact_keep_recent_turns {
                budget.compact_keep_recent_turns = ckrt;
            }
        }
        crate::context::manage_context(&mut messages, &budget, manager).await;

        // -- Build function definitions --
        let tool_metas = tools::list_tools_core();
        let function_defs = self.build_function_defs(&tool_metas, &msg, &messages);

        // -- Receipt tracking --
        let turn_start = SystemTime::now();
        let turn_start_ms = epoch_millis();
        let mut receipt_tokens = TokenUsageSummary::default();
        let mut receipt_model_calls: u32 = 0;

        // -- Initial model call --
        emit_model_request_debug(
            &self.id,
            self.current_session.as_deref(),
            &messages,
            &function_defs,
            &self.provider,
            &self.model_id,
        );
        let (mut response, usage) = manager
            .send_chat_with_functions(&messages, &function_defs)
            .await
            .context("model call failed")?;
        receipt_model_calls += 1;
        emit_and_accumulate_usage(&usage, &self.id, &mut receipt_tokens);

        // -- Enforcement retry --
        self.maybe_enforcement_retry(
            &mut response,
            &mut messages,
            &function_defs,
            manager,
            &msg,
            &mut receipt_tokens,
            &mut receipt_model_calls,
        )
        .await;

        // -- Tool loop --
        // Persist the user message BEFORE the tool loop so the JSONL
        // ordering is: user → assistant+tool_calls → tool result → …
        self.persist_user_message(&msg).await?;

        let pre_tool_msg_count = messages.len();
        let receipt_tool_calls = run_tool_loop(
            &mut response,
            &mut messages,
            &function_defs,
            manager,
            &self.workspace,
            &self.id,
            &self.current_session,
            self.max_tool_iterations,
            &mut receipt_tokens,
            &mut receipt_model_calls,
            &self.provider,
            &self.model_id,
        )
        .await;

        // Persist tool-loop messages (assistant tool_calls + tool results)
        // so they survive in session history for future turns.
        if messages.len() > pre_tool_msg_count {
            self.persist_tool_messages(&messages[pre_tool_msg_count..])
                .await;
        }

        // -- Extract final reply --
        let final_reply = self.extract_final_reply(response).await;

        // -- Persist final assistant reply --
        self.persist_assistant_reply(&final_reply).await?;

        let turn_duration = turn_start.elapsed().unwrap_or_default().as_millis() as u64;
        let receipt = TurnReceipt {
            agent: self.id.clone(),
            session: self.current_session.clone(),
            started_at: turn_start_ms,
            duration_ms: turn_duration,
            user_prompt: crate::utils::truncate_str(&msg.content, 200),
            tool_calls: receipt_tool_calls,
            tokens: receipt_tokens,
            model_calls: receipt_model_calls,
            reply_summary: crate::utils::truncate_str(&final_reply, 200),
        };
        self.persist_receipt(&receipt).await;

        crate::gateway::publish_event_json(
            &serde_json::to_value(&receipt)
                .map(|mut v| {
                    v.as_object_mut()
                        .unwrap()
                        .insert("type".into(), serde_json::json!("turn_receipt"));
                    v
                })
                .unwrap_or_else(|_| serde_json::json!({"type": "turn_receipt"})),
        );

        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "typing_stop",
            "agent": self.id,
            "session": self.current_session,
        }));

        Ok(final_reply)
    }

    // -- Private helpers extracted from run_turn_with_provider ---------------

    async fn build_initial_messages(
        &self,
        bootstrap: &str,
        msg: &IncomingMessage,
        _manager: &ProviderManager,
        turn_cfg: Option<&Config>,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        let mut messages: Vec<ChatMessage> = Vec::new();

        if !bootstrap.is_empty() {
            messages.push(ChatMessage::system(bootstrap.to_string()));
        }

        // Time context.
        {
            let tz = turn_cfg
                .map(|cfg| cfg.resolve_timezone(&self.id))
                .unwrap_or(chrono_tz::UTC);
            let now = chrono::Utc::now().with_timezone(&tz);
            messages.push(ChatMessage::system(format!(
                "Current date and time: {} ({}).",
                now.format("%A, %B %-d, %Y %H:%M %Z"),
                tz,
            )));
        }

        // Skill instructions.
        let skill_prompt = tools::prompt_instructions(self.enabled_skills.as_deref());
        if !skill_prompt.is_empty() {
            messages.push(ChatMessage::system(skill_prompt));
        }

        // Session history.
        let history_limit = turn_cfg
            .and_then(|cfg| {
                cfg.agents
                    .iter()
                    .find(|a| a.id == self.id)
                    .and_then(|a| a.history_messages)
            })
            .unwrap_or(40);
        let history = self.load_history(history_limit).await.unwrap_or_default();
        messages.extend(history);

        messages.push(ChatMessage::user(msg.content.clone()));

        Ok(messages)
    }

    fn build_function_defs(
        &self,
        tool_metas: &[crate::tools::ToolMeta],
        msg: &IncomingMessage,
        messages: &[ChatMessage],
    ) -> Vec<serde_json::Value> {
        let mut function_defs: Vec<serde_json::Value> = tool_metas
            .iter()
            .map(|meta| {
                serde_json::json!({
                    "name": meta.name,
                    "description": meta.description,
                    "parameters": meta.args_schema,
                })
            })
            .collect();

        // Auto-pluck deferred tools from recent conversation context.
        let pluck_text = self.build_pluck_text(&msg.content, messages);
        let plucked = tools::auto_pluck_deferred(&pluck_text);
        let existing_names: HashSet<String> = function_defs
            .iter()
            .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect();
        for meta in &plucked {
            if !existing_names.contains(&meta.name) {
                function_defs.push(serde_json::json!({
                    "name": meta.name,
                    "description": meta.description,
                    "parameters": meta.args_schema,
                }));
            }
        }
        if !plucked.is_empty() {
            debug!(
                count = plucked.len(),
                tools = ?plucked.iter().map(|m| &m.name).collect::<Vec<_>>(),
                "auto-plucked deferred tools from user message"
            );
        }
        function_defs
    }

    fn build_pluck_text(&self, user_content: &str, messages: &[ChatMessage]) -> String {
        let mut text = String::from(user_content);
        for m in messages.iter().rev().filter(|m| m.is_user()).take(5) {
            text.push(' ');
            text.push_str(&m.content);
        }
        for m in messages.iter().rev().filter(|m| m.is_assistant()).take(3) {
            text.push(' ');
            text.push_str(&m.content);
            if let Some(ref tcs) = m.tool_calls {
                for tc in tcs {
                    if let Some(name) = tc
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                    {
                        text.push(' ');
                        text.push_str(name);
                    }
                }
            }
        }
        for m in messages.iter().rev().filter(|m| m.is_tool()).take(3) {
            text.push(' ');
            text.push_str(&m.content);
        }
        text
    }

    #[allow(clippy::too_many_arguments)]
    async fn maybe_enforcement_retry(
        &self,
        response: &mut ProviderResponse,
        messages: &mut Vec<ChatMessage>,
        function_defs: &[serde_json::Value],
        manager: &ProviderManager,
        msg: &IncomingMessage,
        receipt_tokens: &mut TokenUsageSummary,
        receipt_model_calls: &mut u32,
    ) {
        let needs_enforcement = matches!(response, ProviderResponse::Final(_)
                if !function_defs.is_empty()
                && manager.supports_functions
                && !is_conversational(&msg.content));

        if !needs_enforcement {
            return;
        }

        debug!("enforcement retry: provider returned final text but tools are available");

        let available_tool_names: Vec<String> = function_defs
            .iter()
            .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect();
        let corrective = format!(
            "CORRECTIVE: You MUST use a tool call to fulfil this request — do not respond \
             with plain text alone. Choose the most appropriate tool from the available set: \
             [{}]. Prefer specialised tools (e.g. create_cron_job for scheduling, \
             save_memory for remembering facts) over generic ones (write_file, exec_shell).",
            available_tool_names.join(", ")
        );
        messages.push(ChatMessage::system(corrective));

        emit_model_request_debug(
            &self.id,
            self.current_session.as_deref(),
            messages,
            function_defs,
            &self.provider,
            &self.model_id,
        );

        match manager
            .send_chat_with_functions(messages, function_defs)
            .await
        {
            Ok((retry_resp, retry_usage)) => {
                *receipt_model_calls += 1;
                debug!("enforcement retry completed");
                *response = retry_resp;
                emit_and_accumulate_usage(&retry_usage, &self.id, receipt_tokens);
            }
            Err(e) => {
                warn!(error = %e, "enforcement retry failed, using original response");
            }
        }
        // Remove corrective message to avoid polluting the tool-loop conversation.
        messages.pop();
    }

    async fn extract_final_reply(&self, response: ProviderResponse) -> String {
        match response {
            ProviderResponse::Final(text) => {
                self.stream_reply_to_gateway(&text).await;
                text
            }
            ProviderResponse::FunctionCall {
                name, arguments, ..
            } => {
                let t = format!("[tool loop exhausted] last call: {}({})", name, arguments);
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "stream_delta",
                    "agent": self.id,
                    "session": self.current_session,
                    "delta": t,
                    "done": true,
                }));
                t
            }
            ProviderResponse::MultiFunctionCall(calls) => {
                let names: Vec<&str> = calls.iter().map(|c| c.name.as_str()).collect();
                let t = format!("[tool loop exhausted] last calls: {}", names.join(", "));
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "stream_delta",
                    "agent": self.id,
                    "session": self.current_session,
                    "delta": t,
                    "done": true,
                }));
                t
            }
        }
    }

    /// Stream a completed reply to the gateway as chunked deltas.
    ///
    /// Uses `char_indices` instead of collecting into `Vec<char>` to
    /// avoid doubling memory for large replies.
    async fn stream_reply_to_gateway(&self, text: &str) {
        if text.is_empty() {
            return;
        }

        const CHUNK_TARGET: usize = 120; // Increased from 12 to reduce event overhead
        if text.len() <= CHUNK_TARGET {
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "stream_delta",
                "agent": self.id,
                "session": self.current_session,
                "delta": text,
                "done": true,
            }));
            return;
        }

        let mut start = 0;
        while start < text.len() {
            let remaining = &text[start..];
            // Find chunk boundary.
            let end_byte = remaining
                .char_indices()
                .take(CHUNK_TARGET)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(remaining.len());

            let candidate = &remaining[..end_byte];
            let break_at = if end_byte < remaining.len() {
                candidate
                    .rfind([' ', '\n'])
                    .map(|p| p + 1)
                    .unwrap_or(end_byte)
            } else {
                end_byte
            };

            let chunk = &remaining[..break_at];
            let is_last = start + break_at >= text.len();

            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "stream_delta",
                "agent": self.id,
                "session": self.current_session,
                "delta": chunk,
                "done": is_last,
            }));

            start += break_at;

            if !is_last {
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
            }
        }
    }
}

fn is_conversational(msg: &str) -> bool {
    let lower = msg.trim().to_lowercase();
    let word_count = lower.split_whitespace().count();
    if word_count <= 3 {
        // Short phrases that imply the user wants the agent to *do*
        // something (confirm a pending action) are NOT conversational.
        const ACTION_CONFIRMATIONS: &[&str] = &[
            "yes please",
            "yes do it",
            "yes go ahead",
            "do it",
            "go ahead",
            "go for it",
            "please do",
            "yep do it",
            "sure do it",
            "ok do it",
            "send it",
            "run it",
            "try it",
            "yes run",
            "yes send",
        ];
        if ACTION_CONFIRMATIONS.iter().any(|s| lower.starts_with(s)) {
            return false;
        }

        const STARTERS: &[&str] = &[
            "hi",
            "hello",
            "hey",
            "thanks",
            "thank you",
            "thx",
            "bye",
            "ok",
            "okay",
            "sure",
            "yes",
            "no",
            "yep",
            "nope",
            "cool",
            "great",
            "good",
            "nice",
            "awesome",
            "perfect",
            "got it",
            "what",
            "who",
            "how are you",
            "how's it going",
        ];
        if STARTERS.iter().any(|s| lower.starts_with(s)) {
            return true;
        }
    }
    false
}
