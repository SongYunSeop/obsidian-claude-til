---
name: til
description: "Today I Learned — research a topic, learn interactively, then save as TIL markdown. Use when the user wants to learn about a topic, says 'teach me', 'what is X', 'deep dive into X', or asks to study something and save it as a TIL note."
argument-hint: "<topic> [category]"
plugin-version: "__PLUGIN_VERSION__"
---

# TIL Skill

Topic research → Interactive learning → Save TIL.

## MCP Tools

- `til_list`: Check existing TILs (detect same/similar topics)
- `til_get_context`: Find related TILs and backlog items, link candidates
- `vault_get_active_file`: Check the file the user is currently viewing

## Phase 1: Topic Research

1. Use `Read` to check if `til/{category}/{slug}.md` exists → if so, offer to expand the existing TIL or start a new topic
2. Use `til_get_context` to check existing TILs. Fall back to `til_list` if MCP is unavailable
   - When learning a backlog item, call `til_backlog_status`(category) → reference `sections[].items[].sourceUrls`
     - 1 URL: fetch directly with `WebFetch`
     - 2+ URLs: pass all URLs to a single `til-fetcher` subagent
3. If no existing TIL is found, research the topic via web search
4. Collect key concepts, examples, and references → summarize

## Phase 2: Interactive Learning

1. Explain based on research results
2. Follow-up mode: focus on new perspectives; do not repeat existing content
3. Answer user questions
4. Move to Phase 3 only when the user explicitly requests to save

## Phase 3: Save

Follow `/save` skill rules to save. In follow-up mode, merge into the existing file (add `updated` date).

## Arguments

- First: learning topic (required)
- Second: category (optional, automatically detected if omitted)

## Rules

- Links: `[display name](til/{category}/{slug}.md)` — no `[[wiki links]]` (links must work in static sites and non-Obsidian editors)
- Use placeholder values for sensitive information (example.com, your-api-key) to avoid leaking real credentials
