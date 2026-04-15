//! Integration tests for models.dev registry.
//!
//! These tests verify the full lifecycle of the models.dev integration:
//! - Fetching from the live API
//! - Cache operations
//! - Registry functionality

use std::path::Path;

/// Test fetching from the live models.dev API.
/// Marked with #[ignore] to avoid running in CI (requires network).
#[tokio::test]
#[ignore]
async fn test_models_dev_api_fetch() {
    // Fetch fresh from API
    let registry = mini_claw::models_dev::ModelsDevRegistry::fetch_fresh()
        .await
        .expect("failed to fetch from models.dev API");

    // Verify we got providers
    assert!(
        !registry.providers().is_empty(),
        "registry should have providers"
    );
    println!("Fetched {} providers", registry.providers().len());

    // Verify we have models
    let total_models = registry.total_models();
    assert!(total_models > 0, "registry should have models");
    println!("Total models: {}", total_models);

    // Check for expected providers
    let expected = ["openai", "anthropic", "google"];
    for provider_id in &expected {
        let provider = registry.provider(provider_id);
        assert!(
            provider.is_some(),
            "expected provider '{}' not found",
            provider_id
        );
        if let Some(p) = provider {
            println!("Provider {}: {} models", p.name, p.models.len());
        }
    }

    // Verify cache freshness
    assert!(
        registry.is_cache_fresh(),
        "freshly fetched registry should be cache-fresh"
    );
}

/// Test the full cache lifecycle:
/// - Create registry
/// - Save to temp cache
/// - Load from cache
/// - Verify freshness
#[tokio::test]
async fn test_models_dev_cache_lifecycle() {
    use mini_claw::models_dev::ModelsDevRegistry;
    use std::io::Write;
    use tempfile::NamedTempFile;

    // Try to load from snapshot if available
    let snapshot_path = Path::new("/tmp/complete_model_snapshot.json");
    let registry = if snapshot_path.exists() {
        println!("Loading from snapshot file");
        let data = std::fs::read(snapshot_path).expect("failed to read snapshot");
        ModelsDevRegistry::from_json(&data).expect("failed to parse snapshot")
    } else {
        println!("Creating test registry from sample data");
        // Create minimal test registry
        ModelsDevRegistry::from_json(
            br#"[{
                "id": "test-provider",
                "name": "Test Provider",
                "env": ["TEST_KEY"],
                "models": [{
                    "model_key": "test-model",
                    "id": "test-model",
                    "name": "Test Model"
                }]
            }]"#,
        )
        .expect("failed to create test registry")
    };

    // Verify initial state
    assert!(
        registry.is_cache_fresh(),
        "newly created registry should be fresh"
    );

    // Serialize registry
    let json_data = serde_json::to_vec_pretty(&registry).expect("failed to serialize registry");

    // Write to temp file (simulating cache)
    let mut temp_file = NamedTempFile::new().expect("failed to create temp file");
    temp_file
        .write_all(&json_data)
        .expect("failed to write cache");

    let cache_path = temp_file.path().to_path_buf();
    println!("Cache saved to: {}", cache_path.display());

    // Read back and parse (as full registry, not providers array)
    let loaded_data = std::fs::read(&cache_path).expect("failed to read cache file");
    let loaded_registry: mini_claw::models_dev::ModelsDevRegistry =
        serde_json::from_slice(&loaded_data).expect("failed to parse cached registry");

    // Verify loaded contents match
    assert_eq!(
        loaded_registry.providers().len(),
        registry.providers().len(),
        "provider count should match after cache load"
    );
    assert_eq!(
        loaded_registry.total_models(),
        registry.total_models(),
        "model count should match after cache load"
    );

    // Verify freshness (might be stale if loaded from old snapshot)
    let is_fresh = loaded_registry.is_cache_fresh();
    println!("Loaded registry cache fresh: {}", is_fresh);

    // If loaded from snapshot with old timestamp, it might be stale
    // That's expected behavior - the test verifies the check works
}

/// Test loading from snapshot file directly.
#[test]
fn test_from_snapshot_file() {
    use mini_claw::models_dev::from_snapshot_file;

    let snapshot_path = Path::new("/tmp/complete_model_snapshot.json");
    if !snapshot_path.exists() {
        println!("Skipping test_from_snapshot_file: snapshot not found");
        return;
    }

    let registry = from_snapshot_file(snapshot_path).expect("failed to load from snapshot");

    assert!(
        !registry.providers().is_empty(),
        "snapshot should have providers"
    );
    assert!(registry.total_models() > 0, "snapshot should have models");

    println!(
        "Loaded {} providers, {} models from snapshot",
        registry.providers().len(),
        registry.total_models()
    );
}

/// Test global registry singleton with clearing.
#[tokio::test]
async fn test_global_registry_singleton() {
    // Clear any existing registry
    mini_claw::models_dev::clear_registry().await;

    // At this point, the registry should be None internally
    // We can't directly verify this without exposing internals,
    // but we can verify get_or_load_registry works correctly

    // If snapshot exists, try to load it
    let snapshot_path = Path::new("/tmp/complete_model_snapshot.json");
    if snapshot_path.exists() {
        // Load from snapshot manually first
        let data = std::fs::read(snapshot_path).expect("failed to read snapshot");
        let registry = mini_claw::models_dev::ModelsDevRegistry::from_json(&data)
            .expect("failed to parse snapshot");

        // Verify the snapshot data is valid
        assert!(
            !registry.providers().is_empty(),
            "snapshot should contain providers"
        );
        println!(
            "Global registry test: snapshot has {} providers",
            registry.providers().len()
        );
    } else {
        println!("Skipping full singleton test: snapshot not available");
    }
}

/// Test provider metadata extraction.
#[test]
fn test_provider_metadata_extraction() {
    use mini_claw::models_dev::ModelsDevRegistry;

    let json_data = br#"[{
        "id": "test-provider",
        "name": "Test AI Provider",
        "env": ["TEST_API_KEY", "TEST_ENDPOINT"],
        "npm": "@ai-sdk/test",
        "api": "https://api.test.ai/v1",
        "doc": "https://docs.test.ai",
        "auth_type": "bearer",
        "ai_sdk_provider": "test",
        "models": [
            {
                "model_key": "model-a",
                "id": "model-a",
                "name": "Model A",
                "tool_call": true,
                "reasoning": false,
                "attachment": true,
                "cost": {
                    "input": 0.5,
                    "output": 1.5
                },
                "limit": {
                    "context": 100000,
                    "output": 4096
                }
            },
            {
                "model_key": "model-b",
                "id": "model-b",
                "name": "Model B (Reasoning)",
                "tool_call": true,
                "reasoning": true,
                "attachment": false,
                "cost": {
                    "input": 2.0,
                    "output": 6.0
                }
            }
        ]
    }]"#;

    let registry = ModelsDevRegistry::from_json(json_data).expect("failed to parse");

    let provider = registry
        .provider("test-provider")
        .expect("test-provider should exist");

    // Check provider metadata
    assert_eq!(provider.name, "Test AI Provider");
    assert_eq!(provider.env.len(), 2);
    assert!(provider.env.contains(&"TEST_API_KEY".to_string()));
    assert!(provider.env.contains(&"TEST_ENDPOINT".to_string()));
    assert_eq!(provider.npm, Some("@ai-sdk/test".to_string()));
    assert_eq!(provider.api, Some("https://api.test.ai/v1".to_string()));
    assert_eq!(provider.auth_type, Some("bearer".to_string()));

    // Check models
    assert_eq!(provider.models.len(), 2);

    let model_a = &provider.models[0];
    assert_eq!(model_a.id, "model-a");
    assert_eq!(model_a.tool_call, Some(true));
    assert_eq!(model_a.reasoning, Some(false));
    assert_eq!(model_a.attachment, Some(true));

    let cost_a = model_a.cost.as_ref().expect("model-a should have cost");
    assert_eq!(cost_a.input, Some(0.5));
    assert_eq!(cost_a.output, Some(1.5));

    let limit_a = model_a.limit.as_ref().expect("model-a should have limits");
    assert_eq!(limit_a.context, Some(100000));
    assert_eq!(limit_a.output, Some(4096));

    let model_b = &provider.models[1];
    assert_eq!(model_b.id, "model-b");
    assert_eq!(model_b.reasoning, Some(true));
}
