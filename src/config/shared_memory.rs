//! Shared memory configuration structures.
//!
//! Provides config-based ACL for shared memory namespaces.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Shared memory configuration.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct SharedMemoryConfig {
    /// Master feature flag — when `false`, shared memory is disabled.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Memory budget allocation for shared memory in context.
    #[serde(default)]
    pub memory_budget: MemoryBudgetConfig,

    /// Namespace ACL definitions.
    #[serde(default)]
    pub namespaces: HashMap<String, NamespaceAcl>,

    /// Default namespaces agents can read.
    #[serde(default)]
    pub default_read_namespaces: Vec<String>,

    /// Maximum entry size in bytes (default: 64KB).
    #[serde(default = "default_max_entry_size")]
    pub max_entry_size: usize,

    /// Maximum entries per agent (default: 1000).
    #[serde(default = "default_max_entries_per_agent")]
    pub max_entries_per_agent: usize,

    /// Rate limit: writes per hour per agent (default: 100).
    #[serde(default = "default_rate_limit_writes_per_hour")]
    pub rate_limit_writes_per_hour: u32,

    /// Audit log retention period in days (default: 90).
    /// Older audit log entries are automatically purged on startup.
    #[serde(default = "default_audit_log_retention_days")]
    pub audit_log_retention_days: u32,
}

impl Default for SharedMemoryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            memory_budget: MemoryBudgetConfig::default(),
            namespaces: HashMap::new(),
            default_read_namespaces: Vec::new(),
            max_entry_size: 65536,
            max_entries_per_agent: 1000,
            rate_limit_writes_per_hour: 100,
            audit_log_retention_days: 90,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_max_entry_size() -> usize {
    65536 // 64KB
}

fn default_max_entries_per_agent() -> usize {
    1000
}

fn default_rate_limit_writes_per_hour() -> u32 {
    100
}

fn default_audit_log_retention_days() -> u32 {
    90
}

/// Memory budget configuration.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct MemoryBudgetConfig {
    /// Percentage of context budget allocated to shared memory (default: 20%).
    #[serde(default = "default_percent_of_context")]
    pub percent_of_context: u8,

    /// Hard cap percentage even when private memory is empty (default: 50%).
    #[serde(default = "default_max_percent")]
    pub max_percent: u8,
}

impl Default for MemoryBudgetConfig {
    fn default() -> Self {
        Self {
            percent_of_context: 20,
            max_percent: 50,
        }
    }
}

fn default_percent_of_context() -> u8 {
    20
}

fn default_max_percent() -> u8 {
    50
}

/// Namespace access control list.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema, Default)]
pub struct NamespaceAcl {
    /// Agents allowed to read from this namespace.
    /// Use `"*"` to allow all agents.
    /// Use patterns like `"agent:backend-*"` for wildcard matching.
    #[serde(default)]
    pub read: Vec<String>,

    /// Agents allowed to write to this namespace.
    /// More restrictive than read by default.
    #[serde(default)]
    pub write: Vec<String>,
}

impl SharedMemoryConfig {
    /// Check if an agent can read from a namespace.
    pub fn can_read(&self, agent_id: &str, namespace: &str) -> bool {
        if !self.enabled {
            return false;
        }

        // Normalize namespace for lookup
        let normalized = crate::memory::shared::SharedMemoryStore::normalize_namespace(namespace);

        // Check specific namespace ACL
        if let Some(acl) = self.namespaces.get(&normalized) {
            return Self::matches_agent(agent_id, &acl.read);
        }

        // Check if namespace matches a parent prefix
        for (ns_pattern, acl) in &self.namespaces {
            if normalized.starts_with(ns_pattern) {
                return Self::matches_agent(agent_id, &acl.read);
            }
        }

        // Check default namespaces
        self.default_read_namespaces.iter().any(|ns| {
            crate::memory::shared::SharedMemoryStore::normalize_namespace(ns) == normalized
        })
    }

    /// Check if an agent can write to a namespace.
    pub fn can_write(&self, agent_id: &str, namespace: &str) -> bool {
        if !self.enabled {
            return false;
        }

        let normalized = crate::memory::shared::SharedMemoryStore::normalize_namespace(namespace);

        // Check specific namespace ACL
        if let Some(acl) = self.namespaces.get(&normalized) {
            return Self::matches_agent(agent_id, &acl.write);
        }

        // Check if namespace matches a parent prefix
        for (ns_pattern, acl) in &self.namespaces {
            if normalized.starts_with(ns_pattern) {
                return Self::matches_agent(agent_id, &acl.write);
            }
        }

        // Default: deny write unless explicitly allowed
        false
    }

    /// List all namespaces an agent can read from.
    ///
    /// Returns a list of namespace strings the agent has read access to,
    /// including wildcard/prefix pattern matches and default namespaces.
    ///
    /// # Arguments
    /// * `agent_id` - The agent identifier to check permissions for
    ///
    /// # Returns
    /// Vec of namespace strings the agent can read from
    pub fn list_readable_namespaces(&self, agent_id: &str) -> Vec<String> {
        if !self.enabled {
            return Vec::new();
        }

        let mut readable = Vec::new();

        // Check configured namespaces
        for (namespace, acl) in &self.namespaces {
            if Self::matches_agent(agent_id, &acl.read) {
                readable.push(namespace.clone());
            }
        }

        // Add default namespaces if agent can read them
        for ns in &self.default_read_namespaces {
            let normalized = crate::memory::shared::SharedMemoryStore::normalize_namespace(ns);
            if !readable.contains(&normalized) {
                readable.push(normalized);
            }
        }

        readable.sort();
        readable.dedup();
        readable
    }

    /// Check if agent matches any pattern in the allowlist.
    fn matches_agent(agent_id: &str, patterns: &[String]) -> bool {
        for pattern in patterns {
            if pattern == "*" {
                return true;
            }
            if pattern == agent_id {
                return true;
            }
            if pattern.ends_with('*') {
                let prefix = &pattern[..pattern.len() - 1];
                if agent_id.starts_with(prefix) {
                    return true;
                }
            }
        }
        false
    }

    /// Validate content size against limits.
    pub fn validate_content_size(&self, content: &str) -> Result<(), String> {
        let size = content.len();
        if size > self.max_entry_size {
            return Err(format!(
                "content size {} exceeds maximum {} bytes",
                size, self.max_entry_size
            ));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acl_exact_match() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["agent:core".to_string()];
        config.namespaces.insert("public/docs".to_string(), acl);

        assert!(config.can_read("agent:core", "public/docs"));
        assert!(!config.can_read("agent:other", "public/docs"));
    }

    #[test]
    fn acl_wildcard_pattern() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["agent:backend-*".to_string()];
        config.namespaces.insert("team/eng".to_string(), acl);

        assert!(config.can_read("agent:backend-lead", "team/eng"));
        assert!(config.can_read("agent:backend-worker-1", "team/eng"));
        assert!(!config.can_read("agent:frontend-lead", "team/eng"));
    }

    #[test]
    fn acl_star_allows_all() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["*".to_string()];
        config.namespaces.insert("public".to_string(), acl);

        assert!(config.can_read("any-agent", "public"));
        assert!(config.can_read("agent:core", "public"));
    }

    #[test]
    fn acl_write_more_restrictive() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["*".to_string()];
        acl.write = vec!["agent:admin".to_string()];
        config.namespaces.insert("public".to_string(), acl);

        assert!(config.can_read("agent:any", "public"));
        assert!(!config.can_write("agent:any", "public"));
        assert!(config.can_write("agent:admin", "public"));
    }

    #[test]
    fn acl_disabled_blocks_all() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = false;

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["*".to_string()];
        acl.write = vec!["*".to_string()];
        config.namespaces.insert("public".to_string(), acl);

        assert!(!config.can_read("any", "public"));
        assert!(!config.can_write("any", "public"));
    }

    #[test]
    fn content_size_validation() {
        let mut config = SharedMemoryConfig::default();
        config.max_entry_size = 100;

        assert!(config.validate_content_size("short").is_ok());

        let long_content = "a".repeat(101);
        assert!(config.validate_content_size(&long_content).is_err());
    }

    #[test]
    fn list_readable_namespaces_basic() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;

        // Add some namespaces with different permissions
        let mut public_acl = NamespaceAcl::default();
        public_acl.read = vec!["*".to_string()];
        config.namespaces.insert("public".to_string(), public_acl);

        let mut team_acl = NamespaceAcl::default();
        team_acl.read = vec![
            "agent:backend-*".to_string(),
            "agent:frontend-lead".to_string(),
        ];
        config.namespaces.insert("team/eng".to_string(), team_acl);

        let mut private_acl = NamespaceAcl::default();
        private_acl.read = vec!["agent:admin".to_string()];
        config
            .namespaces
            .insert("private/admin".to_string(), private_acl);

        // All agents should see public
        let all_readable = config.list_readable_namespaces("agent:any");
        assert!(all_readable.contains(&"public".to_string()));
        assert!(!all_readable.contains(&"team/eng".to_string()));
        assert!(!all_readable.contains(&"private/admin".to_string()));

        // Backend agents should see public and team/eng
        let backend_readable = config.list_readable_namespaces("agent:backend-worker");
        assert!(backend_readable.contains(&"public".to_string()));
        assert!(backend_readable.contains(&"team/eng".to_string()));
        assert!(!backend_readable.contains(&"private/admin".to_string()));

        // Frontend lead should see public and team/eng
        let frontend_readable = config.list_readable_namespaces("agent:frontend-lead");
        assert!(frontend_readable.contains(&"public".to_string()));
        assert!(frontend_readable.contains(&"team/eng".to_string()));
        assert!(!frontend_readable.contains(&"private/admin".to_string()));

        // Admin should see all
        let admin_readable = config.list_readable_namespaces("agent:admin");
        assert!(admin_readable.contains(&"public".to_string()));
        assert!(!admin_readable.contains(&"team/eng".to_string()));
        assert!(admin_readable.contains(&"private/admin".to_string()));
    }

    #[test]
    fn list_readable_namespaces_with_defaults() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;
        config.default_read_namespaces = vec!["shared/docs".to_string(), "public".to_string()];

        // Agent should see default namespaces
        let readable = config.list_readable_namespaces("agent:any");
        assert!(readable.contains(&"shared/docs".to_string()));
        assert!(readable.contains(&"public".to_string()));
    }

    #[test]
    fn list_readable_namespaces_disabled() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = false;

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["*".to_string()];
        config.namespaces.insert("public".to_string(), acl);

        // When disabled, should return empty list
        let readable = config.list_readable_namespaces("agent:any");
        assert!(readable.is_empty());
    }

    #[test]
    fn list_readable_namespaces_dedup() {
        let mut config = SharedMemoryConfig::default();
        config.enabled = true;
        config.default_read_namespaces = vec!["public".to_string()];

        let mut acl = NamespaceAcl::default();
        acl.read = vec!["*".to_string()];
        config.namespaces.insert("public".to_string(), acl);

        // public appears in both defaults and namespaces, should be deduped
        let readable = config.list_readable_namespaces("agent:any");
        assert_eq!(readable.len(), 1);
        assert_eq!(readable[0], "public");
    }

    #[test]
    fn memory_budget_defaults() {
        let budget = MemoryBudgetConfig::default();
        assert_eq!(budget.percent_of_context, 20);
        assert_eq!(budget.max_percent, 50);
    }

    #[test]
    fn audit_log_retention_days_default() {
        let config = SharedMemoryConfig::default();
        assert_eq!(config.audit_log_retention_days, 90);
    }

    #[test]
    fn audit_log_retention_can_be_customized() {
        let config = SharedMemoryConfig {
            audit_log_retention_days: 30,
            ..SharedMemoryConfig::default()
        };
        assert_eq!(config.audit_log_retention_days, 30);
    }

    #[test]
    fn audit_log_retention_zero_disables_cleanup() {
        let config = SharedMemoryConfig {
            audit_log_retention_days: 0,
            ..SharedMemoryConfig::default()
        };
        assert_eq!(config.audit_log_retention_days, 0);
    }
}
