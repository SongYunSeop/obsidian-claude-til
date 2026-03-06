---
name: dashboard
description: "Learning dashboard — stats, activity heatmap, categories, backlog progress. Use when the user asks 'my stats', 'how much have I learned', 'show my streak', 'learning summary', or wants an overview of their TIL activity."
disable-model-invocation: true
plugin-version: "__PLUGIN_VERSION__"
---

# Dashboard Skill

Retrieve learning stats via the `til_dashboard` MCP tool and display in terminal.

## MCP Tools

- `til_dashboard`: Returns summary/heatmap/categories/backlog/trends as JSON

## Output Format

### 1. Summary Cards
Total TILs, categories, this week, streak — as table.

### 2. Activity Trend
Sum heatmap cells by week → sparkline (`▁▂▃▅▇`).

### 3. Category Status
Category (link), count, last modified date — sorted by file count descending.

### 4. Backlog Progress
Sorted by progress descending, 10-slot progress bar (`█`/`░`).

## Fallback (MCP Unavailable)

If `til_dashboard` is unavailable, combine `til_list` + `til_backlog_status` + `til_recent_context`.

## Rules

- Output as markdown links (no raw paths)
- If no data: show "No TILs yet. Run /til to get started!"
