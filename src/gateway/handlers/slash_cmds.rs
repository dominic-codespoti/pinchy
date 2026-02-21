use axum::response::IntoResponse;
use axum::Json;

pub(crate) async fn api_slash_commands() -> impl IntoResponse {
    let registry = crate::slash::Registry::new();
    crate::slash::register_builtin_commands(&registry);
    let commands: Vec<serde_json::Value> = registry
        .list()
        .into_iter()
        .map(|cmd| {
            serde_json::json!({
                "name": cmd.name,
                "description": cmd.description,
                "usage": cmd.usage,
            })
        })
        .collect();
    Json(serde_json::json!({ "commands": commands }))
}
