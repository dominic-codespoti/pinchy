use std::path::{Path, PathBuf};

const MEMORY_FILE: &str = "MEMORY.md";
const USER_FILE: &str = "USER.md";

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum CuratedTarget {
    #[default]
    Memory,
    User,
}

impl CuratedTarget {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Memory => "memory",
            Self::User => "user",
        }
    }

    fn file_name(self) -> &'static str {
        match self {
            Self::Memory => MEMORY_FILE,
            Self::User => USER_FILE,
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::Memory => "# Curated Memory",
            Self::User => "# Curated User Context",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct CuratedEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub value: String,
}

pub struct CuratedStore {
    workspace: PathBuf,
}

impl CuratedStore {
    pub fn open(workspace: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(workspace)?;
        Ok(Self {
            workspace: workspace.to_path_buf(),
        })
    }

    pub fn list(&self, target: CuratedTarget) -> anyhow::Result<Vec<CuratedEntry>> {
        let path = self.path_for(target);
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(err) => return Err(err.into()),
        };
        Ok(parse_entries(&content))
    }

    pub fn save(
        &self,
        target: CuratedTarget,
        key: Option<&str>,
        value: &str,
    ) -> anyhow::Result<()> {
        let normalized_value = normalize_value(value)?;
        let normalized_key = normalize_key(key);
        let mut entries = self.list(target)?;

        if let Some(key) = normalized_key.as_deref() {
            entries.retain(|entry| entry.key.as_deref() != Some(key));
        }

        entries.push(CuratedEntry {
            key: normalized_key,
            value: normalized_value,
        });

        self.write_entries(target, &entries)
    }

    pub fn forget(&self, target: CuratedTarget, needle: &str) -> anyhow::Result<bool> {
        let needle =
            normalize_required_key(needle, "forget_memory requires a non-empty 'key' string")?;

        let mut entries = self.list(target)?;
        if let Some(index) = entries
            .iter()
            .position(|entry| entry.key.as_deref() == Some(needle.as_str()))
        {
            entries.remove(index);
            self.write_entries(target, &entries)?;
            return Ok(true);
        }

        let needle_lower = needle.to_lowercase();
        if let Some(index) = entries
            .iter()
            .position(|entry| entry.value.trim().to_lowercase() == needle_lower)
        {
            entries.remove(index);
            self.write_entries(target, &entries)?;
            return Ok(true);
        }

        Ok(false)
    }

    pub fn render(&self, target: CuratedTarget) -> anyhow::Result<String> {
        let entries = self.list(target)?;
        if entries.is_empty() {
            return Ok(String::new());
        }

        Ok(entries
            .iter()
            .map(render_entry)
            .collect::<Vec<_>>()
            .join("\n\n"))
    }

    fn write_entries(&self, target: CuratedTarget, entries: &[CuratedEntry]) -> anyhow::Result<()> {
        let path = self.path_for(target);
        let mut content = String::new();
        content.push_str(target.title());
        content.push_str("\n\n");

        if !entries.is_empty() {
            content.push_str(
                &entries
                    .iter()
                    .map(render_entry)
                    .collect::<Vec<_>>()
                    .join("\n\n"),
            );
            content.push('\n');
        }

        std::fs::write(path, content)?;
        Ok(())
    }

    fn path_for(&self, target: CuratedTarget) -> PathBuf {
        self.workspace.join(target.file_name())
    }
}

fn normalize_key(key: Option<&str>) -> Option<String> {
    key.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.replace(['\n', '\r'], " "))
        }
    })
}

fn normalize_required_key(key: &str, message: &str) -> anyhow::Result<String> {
    normalize_key(Some(key)).ok_or_else(|| anyhow::anyhow!(message.to_string()))
}

fn normalize_value(value: &str) -> anyhow::Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("curated memory entries require a non-empty 'value' string")
    }
    Ok(trimmed.to_string())
}

fn render_entry(entry: &CuratedEntry) -> String {
    let mut lines = entry.value.lines();
    let first_line = lines.next().unwrap_or_default();
    let mut rendered = if let Some(key) = entry.key.as_deref() {
        format!("- [key:{key}] {first_line}")
    } else {
        format!("- {first_line}")
    };

    for line in lines {
        rendered.push_str("\n  ");
        rendered.push_str(line);
    }

    rendered
}

fn parse_entries(content: &str) -> Vec<CuratedEntry> {
    let mut entries = Vec::new();
    let mut current: Option<CuratedEntry> = None;

    for line in content.lines() {
        if line.starts_with('#') && current.is_none() {
            continue;
        }
        if line.trim().is_empty() {
            continue;
        }

        if let Some(rest) = line.strip_prefix("- ") {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            current = Some(parse_entry_start(rest));
            continue;
        }

        if let Some(rest) = line.strip_prefix("  ") {
            if let Some(entry) = current.as_mut() {
                if !entry.value.is_empty() {
                    entry.value.push('\n');
                }
                entry.value.push_str(rest);
            }
            continue;
        }

        if let Some(entry) = current.as_mut() {
            if !entry.value.is_empty() {
                entry.value.push('\n');
            }
            entry.value.push_str(line.trim());
        }
    }

    if let Some(entry) = current {
        entries.push(entry);
    }

    entries
}

fn parse_entry_start(rest: &str) -> CuratedEntry {
    if let Some(after_prefix) = rest.strip_prefix("[key:") {
        if let Some((key, value)) = after_prefix.split_once("] ") {
            return CuratedEntry {
                key: normalize_key(Some(key)),
                value: value.trim().to_string(),
            };
        }

        if let Some(key) = after_prefix.strip_suffix(']') {
            return CuratedEntry {
                key: normalize_key(Some(key)),
                value: String::new(),
            };
        }
    }

    CuratedEntry {
        key: None,
        value: rest.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (tempfile::TempDir, CuratedStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = CuratedStore::open(dir.path()).unwrap();
        (dir, store)
    }

    #[test]
    fn save_and_list_curated_memory() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, Some("timezone"), "User is in UTC")
            .unwrap();

        let entries = store.list(CuratedTarget::Memory).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key.as_deref(), Some("timezone"));
        assert_eq!(entries[0].value, "User is in UTC");
    }

    #[test]
    fn save_without_key_appends() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::User, None, "Prefers concise replies")
            .unwrap();

        let entries = store.list(CuratedTarget::User).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key, None);
    }

    #[test]
    fn save_with_same_key_replaces_existing_entry() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, Some("goal"), "First goal")
            .unwrap();
        store
            .save(CuratedTarget::Memory, Some("goal"), "Second goal")
            .unwrap();

        let entries = store.list(CuratedTarget::Memory).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].value, "Second goal");
    }

    #[test]
    fn forget_prefers_key_match() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, Some("timezone"), "User is in UTC")
            .unwrap();

        assert!(store.forget(CuratedTarget::Memory, "timezone").unwrap());
        assert!(store.list(CuratedTarget::Memory).unwrap().is_empty());
    }

    #[test]
    fn forget_falls_back_to_text_match() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, None, "User likes blue themes")
            .unwrap();

        assert!(store
            .forget(CuratedTarget::Memory, "User likes blue themes")
            .unwrap());
        assert!(store.list(CuratedTarget::Memory).unwrap().is_empty());
    }

    #[test]
    fn forget_does_not_delete_by_substring() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, None, "User likes blue themes")
            .unwrap();

        assert!(!store.forget(CuratedTarget::Memory, "blue themes").unwrap());
        assert_eq!(store.list(CuratedTarget::Memory).unwrap().len(), 1);
    }

    #[test]
    fn forget_value_match_deletes_only_one_duplicate() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, None, "Duplicate entry")
            .unwrap();
        store
            .save(CuratedTarget::Memory, None, "Duplicate entry")
            .unwrap();

        assert!(store
            .forget(CuratedTarget::Memory, "Duplicate entry")
            .unwrap());

        let entries = store.list(CuratedTarget::Memory).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].value, "Duplicate entry");
    }

    #[test]
    fn render_returns_bulleted_entries() {
        let (_dir, store) = temp_store();
        store
            .save(CuratedTarget::Memory, Some("goal"), "Build a robot")
            .unwrap();

        let rendered = store.render(CuratedTarget::Memory).unwrap();
        assert!(rendered.contains("- [key:goal] Build a robot"));
    }
}
