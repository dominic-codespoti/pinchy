use crate::comm;
use crate::comm::{ChannelConnector, IncomingMessage, RichMessage};
use crate::config::{Config, SecretRef};
use crate::gateway;
use crate::secrets;
use crate::slash;
use anyhow::{anyhow, Context as AnyhowContext};
use async_trait::async_trait;
use serenity::async_trait as serenity_async_trait;
use serenity::builder::{CreateAttachment, CreateEmbed, CreateEmbedFooter, CreateMessage};
use serenity::client::{Client, Context, EventHandler};
use serenity::http::Http;
use serenity::model::channel::Message;
use serenity::model::gateway::GatewayIntents;
use serenity::model::id::{ChannelId, UserId};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

struct Handler;

/// Lazily initialized slash command registry shared across all Discord handler
/// invocations.
fn slash_registry() -> &'static slash::Registry {
    static REG: OnceLock<slash::Registry> = OnceLock::new();
    REG.get_or_init(|| {
        let r = slash::Registry::new();
        slash::register_builtin_commands(&r);
        r
    })
}

// Shared HTTP client initialised by `init` so other modules can send
// messages without holding the full `Client` instance.
static HTTP_CLIENT: OnceLock<Http> = OnceLock::new();

/// Returns `true` if the Discord connector was successfully initialised
/// (i.e. a valid token was resolved and the HTTP client is ready).
pub fn is_enabled() -> bool {
    HTTP_CLIENT.get().is_some()
}

// ---------------------------------------------------------------------------
// Reply tracking — maps Discord message IDs to agent/session context so
// that when a user replies to an agent's message, the reply is routed to
// the correct agent and session.
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ReplyContext {
    pub agent_id: String,
    pub session_id: Option<String>,
}

const REPLY_TRACKER_CAPACITY: usize = 2000;

static REPLY_TRACKER: OnceLock<RwLock<BTreeMap<u64, ReplyContext>>> = OnceLock::new();

fn reply_tracker() -> &'static RwLock<BTreeMap<u64, ReplyContext>> {
    REPLY_TRACKER.get_or_init(|| RwLock::new(BTreeMap::new()))
}

pub async fn track_reply(discord_msg_id: u64, ctx: ReplyContext) {
    let mut map = reply_tracker().write().await;
    if map.len() >= REPLY_TRACKER_CAPACITY {
        if let Some(&old_key) = map.keys().next() {
            map.remove(&old_key);
        }
    }
    map.insert(discord_msg_id, ctx);
}

async fn lookup_reply(discord_msg_id: u64) -> Option<ReplyContext> {
    reply_tracker().read().await.get(&discord_msg_id).cloned()
}

tokio::task_local! {
    pub static CURRENT_REPLY_CONTEXT: ReplyContext;
}

#[serenity_async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        // Ignore messages from bots (including ourselves).
        if msg.author.bot {
            return;
        }

        debug!(
            author = %msg.author.name,
            channel_id = %msg.channel_id,
            content_len = msg.content.len(),
            "discord message received"
        );

        let trimmed = msg.content.trim();

        // Dispatch slash commands through the channel-agnostic registry.
        if trimmed.starts_with('/') {
            // Resolve agent_id for this channel via config routing.
            let (agent_id, workspace) = match crate::config::Config::load(
                &crate::pinchy_home().join("config.yaml"),
            )
            .await
            {
                Ok(cfg) => {
                    let aid = cfg
                        .routing
                        .as_ref()
                        .and_then(|r| {
                            let key = format!("discord:{}", msg.channel_id);
                            r.channels
                                .get(&key)
                                .cloned()
                                .or_else(|| r.default_agent.clone())
                        })
                        .unwrap_or_else(|| "default".to_string());

                    let ws = cfg
                        .agents
                        .iter()
                        .find(|a| a.id == aid)
                        .map(|a| PathBuf::from(&a.root))
                        .unwrap_or_else(|| crate::utils::agent_root(&aid));
                    (aid, ws)
                }
                Err(_) => ("default".to_string(), crate::utils::agent_root("default")),
            };

            let slash_ctx = slash::Context {
                agent_id,
                agent_root: workspace.clone(),
                workspace: workspace.join("workspace"),
                channel: "discord".to_string(),
                config_path: crate::pinchy_home().join("config.yaml"),
                pinchy_home: crate::pinchy_home(),
            };
            match slash_registry()
                .dispatch("discord", trimmed, &slash_ctx)
                .await
            {
                Ok(slash::SlashResponse::Text(text)) => {
                    debug!(cmd = %trimmed, "slash command dispatched");
                    // Best-effort reply — don't fail the handler if this errors.
                    if let Err(e) = msg.channel_id.say(&ctx.http, &text).await {
                        warn!(error = %e, "failed to send slash reply to Discord");
                    }
                }
                Err(e) => {
                    warn!(error = %e, cmd = %trimmed, "slash command error");
                    let _ = msg.channel_id.say(&ctx.http, format!("error: {e}")).await;
                }
            }
            return;
        }
        // If the user is replying to a bot message, look up the original
        // message to determine which agent/session to route to.
        let reply_meta = if let Some(ref mref) = msg.message_reference {
            if let Some(mid) = mref.message_id {
                lookup_reply(mid.get()).await
            } else {
                None
            }
        } else {
            None
        };

        let incoming = IncomingMessage {
            agent_id: reply_meta.as_ref().map(|r| r.agent_id.clone()),
            channel: msg.channel_id.to_string(),
            author: msg.author.name.clone(),
            content: msg.content.clone(),
            timestamp: msg.timestamp.unix_timestamp(),
            session_id: reply_meta.as_ref().and_then(|r| r.session_id.clone()),
        };

        if reply_meta.is_some() {
            debug!(
                agent = ?incoming.agent_id,
                session = ?incoming.session_id,
                "routed reply to agent via message reference"
            );
        }

        if let Err(e) = comm::sender().send(incoming) {
            warn!(error = %e, "failed to send message to comm bus (no receivers?)");
        }

        // Publish to gateway WebSocket clients.
        gateway::publish_event_json(&serde_json::json!({
            "type": "discord_message",
            "agent": "default",
            "author": msg.author.name,
            "content": msg.content,
            "channel_id": msg.channel_id.to_string(),
            "timestamp": msg.timestamp.unix_timestamp(),
        }));
    }
}

/// Channel connector that delivers replies via Discord.
pub struct DiscordConnector;

#[async_trait]
impl ChannelConnector for DiscordConnector {
    fn name(&self) -> &str {
        "discord"
    }

    fn matches(&self, channel: &str) -> bool {
        // dm:<user_id> — direct message to a user
        if let Some(uid) = channel.strip_prefix("dm:") {
            return !uid.is_empty() && uid.chars().all(|c| c.is_ascii_digit());
        }
        // Plain numeric — Discord channel id
        !channel.contains(':') && !channel.is_empty() && channel.chars().all(|c| c.is_ascii_digit())
    }

    async fn send(&self, channel: &str, text: &str) -> anyhow::Result<()> {
        if let Some(uid) = channel.strip_prefix("dm:") {
            send_dm_message(uid, text).await
        } else {
            send_channel_message(channel, text).await
        }
    }

    async fn send_rich(&self, channel: &str, msg: RichMessage) -> anyhow::Result<()> {
        if let Some(uid) = channel.strip_prefix("dm:") {
            send_rich_dm_message(uid, &msg).await
        } else {
            send_rich_channel_message(channel, &msg).await
        }
    }
}

/// Spawn a background task that connects to Discord and logs incoming messages.
///
/// Resolves the Discord bot token in the following order:
/// 1. Environment variable `DISCORD_TOKEN`
/// 2. `channels.discord.token` from `config.yaml` pointing at the file-backed
///    secrets store (`secrets.path`)
/// 3. OS keyring when configured via `secrets.keyring_service` and a
///    pointer with `source: "keyring"`.
pub fn init(cfg: &Config) {
    // Resolve token synchronously before spawning the background task so we
    // don't need to move the whole `Config` into the async task.
    let token = resolve_token(cfg);
    let token = match token {
        Some(t) => t,
        None => {
            warn!("DISCORD_TOKEN not set -- Discord connector disabled");
            return;
        }
    };

    // Initialize a shared HTTP client so other parts of the program can
    // send messages without holding the full `Client` instance.
    HTTP_CLIENT.get_or_init(|| Http::new(&token));

    // Register the Discord connector so the agent runtime can deliver replies
    // through the generic abstraction.
    tokio::spawn(async {
        comm::register_connector(Arc::new(DiscordConnector)).await;
    });

    tokio::spawn(async move {
        // Request both guild and direct-message events, plus message content
        // (which is privileged). If Discord rejects privileged intents we'll
        // retry without `MESSAGE_CONTENT` but keep `DIRECT_MESSAGES` so the
        // bot still receives DMs.
        let intents = GatewayIntents::GUILD_MESSAGES
            | GatewayIntents::DIRECT_MESSAGES
            | GatewayIntents::MESSAGE_CONTENT;

        let mut client = match Client::builder(&token, intents)
            .event_handler(Handler)
            .await
        {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "failed to build Discord client");
                return;
            }
        };

        info!("starting Discord bot");
        match client.start().await {
            Ok(()) => {}
            Err(e) => {
                // Detect when the gateway rejects privileged intents (e.g. MESSAGE_CONTENT)
                let s = e.to_string();
                if s.contains("Disallowed gateway intents") || s.contains("Disallowed intent") {
                    warn!(error = %e, "Discord client error: disallowed gateway intents");
                    warn!("Retrying without MESSAGE_CONTENT intent. If you need message content, enable the 'Message Content Intent' in the Discord developer portal for your bot.");

                    // Retry with reduced intents (drop MESSAGE_CONTENT)
                    let reduced = GatewayIntents::GUILD_MESSAGES | GatewayIntents::DIRECT_MESSAGES;
                    match Client::builder(&token, reduced)
                        .event_handler(Handler)
                        .await
                    {
                        Ok(mut rc) => {
                            info!("starting Discord bot with reduced intents");
                            if let Err(e2) = rc.start().await {
                                warn!(error = %e2, "Discord client error with reduced intents");
                            }
                        }
                        Err(e2) => {
                            warn!(error = %e2, "failed to build Discord client with reduced intents");
                        }
                    }
                } else {
                    warn!(error = %e, "Discord client error");
                }
            }
        }
    });

    debug!("discord module loaded");
}

/// Send a plain-text message to a numeric Discord channel id (as string).
/// Returns an error when the HTTP client has not been initialised or the
/// underlying API call fails.
pub(crate) async fn send_channel_message(channel: &str, text: &str) -> anyhow::Result<()> {
    // Obtain the HTTP client.
    let http = HTTP_CLIENT
        .get()
        .ok_or_else(|| anyhow!("discord http client not initialised"))?;

    let cid: u64 = channel
        .parse()
        .with_context(|| format!("invalid channel id: {}", channel))?;
    let ch = ChannelId::new(cid);

    // Discord imposes a 2 000-character limit per message.  Split long
    // text into chunks so nothing is silently truncated.
    for chunk in chunk_message(text, 2000) {
        let sent = ch
            .say(http, &chunk)
            .await
            .map_err(|e| anyhow!(format!("discord send error: {e:?}")))?;
        if let Ok(ctx) = CURRENT_REPLY_CONTEXT.try_with(|c| c.clone()) {
            track_reply(sent.id.get(), ctx).await;
        }
    }
    Ok(())
}

/// Send a plain-text DM to a Discord user by their numeric user id.
pub(crate) async fn send_dm_message(user_id: &str, text: &str) -> anyhow::Result<()> {
    let http = HTTP_CLIENT
        .get()
        .ok_or_else(|| anyhow!("discord http client not initialised"))?;

    let uid: u64 = user_id
        .parse()
        .with_context(|| format!("invalid user id: {user_id}"))?;
    let user = UserId::new(uid);
    let dm_channel = user
        .create_dm_channel(http)
        .await
        .map_err(|e| anyhow!("failed to create DM channel for user {user_id}: {e:?}"))?;

    for chunk in chunk_message(text, 2000) {
        let sent = dm_channel
            .say(http, &chunk)
            .await
            .map_err(|e| anyhow!("discord DM send error: {e:?}"))?;
        if let Ok(ctx) = CURRENT_REPLY_CONTEXT.try_with(|c| c.clone()) {
            track_reply(sent.id.get(), ctx).await;
        }
    }
    Ok(())
}

/// Send a rich (embed) DM to a Discord user by their numeric user id.
pub(crate) async fn send_rich_dm_message(user_id: &str, msg: &RichMessage) -> anyhow::Result<()> {
    let http = HTTP_CLIENT
        .get()
        .ok_or_else(|| anyhow!("discord http client not initialised"))?;

    let uid: u64 = user_id
        .parse()
        .with_context(|| format!("invalid user id: {user_id}"))?;
    let user = UserId::new(uid);
    let dm_channel = user
        .create_dm_channel(http)
        .await
        .map_err(|e| anyhow!("failed to create DM channel for user {user_id}: {e:?}"))?;

    let mut embed = CreateEmbed::new();
    if let Some(t) = &msg.title {
        embed = embed.title(truncate(t, 256));
    }
    if let Some(t) = &msg.text {
        embed = embed.description(truncate(t, 4096));
    }
    for s in &msg.sections {
        embed = embed.field(truncate(&s.name, 256), truncate(&s.value, 1024), s.inline);
    }
    if let Some(c) = &msg.color {
        if let Some(hex) = parse_hex_color(c) {
            embed = embed.colour(hex);
        }
    }
    if let Some(f) = &msg.footer {
        embed = embed.footer(CreateEmbedFooter::new(truncate(f, 2048)));
    }
    if let Some(url) = &msg.image_url {
        embed = embed.image(url);
    }

    let mut create_msg = CreateMessage::new().embed(embed);

    // Include a plain-text fallback so the message is always readable
    // even when embeds fail to render (e.g. compact mode, some mobile views).
    let fallback = msg.as_plain_text();
    if !fallback.is_empty() && fallback != "(empty message)" {
        let truncated = truncate(&fallback, 2000);
        create_msg = create_msg.content(truncated);
    }

    if let Some((filename, bytes)) = &msg.attachment {
        create_msg = create_msg.add_file(CreateAttachment::bytes(bytes.clone(), filename.as_str()));
    }

    let sent = dm_channel
        .send_message(http, create_msg)
        .await
        .map_err(|e| anyhow!("discord DM rich send error: {e:?}"))?;
    if let Ok(ctx) = CURRENT_REPLY_CONTEXT.try_with(|c| c.clone()) {
        track_reply(sent.id.get(), ctx).await;
    }
    Ok(())
}

/// Send a rich (embed) message to a numeric Discord channel id.
pub(crate) async fn send_rich_channel_message(
    channel: &str,
    msg: &RichMessage,
) -> anyhow::Result<()> {
    let http = HTTP_CLIENT
        .get()
        .ok_or_else(|| anyhow!("discord http client not initialised"))?;

    let cid: u64 = channel
        .parse()
        .with_context(|| format!("invalid channel id: {}", channel))?;
    let ch = ChannelId::new(cid);

    // Build the embed, respecting Discord's field-length limits.
    let mut embed = CreateEmbed::new();
    if let Some(t) = &msg.title {
        embed = embed.title(truncate(t, 256));
    }
    if let Some(t) = &msg.text {
        embed = embed.description(truncate(t, 4096));
    }
    for s in &msg.sections {
        embed = embed.field(truncate(&s.name, 256), truncate(&s.value, 1024), s.inline);
    }
    if let Some(c) = &msg.color {
        if let Some(hex) = parse_hex_color(c) {
            embed = embed.colour(hex);
        }
    }
    if let Some(f) = &msg.footer {
        embed = embed.footer(CreateEmbedFooter::new(truncate(f, 2048)));
    }
    if let Some(url) = &msg.image_url {
        embed = embed.image(url);
    }

    let mut create_msg = CreateMessage::new().embed(embed);

    // Include a plain-text fallback so the message is always readable
    // even when embeds fail to render (e.g. compact mode, some mobile views).
    let fallback = msg.as_plain_text();
    if !fallback.is_empty() && fallback != "(empty message)" {
        let truncated = truncate(&fallback, 2000);
        create_msg = create_msg.content(truncated);
    }

    // Attach file if provided — ownership lets us move bytes without cloning.
    if let Some((filename, bytes)) = &msg.attachment {
        create_msg = create_msg.add_file(CreateAttachment::bytes(bytes.clone(), filename.as_str()));
    }

    let sent = ch
        .send_message(http, create_msg)
        .await
        .map_err(|e| anyhow!("discord rich send error: {e:?}"))?;
    if let Ok(ctx) = CURRENT_REPLY_CONTEXT.try_with(|c| c.clone()) {
        track_reply(sent.id.get(), ctx).await;
    }

    // Apply reactions if specified in channel_hints.discord.reactions
    if let Some(discord_hints) = msg.channel_hints.get("discord") {
        if let Some(reactions) = discord_hints.get("reactions") {
            if let Some(arr) = reactions.as_array() {
                // We'd need access to the sent message to add reactions.
                // For now, log it — reactions require the message id.
                debug!(
                    count = arr.len(),
                    "discord channel_hints.reactions specified but reaction support is TODO"
                );
            }
        }
    }

    Ok(())
}

/// Parse a `#RRGGBB` hex string into a u32 colour value.
fn parse_hex_color(s: &str) -> Option<u32> {
    let hex = s.strip_prefix('#').unwrap_or(s);
    u32::from_str_radix(hex, 16).ok()
}

/// Truncate a string to `max` characters, appending "…" when shortened.
/// Splits on a char boundary so it never panics.
fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    // Leave room for the ellipsis character.
    let limit = max.saturating_sub(1);
    let mut end = limit;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

/// Split text into chunks of at most `max` characters, preferring line
/// boundaries so messages don't break mid-sentence.
fn chunk_message(text: &str, max: usize) -> Vec<String> {
    if text.len() <= max {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut remaining = text;
    while !remaining.is_empty() {
        if remaining.len() <= max {
            chunks.push(remaining.to_string());
            break;
        }
        // Try to split at the last newline within the limit.
        let boundary = remaining[..max]
            .rfind('\n')
            .map(|i| i + 1)
            .unwrap_or_else(|| {
                // No newline — split at last space.
                remaining[..max].rfind(' ').map(|i| i + 1).unwrap_or(max)
            });
        // Ensure we're on a char boundary.
        let mut end = boundary;
        while end > 0 && !remaining.is_char_boundary(end) {
            end -= 1;
        }
        if end == 0 {
            end = max.min(remaining.len());
            while end < remaining.len() && !remaining.is_char_boundary(end) {
                end += 1;
            }
        }
        chunks.push(remaining[..end].to_string());
        remaining = &remaining[end..];
    }
    chunks
}

/// Resolve the configured Discord token using the precedence rules described
/// in `init`.
fn resolve_token(cfg: &Config) -> Option<String> {
    // 1) Check environment first.
    if let Ok(tok) = std::env::var("DISCORD_TOKEN") {
        if !tok.is_empty() {
            return Some(tok);
        }
    }

    // 2) Check config file pointer if present.
    if let Some(discord_cfg) = cfg.channels.discord.as_ref() {
        match &discord_cfg.token {
            SecretRef::Plain(s) => {
                if s.starts_with('$') && s.len() > 1 {
                    return std::env::var(&s[1..]).ok();
                }
                if s.starts_with('@') && s.len() > 1 {
                    let key = &s[1..];
                    let dir = cfg
                        .secrets
                        .as_ref()
                        .and_then(|sc| sc.path.as_deref())
                        .map(Path::new);
                    if let Ok(Some(v)) = secrets::get_secret_file(dir.as_ref().map(|p| *p), key) {
                        if !v.is_empty() {
                            return Some(v);
                        }
                    }
                    return None;
                }
                // Otherwise treat as a literal token.
                if !s.is_empty() {
                    return Some(s.clone());
                }
            }
            SecretRef::Pointer { key, source } => match source.as_str() {
                "env" => return std::env::var(key).ok(),
                "secrets" => {
                    let dir = cfg
                        .secrets
                        .as_ref()
                        .and_then(|sc| sc.path.as_deref())
                        .map(Path::new);
                    if let Ok(Some(v)) = secrets::get_secret_file(dir.as_ref().map(|p| *p), key) {
                        if !v.is_empty() {
                            return Some(v);
                        }
                    }
                }
                "keyring" => {
                    let service = cfg
                        .secrets
                        .as_ref()
                        .and_then(|s| s.keyring_service.as_ref())
                        .map(|s| s.as_str())
                        .unwrap_or("pinchy");
                    if let Ok(entry) = keyring::Entry::new(service, key) {
                        if let Ok(pw) = entry.get_password() {
                            if !pw.is_empty() {
                                return Some(pw);
                            }
                        }
                    }
                }
                _ => {
                    // Unknown source — fall through.
                }
            },
        }
    }

    None
}
