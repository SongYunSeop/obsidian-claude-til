---
name: setup-obsidian
description: "Install or update the Oh My TIL plugin in an Obsidian vault"
plugin-version: "__PLUGIN_VERSION__"
---

# setup-obsidian

Install or update the Oh My TIL Obsidian plugin in the current directory.

## Prerequisites

- The current directory must have an `.obsidian/` folder (Obsidian vault)
- If not found, notify the user and stop

## How to Run

Run the following command:

```bash
npx oh-my-til install-obsidian "$(pwd)"
```

This installs **only** the Obsidian desktop plugin (main.js, manifest.json, styles.css, node-pty). It does NOT install skills, agents, or CLAUDE.md — those are managed by the Claude Code Plugin.

## After Completion

- Summarize the installation result for the user
- Guide the user to restart Obsidian and enable **Oh My TIL** under Settings > Community plugins
- If already installed, inform the user it has been updated
