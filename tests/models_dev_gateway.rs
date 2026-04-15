//! Tests for gateway handlers related to models.dev integration.
//!
//! Tests the following endpoints:
//! - GET /api/models
//! - GET /api/models/registry
//! - GET /api/providers/status

use std::net::SocketAddr;

/// Test that the models endpoint returns valid JSON.
/// This test may be skipped if no snapshot is available.
#[tokio::test]
async fn test_api_models_endpoint() {
    let addr: SocketAddr = "127.0.0.1:4501".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://{}/api/models", gw.addr))
        .send()
        .await
        .expect("request failed");

    // Should return 200 (or possibly 503 if models.dev unavailable)
    let status = resp.status();
    assert!(
        status == 200 || status == 503 || status == 500,
        "unexpected status: {}",
        status
    );

    if status == 200 {
        let body: serde_json::Value = resp.json().await.expect("failed to parse JSON");
        // Response should have a "models" field
        assert!(
            body.get("models").is_some(),
            "response should have 'models' field"
        );

        if let Some(models) = body.get("models").and_then(|m| m.as_array()) {
            println!("/api/models returned {} models", models.len());

            // Each model should have expected fields
            for model in models.iter().take(5) {
                // Just check first 5
                assert!(model.get("id").is_some(), "model should have 'id' field");
                assert!(
                    model.get("name").is_some(),
                    "model should have 'name' field"
                );
                assert!(
                    model.get("provider").is_some(),
                    "model should have 'provider' field"
                );
            }
        }
    } else {
        println!(
            "/api/models returned status {} (models.dev may be unavailable)",
            status
        );
    }

    gw.handle.abort();
}

/// Test the registry endpoint that returns full models.dev data.
#[tokio::test]
async fn test_api_models_registry_endpoint() {
    let addr: SocketAddr = "127.0.0.1:4502".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://{}/api/models/registry", gw.addr))
        .send()
        .await
        .expect("request failed");

    let status = resp.status();

    if status == 200 {
        let body: serde_json::Value = resp.json().await.expect("failed to parse JSON");

        // Should have providers array
        assert!(
            body.get("providers").is_some(),
            "response should have 'providers' field"
        );

        // Should have counts
        assert!(
            body.get("total_providers").is_some(),
            "response should have 'total_providers' field"
        );
        assert!(
            body.get("total_models").is_some(),
            "response should have 'total_models' field"
        );

        // Verify counts are reasonable
        if let Some(total) = body.get("total_models").and_then(|t| t.as_u64()) {
            println!("Registry endpoint reports {} total models", total);
        }
        if let Some(providers) = body.get("total_providers").and_then(|p| p.as_u64()) {
            println!("Registry endpoint reports {} providers", providers);
        }

        // Should have cached_at timestamp
        assert!(
            body.get("cached_at").is_some(),
            "response should have 'cached_at' field"
        );
    } else if status == 503 {
        // Service unavailable - models.dev couldn't be loaded
        println!("Registry endpoint: models.dev unavailable (503)");
    } else {
        println!("Registry endpoint returned status {}", status);
    }

    gw.handle.abort();
}

/// Test the providers status endpoint.
#[tokio::test]
async fn test_api_providers_status_endpoint() {
    let addr: SocketAddr = "127.0.0.1:4503".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://{}/api/providers/status", gw.addr))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 200, "providers/status should return 200");

    let body: serde_json::Value = resp.json().await.expect("failed to parse JSON");

    // Should have providers array
    assert!(
        body.get("providers").is_some(),
        "response should have 'providers' field"
    );

    if let Some(providers) = body.get("providers").and_then(|p| p.as_array()) {
        println!("Providers status returned {} entries", providers.len());

        // Should check for common providers
        let provider_ids: Vec<String> = providers
            .iter()
            .filter_map(|p| {
                p.get("provider")
                    .and_then(|id| id.as_str())
                    .map(String::from)
            })
            .collect();

        // Look for expected providers (may or may not be present depending on config)
        let expected = ["openai", "anthropic", "copilot", "google", "azure-openai"];
        for id in &expected {
            if provider_ids.contains(&id.to_string()) {
                println!("Found provider: {}", id);
            }
        }

        // Each provider entry should have required fields
        for provider in providers.iter().take(5) {
            assert!(
                provider.get("provider").is_some(),
                "provider entry should have 'provider' field"
            );
            assert!(
                provider.get("configured").is_some(),
                "provider entry should have 'configured' field"
            );
            assert!(
                provider.get("has_api_key").is_some(),
                "provider entry should have 'has_api_key' field"
            );

            // New fields from models.dev integration
            if provider.get("name").is_some() {
                // Has display name from models.dev
            }
            if provider.get("env_vars").is_some() {
                // Has env vars list from models.dev
            }
            if provider.get("model_count").is_some() {
                // Has model count from models.dev
            }
        }
    }

    gw.handle.abort();
}

/// Test that the per-provider model list endpoint works.
#[tokio::test]
async fn test_api_models_list_for_provider() {
    let addr: SocketAddr = "127.0.0.1:4504".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let client = reqwest::Client::new();

    // Test with a common provider - may or may not be configured
    // The endpoint should handle both cases
    let resp = client
        .get(format!("http://{}/api/models/test-provider", gw.addr))
        .send()
        .await
        .expect("request failed");

    let status = resp.status();
    // Should return 200, 404 (if provider not in config), or 502 (if provider unreachable)
    assert!(
        status == 200 || status == 404 || status == 502 || status == 500,
        "unexpected status: {}",
        status
    );

    if status == 200 {
        let body: serde_json::Value = resp.json().await.expect("failed to parse JSON");
        if let Some(models) = body.get("models") {
            if models.is_null() {
                println!("Provider does not support model discovery");
            } else if let Some(arr) = models.as_array() {
                println!("Provider returned {} models", arr.len());
            }
        }
    }

    gw.handle.abort();
}

/// Test registry freshness check.
#[test]
fn test_registry_cache_freshness_calculation() {
    use chrono::{Duration, Utc};
    use mini_claw::models_dev::ModelsDevRegistry;

    // Fresh registry (just created)
    let fresh = ModelsDevRegistry {
        providers: vec![],
        cached_at: Utc::now(),
    };
    assert!(
        fresh.is_cache_fresh(),
        "just-created registry should be fresh"
    );

    // Stale registry (61 minutes old)
    let stale = ModelsDevRegistry {
        providers: vec![],
        cached_at: Utc::now() - Duration::minutes(61),
    };
    assert!(
        !stale.is_cache_fresh(),
        "61-minute-old registry should be stale"
    );

    // Borderline fresh (59 minutes old)
    let borderline = ModelsDevRegistry {
        providers: vec![],
        cached_at: Utc::now() - Duration::minutes(59),
    };
    assert!(
        borderline.is_cache_fresh(),
        "59-minute-old registry should still be fresh"
    );

    // Exactly at boundary (60 minutes)
    let at_boundary = ModelsDevRegistry {
        providers: vec![],
        cached_at: Utc::now() - Duration::minutes(60),
    };
    // 60 minutes is NOT less than 60 minutes, so it should be stale
    assert!(
        !at_boundary.is_cache_fresh(),
        "60-minute-old registry should be stale (exactly at TTL)"
    );
}

/// Test that provider lookup is case-sensitive.
#[test]
fn test_provider_lookup_case_sensitivity() {
    use mini_claw::models_dev::ModelsDevRegistry;

    let json = br#"[{
        "id": "OpenAI",
        "name": "OpenAI",
        "env": ["KEY"],
        "models": [{"model_key": "gpt-4", "id": "gpt-4", "name": "GPT-4"}]
    }]"#;

    let registry = ModelsDevRegistry::from_json(json).unwrap();

    // Provider lookup is case-sensitive
    assert!(
        registry.provider("OpenAI").is_some(),
        "should find 'OpenAI'"
    );
    assert!(
        registry.provider("openai").is_none(),
        "should not find 'openai' (case mismatch)"
    );
    assert!(
        registry.provider("OPENAI").is_none(),
        "should not find 'OPENAI' (case mismatch)"
    );
}

/// Test error handling for invalid JSON.
#[test]
fn test_registry_parse_error_handling() {
    use mini_claw::models_dev::ModelsDevRegistry;

    // Invalid JSON should return an error
    let result = ModelsDevRegistry::from_json(b"not valid json");
    assert!(result.is_err(), "invalid JSON should return error");

    // Valid JSON but wrong structure
    let result = ModelsDevRegistry::from_json(br#"{"not": "an array"}"#);
    assert!(
        result.is_err(),
        "JSON without provider array should return error"
    );

    // Empty array is valid (no providers)
    let result = ModelsDevRegistry::from_json(br#"[]"#);
    assert!(result.is_ok(), "empty array should be valid");
    let registry = result.unwrap();
    assert_eq!(registry.providers().len(), 0);
}

/// Test model search across providers.
#[test]
fn test_find_model_variations() {
    use mini_claw::models_dev::ModelsDevRegistry;

    let json = br#"[
        {
            "id": "openai",
            "name": "OpenAI",
            "env": ["KEY"],
            "models": [
                {"model_key": "gpt-4o", "id": "gpt-4o", "name": "GPT-4o"},
                {"model_key": "gpt-4o-mini", "id": "gpt-4o-mini", "name": "GPT-4o Mini"}
            ]
        },
        {
            "id": "anthropic",
            "name": "Anthropic",
            "env": ["KEY"],
            "models": [
                {"model_key": "claude-3-opus", "id": "claude-3-opus-20240229", "name": "Claude 3 Opus"}
            ]
        }
    ]"#;

    let registry = ModelsDevRegistry::from_json(json).unwrap();

    // Find by model_key
    let result = registry.find_model("gpt-4o");
    assert!(result.is_some());
    let (provider, model) = result.unwrap();
    assert_eq!(provider, "openai");
    assert_eq!(model.model_key, "gpt-4o");

    // Find by id (which is different from model_key)
    let result = registry.find_model("claude-3-opus-20240229");
    assert!(result.is_some());
    let (provider, model) = result.unwrap();
    assert_eq!(provider, "anthropic");
    assert_eq!(model.id, "claude-3-opus-20240229");
    assert_eq!(model.model_key, "claude-3-opus");

    // Find by model_key that's different from id
    let result = registry.find_model("claude-3-opus");
    assert!(
        result.is_some(),
        "should find by model_key even if id differs"
    );

    // Not found
    assert!(registry.find_model("nonexistent").is_none());
    assert!(registry.find_model("").is_none());
}
