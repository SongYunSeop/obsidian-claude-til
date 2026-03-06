---
name: save
description: "Save learning content as a TIL file and batch-update Daily notes, MOC, and backlog. Use when the user says 'save this', 'write up what I learned', 'document this as a TIL', or wants to persist a learning conversation as a note."
argument-hint: "[topic] [category]"
plugin-version: "__PLUGIN_VERSION__"
---

# Save Skill

Learning conversation → Save TIL file → Update Daily/MOC/backlog → Review document → Commit.

## MCP Tools

- `til_get_context`: Find related TILs and backlog items
- `til_list`: Check for duplicate existing TILs
- `til_save_note`: Save TIL note (server guarantees frontmatter/path rules, auto_check_backlog auto-checks backlog)
- `vault_get_active_file`: User file context

## Step 1: Check Context

1. Identify topic and category. Ask the user if unclear.
2. Use `Read` to check if `til/{category}/{slug}.md` exists.

## Step 2: Identify Link Candidates

1. Use `til_get_context` or MOC/backlog to find existing TILs and backlog items
2. Existing TIL/backlog items → use markdown links in the body
3. Concepts that don't exist → confirm with user, then add only to related notes

## Step 3: Save TIL File

Path: `./til/{category}/{topic-slug}.md` (slug: lowercase English with hyphens)

**Save new file**: Save using the `til_save_note` MCP tool. The server guarantees frontmatter (title, date, category, tags, aliases) and path rules.

```
til_save_note(category, slug, title, content, tags, date, fmCategory, aliases, auto_check_backlog: true)
```

- `date`: Get local time via `date +%Y-%m-%dT%H:%M:%S` command and pass it
- `tags`: Must include "til"
- `aliases`: ["Korean title", "English title"]
- `content`: Body markdown excluding frontmatter

**When a file with the same slug exists** (detected by `Read` in Step 1):
- Auto-merge only when continuing a `/til` follow-up session (preserve existing content + reinforce, add `updated`)
- Otherwise: ask user to confirm merge or overwrite
- For merge: use Read→Edit directly on existing content instead of `til_save_note`

### TIL Body Template

Read `references/templates.md` for the exact TIL body, Daily note, and MOC templates.

- Links: `[display name](til/{category}/{slug}.md)` — no `[[wiki links]]`

## Step 4: Update Related Files

Update the following 3 files **directly** in sequence (no subagents — parallel edits can race and corrupt shared files like MOC):

1. Daily note (`./Daily/YYYY-MM-DD.md`): Add TIL link by category (create if not exists)
2. TIL MOC (`./til/TIL MOC.md`): Add item to category section (create if not exists)
3. Backlog: Already handled by `til_save_note`'s `auto_check_backlog: true` (no separate call needed)

Daily/MOC: Read → find position → Edit. Create file if not exists.

## Step 5: Document Review

Display full saved TIL content → use `AskUserQuestion` to confirm ("Looks good" / "Needs revision").

## Step 6: Register for Review

Ask via `AskUserQuestion`: "Would you like to add this TIL to spaced repetition review?"
If user agrees, call `til_review_update` (action: "review", grade: 4) to create SRS metadata.

## Step 7: git commit

`📝 til: {English title}({Korean title}) - {category}` (no push)

## Rules

- frontmatter required: date, category, tags, aliases (fill in any missing fields before saving)
- tags must include "til" (used to filter TILs on the static site)
- No `[[wiki links]]` — use `[display name](path)` format only (links must work in static sites and non-Obsidian editors)
- Always update Daily/MOC/backlog after saving the TIL
- Use callouts: `> [!tldr]`, `> [!example]`, `> [!warning]`, `> [!tip]`
- Visualize complex concepts with Mermaid diagrams (max 1 per TIL)
- Use placeholder values for sensitive information (avoid leaking real credentials)
