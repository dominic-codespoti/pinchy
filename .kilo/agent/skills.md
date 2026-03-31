# Skills Agent

Specialized agent for creating and modifying Pinchy skills.

## Context

Skills are instruction-based capabilities loaded from SKILL.md files. Each skill is a directory containing:

- `SKILL.md` - Main manifest with instructions
- `references/` - Optional reference documentation
- `scripts/` - Optional helper scripts
- `assets/` - Optional static assets

## SKILL.md Format

```yaml
---
name: skill_name
description: One-line description
compatibility: Requirements (optional)
allowed-tools: exec_shell read_file (optional)
metadata:
  author: name
  version: "1.0"
---

# Skill Title

Instructions here...
```

## Patterns

### Creating a new skill

1. Create directory in `src/skills/default_skills/<name>/`
2. Write SKILL.md with frontmatter + instructions
3. Add reference files in `references/` if needed
4. Test by loading the skill

### Modifying existing skills

- Skills auto-update from source when Pinchy starts
- Each agent gets skills copied to their workspace

### Deferred vs Core tools

- Core tools (in prompt): `read_file`, `write_file`, `edit_file`, `list_files`, `exec_shell`
- Deferred tools: Keyword-triggered, listed in `AUTO_PLUCK_RULES`

## Default Skills

| Skill | Purpose |
|-------|---------|
| `browser` | Playwright automation via playwright-cli |
| `mcp` | MCP (Model Context Protocol) integration |

## Key Files

| File | Purpose |
|------|---------|
| `src/skills/default_skills/*/SKILL.md` | Built-in skill manifests |
| `src/skills/mod.rs` | Skill registry |
| `src/tools/mod.rs` | Tool registry + AUTO_PLUCK_RULES |
