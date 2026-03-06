---
name: backlog
description: "View learning backlog and show progress. Use when the user asks 'what's left to learn', 'show my progress', 'learning todo', or wants to check remaining topics in their study plan."
argument-hint: "[category]"
disable-model-invocation: true
plugin-version: "__PLUGIN_VERSION__"
---

# Backlog Skill

View learning backlog + summarize progress (read-only).

## MCP Tools

- `til_backlog_status`: Overall/per-category progress (includes sections when category is specified)

## Workflow

### No arguments (`/backlog`)

1. Call `til_backlog_status` (fall back to `./til/*/backlog.md` Glob if MCP unavailable)
2. If no backlog found, show `/research` guidance and exit
3. Summarize as table: category (link), progress, completed count, last activity date, progress bar

### With arguments (`/backlog category`)

1. Pass category to `til_backlog_status` → use sections
2. Output per section:
   - `## {heading} ({completed}/{total})`
   - `- (x) [{displayName}]({path})` / `- ( ) [{displayName}]({path})`
   - Do not use `- [ ]`/`- [x]` markdown checkboxes (not rendered in terminal)

## Output Rules

- All category/item names as `[display name](path)` markdown links
- Do not expose raw paths
- Progress bar: 10 slots (`█` completed, `░` incomplete)
- Do not modify backlog files (read-only)
