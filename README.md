# Claude TIL

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.5.0+-7C3AED)](https://obsidian.md)
[![Version](https://img.shields.io/github/v/release/SongYunSeop/obsidian-claude-til)](https://github.com/SongYunSeop/obsidian-claude-til/releases)

**English** | [한국어](README.ko.md)

An Obsidian plugin that embeds a Claude Code terminal in the sidebar and provides an AI-powered TIL (Today I Learned) learning workflow.

![Claude TIL — Terminal + TIL note](docs/screenshots/terminal-til.png)

## Features

- **Embedded Terminal** — Claude Code terminal in Obsidian sidebar (xterm.js + node-pty)
- **Built-in MCP Server** — Claude Code can directly access your vault via HTTP
- **Learning Dashboard** — TIL statistics and category breakdown at a glance
- **Auto-installed Skills** — `/til`, `/research`, `/backlog`, `/save` commands ready out of the box
- **Markdown Link Detection** — `[text](path)` links in terminal are clickable and open notes (CJK-aware)
- **Backlog-to-TIL Trigger** — Click an empty backlog link to start a TIL session
- **File Watcher** — Newly created TIL files open automatically in the editor

## How It Works

```
Command Palette → Open Terminal → Claude Code starts
→ Run /til, /backlog, /research, /save skills
→ Claude researches → interactive learning → saves TIL markdown
→ New file detected → opens in editor
```

## Getting Started

### Prerequisites

- [Obsidian](https://obsidian.md) v1.5.0+
- [Node.js](https://nodejs.org) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`)

### Installation

#### Option A: Claude Code (Recommended)

```bash
git clone https://github.com/SongYunSeop/obsidian-claude-til.git
cd obsidian-claude-til
claude
# Then run: /install-plugin /path/to/your/vault
```

Claude Code automatically detects Electron version and handles native module rebuilding.

#### Option B: Manual

```bash
git clone https://github.com/SongYunSeop/obsidian-claude-til.git
cd obsidian-claude-til
npm install
ELECTRON_VERSION=<your-electron-version> npm run deploy -- /path/to/your/vault
```

> To find your Electron version, open Obsidian's Developer Tools (Ctrl+Shift+I) and run `process.versions.electron`.

Restart Obsidian, then enable **Claude TIL** in Settings > Community plugins.

### MCP Server Setup (Optional)

The plugin runs an HTTP-based MCP server so Claude Code can access your vault directly:

```bash
claude mcp add --transport http claude-til http://localhost:22360/mcp
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Shell Path | System default | Shell to use in the terminal |
| Auto Launch Claude | `true` | Run `claude` when terminal opens |
| Resume Last Session | `false` | Resume previous Claude session (`--continue`) |
| Font Size | `13` | Terminal font size (px) |
| Auto Open New TIL | `true` | Open new TIL files in editor automatically |
| MCP Server | `true` | Enable built-in MCP server |
| MCP Port | `22360` | MCP server port |

## MCP Tools

When the MCP server is connected, Claude Code can use these tools:

| Tool | Description |
|------|-------------|
| `vault_read_note` | Read note content by path |
| `vault_list_files` | List files in a folder with optional filtering |
| `vault_search` | Full-text search across the vault |
| `vault_get_active_file` | Get the currently open file |
| `til_list` | List TIL files grouped by category |
| `til_backlog_status` | Backlog progress summary with checkbox counts |
| `til_get_context` | Get existing knowledge context for a topic (files, links, unresolved mentions) |
| `til_recent_context` | Recent learning activity grouped by date |

## Claude Skills

The plugin auto-installs these skills to `.claude/skills/`:

| Skill | Command | Description |
|-------|---------|-------------|
| **til** | `/til <topic> [category]` | Research a topic → interactive learning → save TIL |
| **research** | `/research <topic> [category]` | Research a topic and create a learning backlog |
| **backlog** | `/backlog [category]` | View learning backlog and progress |
| **save** | *(auto-invoked by /til)* | Save TIL markdown with Daily note, MOC, and backlog updates |

## Development

```bash
npm run dev              # Watch mode (esbuild)
npm test                 # Run tests (vitest)
npm run rebuild-pty      # Rebuild node-pty for Obsidian's Electron
npm run deploy -- /path  # Deploy to vault
npm run deploy -- --refresh-skills /path  # Deploy with skill/rule refresh
```

### Project Structure

```
src/
├── main.ts                  # Plugin entry point
├── settings.ts              # Settings tab & interface
├── skills.ts                # Skill/rule auto-installer
├── watcher.ts               # File watcher → open in editor
├── backlog.ts               # Backlog parsing (pure functions)
├── terminal/
│   ├── TerminalView.ts      # Sidebar terminal (ItemView + xterm.js)
│   ├── MarkdownLinkProvider.ts  # [text](path) detection + click-to-open (CJK-aware)
│   └── pty.ts               # PTY process manager (node-pty)
├── mcp/
│   ├── server.ts            # MCP server lifecycle (Streamable HTTP)
│   ├── tools.ts             # MCP tool definitions
│   └── context.ts           # Learning context helpers (pure functions)
└── dashboard/
    ├── DashboardView.ts     # Learning dashboard (ItemView)
    └── stats.ts             # TIL statistics
```

### Tech Stack

| | |
|---|---|
| **Runtime** | TypeScript, Obsidian Plugin API |
| **Terminal** | xterm.js, node-pty |
| **MCP** | @modelcontextprotocol/sdk |
| **Build** | esbuild |
| **Test** | vitest |

## Roadmap

- [x] Embedded Claude Code terminal
- [x] Built-in MCP server
- [x] Learning dashboard (basic stats)
- [ ] Backlog progress bars in dashboard
- [ ] Configurable TIL folder path
- [ ] Rich dashboard — recent TILs, streaks, weekly summary
- [ ] Dynamic code blocks (`til-moc`, `til-daily`) — auto-render TIL lists without Dataview
- [ ] Multi-terminal tabs — run multiple Claude Code sessions
- [ ] Note linking — auto-insert backlinks to related notes

## Acknowledgments

- [claude-code-terminal](https://github.com/dternyak/claude-code-terminal) — Original xterm.js + node-pty Obsidian integration pattern
- [Obsidian Developer Docs](https://docs.obsidian.md/Home)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

[MIT](LICENSE)
