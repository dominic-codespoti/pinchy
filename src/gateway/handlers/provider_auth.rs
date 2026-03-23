use axum::{http::StatusCode, response::IntoResponse, Json};

pub(crate) async fn api_provider_auth_status() -> impl IntoResponse {
    let copilot_github = crate::auth::github_device::retrieve_token().ok().flatten();
    let copilot_session = crate::auth::copilot_token::retrieve_cached_copilot_token()
        .ok()
        .flatten();
    let chatgpt_auth = crate::auth::openai_chatgpt::retrieve_auth().ok().flatten();
    let azure = detect_azure_cli_status();

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "copilot": {
                "github_connected": copilot_github.is_some(),
                "session_cached": copilot_session.is_some(),
                "session_expired": copilot_session.as_ref().map(|token| token.is_expired()).unwrap_or(false),
            },
            "azure": azure,
            "openai": {
                "env_available": std::env::var("OPENAI_API_KEY").ok().filter(|value| !value.is_empty()).is_some(),
                "secrets_hint": ["OPENAI_API_KEY", "OPENAI_PROJECT_ID", "OPENAI_ORG_ID"],
            },
            "openai_chatgpt": {
                "authenticated": chatgpt_auth.is_some(),
                "needs_refresh": chatgpt_auth.as_ref().map(|a| a.needs_refresh()).unwrap_or(false),
            }
        })),
    )
        .into_response()
}

fn detect_azure_cli_status() -> serde_json::Value {
    let az_version = std::process::Command::new("az").arg("version").output();

    let installed = az_version.is_ok();
    if !installed {
        return serde_json::json!({
            "installed": false,
            "connected": false,
            "user_name": null,
            "tenant_id": null,
            "subscription_id": null,
            "subscription_name": null,
            "error": null,
            "command_hint": "Install Azure CLI and run `az login` if you want to use Azure sign-in.",
        });
    }

    let account_output = std::process::Command::new("az")
        .args(["account", "show", "-o", "json"])
        .output();

    match account_output {
        Ok(output) if output.status.success() => {
            let parsed: serde_json::Value =
                serde_json::from_slice(&output.stdout).unwrap_or_else(|_| serde_json::json!({}));

            serde_json::json!({
                "installed": true,
                "connected": true,
                "user_name": parsed.get("user").and_then(|v| v.get("name")).and_then(|v| v.as_str()),
                "tenant_id": parsed.get("tenantId").and_then(|v| v.as_str()),
                "subscription_id": parsed.get("id").and_then(|v| v.as_str()),
                "subscription_name": parsed.get("name").and_then(|v| v.as_str()),
                "error": null,
                "command_hint": null,
            })
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            serde_json::json!({
                "installed": true,
                "connected": false,
                "user_name": null,
                "tenant_id": null,
                "subscription_id": null,
                "subscription_name": null,
                "error": if stderr.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(stderr) },
                "command_hint": "Run `az login` and ensure the account can access Azure OpenAI.",
            })
        }
        Err(e) => serde_json::json!({
            "installed": true,
            "connected": false,
            "user_name": null,
            "tenant_id": null,
            "subscription_id": null,
            "subscription_name": null,
            "error": e.to_string(),
            "command_hint": "Run `az login` and ensure the account can access Azure OpenAI.",
        }),
    }
}

pub(crate) async fn api_copilot_auth_start() -> impl IntoResponse {
    let client_id = crate::auth::github_device::DEFAULT_CLIENT_ID;
    let http = reqwest::Client::new();

    let response = match http
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", "read:user")])
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": format!("github device flow failed: {e}") })),
            )
                .into_response();
        }
    };

    let payload: serde_json::Value = match response.json().await {
        Ok(payload) => payload,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": format!("invalid github device flow response: {e}") })),
            )
                .into_response();
        }
    };

    let device_code = match payload.get("device_code").and_then(|value| value.as_str()) {
        Some(code) => code.to_string(),
        None => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "missing GitHub device code" })),
            )
                .into_response();
        }
    };

    let user_code = payload
        .get("user_code")
        .and_then(|value| value.as_str())
        .unwrap_or("???")
        .to_string();
    let verification_uri = payload
        .get("verification_uri")
        .and_then(|value| value.as_str())
        .unwrap_or("https://github.com/login/device")
        .to_string();
    let interval = payload
        .get("interval")
        .and_then(|value| value.as_u64())
        .unwrap_or(5);

    let login_id = uuid::Uuid::new_v4().to_string();
    let session = serde_json::json!({
        "login_id": login_id,
        "status": "pending",
        "verification_uri": verification_uri,
        "user_code": user_code,
        "error": null,
    });
    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "copilot_auth_started",
        "login": session,
    }));

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
            let poll = match http
                .post("https://github.com/login/oauth/access_token")
                .header("Accept", "application/json")
                .form(&[
                    ("client_id", client_id),
                    ("device_code", device_code.as_str()),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ])
                .send()
                .await
            {
                Ok(resp) => resp.json::<serde_json::Value>().await.unwrap_or_default(),
                Err(e) => {
                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "copilot_auth_update",
                        "login": {
                            "login_id": login_id,
                            "status": "error",
                            "error": format!("github device flow failed: {e}"),
                        }
                    }));
                    break;
                }
            };

            if let Some(token) = poll.get("access_token").and_then(|value| value.as_str()) {
                let store_result = crate::auth::github_device::store_token(token);
                let exchange_result =
                    crate::auth::copilot_token::exchange_github_for_copilot_token(token).await;

                let error = if let Err(e) = store_result {
                    Some(format!("failed to store GitHub token: {e}"))
                } else if let Err(ref e) = exchange_result {
                    Some(format!(
                        "GitHub connected, but Copilot token exchange failed: {e}"
                    ))
                } else {
                    None
                };

                if let Ok(token) = exchange_result {
                    let _ = crate::auth::copilot_token::cache_copilot_token(&token);
                }

                let status = if error.is_some() {
                    "warning"
                } else {
                    "complete"
                };

                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "copilot_auth_update",
                    "login": {
                        "login_id": login_id,
                        "status": status,
                        "error": error,
                    }
                }));
                break;
            }

            match poll.get("error").and_then(|value| value.as_str()) {
                Some("authorization_pending") => continue,
                Some("slow_down") => continue,
                Some(other) => {
                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "copilot_auth_update",
                        "login": {
                            "login_id": login_id,
                            "status": "error",
                            "error": format!("github device flow error: {other}"),
                        }
                    }));
                    break;
                }
                None => {
                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "copilot_auth_update",
                        "login": {
                            "login_id": login_id,
                            "status": "error",
                            "error": "unexpected GitHub device flow response",
                        }
                    }));
                    break;
                }
            }
        }
    });

    (StatusCode::OK, Json(session)).into_response()
}

pub(crate) async fn api_chatgpt_auth_start() -> impl IntoResponse {
    let login_id = uuid::Uuid::new_v4().to_string();

    // Generate PKCE verifier and state for CSRF protection.
    let code_verifier = match crate::auth::openai_chatgpt::generate_code_verifier() {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("PKCE generation failed: {e}") })),
            )
                .into_response();
        }
    };

    let state = match crate::auth::openai_chatgpt::generate_state() {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("State generation failed: {e}") })),
            )
                .into_response();
        }
    };

    let auth_url = crate::auth::openai_chatgpt::build_auth_url(&code_verifier, &state);

    let session = serde_json::json!({
        "login_id": login_id,
        "status": "pending",
        "auth_url": auth_url,
    });

    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "chatgpt_auth_started",
        "login": session,
    }));

    // Spawn background task: wait for callback, exchange tokens.
    let lid = login_id.clone();
    tokio::spawn(async move {
        // Wait for the OAuth callback (validates state).
        let code = match crate::auth::openai_chatgpt::wait_for_callback(&state).await {
            Ok(c) => c,
            Err(e) => {
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "chatgpt_auth_update",
                    "login": {
                        "login_id": lid,
                        "status": "error",
                        "error": format!("OAuth callback failed: {e}"),
                    }
                }));
                return;
            }
        };

        // Exchange code for tokens.
        let (id_token, access_token, refresh_token) =
            match crate::auth::openai_chatgpt::exchange_code_for_tokens(&code, &code_verifier).await
            {
                Ok(tokens) => tokens,
                Err(e) => {
                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "chatgpt_auth_update",
                        "login": {
                            "login_id": lid,
                            "status": "error",
                            "error": format!("Token exchange failed: {e}"),
                        }
                    }));
                    return;
                }
            };

        // Store the auth. Codex-backed ChatGPT access uses the OAuth access token
        // directly; no separate API-key exchange is required here.
        let account_id = crate::auth::openai_chatgpt::extract_account_id_from_jwt(&id_token)
            .or_else(|| crate::auth::openai_chatgpt::extract_account_id_from_jwt(&access_token));
        let expires = crate::auth::openai_chatgpt::extract_expiry_from_jwt(&access_token);

        let auth = crate::auth::openai_chatgpt::ChatGptAuth {
            api_key: String::new(),
            access_token,
            refresh_token,
            id_token,
            last_refresh: chrono::Utc::now(),
            account_id,
            expires,
        };

        let error = match crate::auth::openai_chatgpt::store_auth(&auth) {
            Ok(()) => None,
            Err(e) => Some(format!(
                "Auth succeeded but failed to store credentials: {e}"
            )),
        };

        let status = if error.is_some() {
            "warning"
        } else {
            "complete"
        };

        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "chatgpt_auth_update",
            "login": {
                "login_id": lid,
                "status": status,
                "error": error,
            }
        }));
    });

    (StatusCode::OK, Json(session)).into_response()
}

pub(crate) async fn api_chatgpt_auth_logout() -> impl IntoResponse {
    match crate::auth::openai_chatgpt::remove_auth() {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "logged_out" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to remove auth: {e}") })),
        )
            .into_response(),
    }
}
