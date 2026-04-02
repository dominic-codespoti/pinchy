use axum::response::IntoResponse;
use axum::Json;

use super::super::types::{CommandInfo, SlashCommandsResponse};

pub(crate) async fn api_slash_commands() -> impl IntoResponse {
    let registry = crate::slash::Registry::new();
    crate::slash::register_builtin_commands(&registry);
    let commands: Vec<CommandInfo> = registry
        .list()
        .into_iter()
        .map(|cmd| CommandInfo {
            name: cmd.name,
            description: cmd.description,
            usage: cmd.usage,
        })
        .collect();
    Json(SlashCommandsResponse { commands })
}
