//! Tests for the tool metadata registry.

use mini_claw::tools;

/// Ensure `init()` registers the three builtin tools and `list_tools()` returns them.
#[test]
fn list_tools_returns_builtins() {
    // init() is idempotent — safe to call more than once.
    tools::init();

    let metas = tools::list_tools();
    let names: Vec<&str> = metas.iter().map(|m| m.name.as_str()).collect();

    assert!(names.contains(&"read_file"), "missing read_file");
    assert!(names.contains(&"write_file"), "missing write_file");
    assert!(names.contains(&"exec_shell"), "missing exec_shell");
    assert!(
        metas.len() >= 3,
        "expected at least 3 tools, got {}",
        metas.len()
    );
}

/// Each tool's `args_schema` must be a valid JSON Schema object
/// (at minimum: has `"type": "object"` and a `"properties"` key).
#[test]
fn tool_schemas_are_valid_json_schema_objects() {
    tools::init();

    for meta in tools::list_tools() {
        assert!(
            meta.args_schema.is_object(),
            "{}: args_schema is not a JSON object",
            meta.name
        );

        let obj = meta.args_schema.as_object().unwrap();

        assert_eq!(
            obj.get("type").and_then(|v| v.as_str()),
            Some("object"),
            "{}: args_schema.type must be \"object\"",
            meta.name
        );

        assert!(
            obj.contains_key("properties"),
            "{}: args_schema must have a \"properties\" key",
            meta.name
        );

        // properties must itself be an object
        assert!(
            obj["properties"].is_object(),
            "{}: args_schema.properties must be an object",
            meta.name
        );
    }
}

/// Descriptions should be non-empty.
#[test]
fn tool_descriptions_non_empty() {
    tools::init();

    for meta in tools::list_tools() {
        assert!(
            !meta.description.is_empty(),
            "{}: description must not be empty",
            meta.name
        );
    }
}

/// `register_tool` ignores duplicates (first registration wins).
#[test]
fn duplicate_registration_ignored() {
    tools::init();

    let before = tools::list_tools().len();

    // Try to re-register read_file with a different description.
    tools::register_tool(tools::ToolMeta {
        name: "read_file".into(),
        description: "DUPLICATE".into(),
        args_schema: serde_json::json!({}),
    });

    let after = tools::list_tools();
    assert_eq!(after.len(), before, "duplicate should not add a new entry");

    let rf = after.iter().find(|t| t.name == "read_file").unwrap();
    assert_ne!(rf.description, "DUPLICATE", "first registration should win");
}

/// `ToolMeta` round-trips through serde_json.
#[test]
fn tool_meta_serde_roundtrip() {
    tools::init();

    let metas = tools::list_tools();
    let json = serde_json::to_string(&metas).expect("serialize");
    let back: Vec<tools::ToolMeta> = serde_json::from_str(&json).expect("deserialize");

    assert_eq!(back.len(), metas.len());
    for (a, b) in metas.iter().zip(back.iter()) {
        assert_eq!(a.name, b.name);
        assert_eq!(a.description, b.description);
        assert_eq!(a.args_schema, b.args_schema);
    }
}

// ── search_tools_registry normalization tests ────────────────

/// Helper: collect result names from a search.
fn search_names(query: &str) -> Vec<String> {
    tools::init();
    tools::search_tools_registry(query, 20)
        .into_iter()
        .map(|m| m.name)
        .collect()
}

/// Core tools are returned by list_tools_core, deferred ones are not.
#[test]
fn list_tools_core_excludes_deferred() {
    tools::init();
    let core = tools::list_tools_core();
    let all = tools::list_tools();

    let core_names: Vec<&str> = core.iter().map(|m| m.name.as_str()).collect();
    assert!(core_names.contains(&"read_file"), "core should have read_file");
    assert!(core_names.contains(&"search_tools"), "core should have search_tools");
    assert!(!core_names.contains(&"list_agents"), "deferred tool should not be in core");
    assert!(!core_names.contains(&"create_cron_job"), "deferred tool should not be in core");
    assert!(all.len() > core.len(), "total should exceed core");
}

/// search_tools_registry is case-insensitive.
#[test]
fn search_case_insensitive() {
    let lower = search_names("agent");
    let upper = search_names("AGENT");
    let mixed = search_names("Agent");

    assert!(!lower.is_empty(), "should find agent tools");
    assert_eq!(lower, upper, "case should not matter");
    assert_eq!(lower, mixed, "case should not matter");
}

/// Plural forms match singular tool names (e.g. "agents" → "list_agents").
#[test]
fn search_plural_stemming() {
    let results = search_names("agents");
    assert!(
        results.iter().any(|n| n.contains("agent")),
        "plural 'agents' should match agent tools, got: {:?}",
        results
    );
}

/// "schedule" should find cron tools via synonym expansion.
#[test]
fn search_synonym_schedule_finds_cron() {
    let results = search_names("schedule");
    assert!(
        results.iter().any(|n| n.contains("cron")),
        "'schedule' should match cron tools via synonyms, got: {:?}",
        results
    );
}

/// "remember" should find memory tools via synonym expansion.
#[test]
fn search_synonym_remember_finds_memory() {
    let results = search_names("remember");
    assert!(
        results.iter().any(|n| n.contains("memory")),
        "'remember' should match memory tools via synonyms, got: {:?}",
        results
    );
}

/// Underscore-split matching: "job" should match "cron_job" tools.
#[test]
fn search_underscore_token_split() {
    let results = search_names("job");
    assert!(
        results.iter().any(|n| n.contains("cron")),
        "'job' should match cron_job tools, got: {:?}",
        results
    );
}

/// "sessions" (plural) should find session tools.
#[test]
fn search_sessions_plural() {
    let results = search_names("sessions");
    assert!(
        results.iter().any(|n| n.contains("session")),
        "'sessions' should match session tools, got: {:?}",
        results
    );
}
