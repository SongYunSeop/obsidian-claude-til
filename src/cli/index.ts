import { FsStorage, FsMetadata } from "../adapters/fs-adapter";
import { TILMcpServer } from "../mcp/server";
import { installSkills } from "../skills-install";
import { installObsidianPlugin } from "./obsidian-install";
import { parseArgs, expandTilde } from "../core/cli";
import * as path from "path";
import * as fs from "fs";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0";

function printUsage(): void {
	console.log(`oh-my-til v${VERSION}

Usage:
  oh-my-til init [<path>] [options]   Install skills, rules, and CLAUDE.md
  oh-my-til serve [<path>] [options]  Start MCP server
  oh-my-til version                   Print version

Options (init):
  --no-obsidian      Skip Obsidian plugin installation

Options (serve):
  --til-path <path>  TIL folder path (default: til)
  --port <port>      MCP server port (default: 22360)

Environment:
  ELECTRON_VERSION   Override Electron version for node-pty rebuild
`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "--help" || command === "-h") {
		printUsage();
		process.exit(0);
	}

	if (command === "version" || command === "--version" || command === "-v") {
		console.log(VERSION);
		process.exit(0);
	}

	const parsed = parseArgs(args.slice(1));
	const rawPath = parsed.positional[0];
	const basePath = path.resolve(rawPath ? expandTilde(rawPath) : process.cwd());
	const tilPath = parsed.options["til-path"] ?? "til";
	const port = parseInt(parsed.options["port"] ?? "22360", 10);

	if (isNaN(port) || port < 1 || port > 65535) {
		console.error(`Invalid port: ${parsed.options["port"]}`);
		process.exit(1);
	}

	if (command === "init") {
		if (!fs.existsSync(basePath)) {
			fs.mkdirSync(basePath, { recursive: true });
			console.log(`Created directory: ${basePath}`);
		}

		const storage = new FsStorage(basePath);
		console.log(`Initializing oh-my-til in ${basePath}...`);
		await installSkills(storage, VERSION);
		console.log("\nInstalled:");
		console.log("  - .claude/skills/ (6 skills)");
		console.log("  - .claude/rules/ (1 rule)");
		console.log("  - .claude/CLAUDE.md (MCP section)");
		console.log(`\nTo start MCP server: oh-my-til serve ${basePath}`);
		console.log(`To register with Claude Code: claude mcp add --transport http oh-my-til http://localhost:${port}/mcp`);

		const obsidianDir = path.join(basePath, ".obsidian");
		if (parsed.options["no-obsidian"]) {
			console.log("\nObsidian plugin installation skipped (--no-obsidian).");
		} else if (fs.existsSync(obsidianDir)) {
			console.log("\nObsidian vault detected. Installing plugin...");
			const packageRoot = path.resolve(__dirname, "..");
			const result = installObsidianPlugin(basePath, packageRoot);
			if (result.success) {
				console.log(`  Plugin installed: ${result.pluginDir}`);
				if (result.rebuilt) {
					console.log("  node-pty rebuilt for Electron.");
				}
				for (const w of result.warnings) {
					console.warn(`  Warning: ${w}`);
				}
				console.log("  Restart Obsidian or reload the plugin to activate.");
			} else {
				console.error("  Plugin installation failed:");
				for (const w of result.warnings) {
					console.error(`    ${w}`);
				}
				console.log("  You can install manually:");
				console.log("    https://github.com/SongYunSeop/oh-my-til#option-b-obsidian-plugin");
			}
		} else {
			console.log("\nUsing Obsidian? Run init inside your vault to auto-install the plugin.");
		}
	} else if (command === "serve") {
		const storage = new FsStorage(basePath);
		const metadata = new FsMetadata(basePath);
		const server = new TILMcpServer(storage, metadata, port, tilPath, VERSION, {
			onError: (msg) => console.error(`Error: ${msg}`),
		});

		process.on("SIGINT", async () => {
			console.log("\nShutting down...");
			await server.stop();
			process.exit(0);
		});

		process.on("SIGTERM", async () => {
			await server.stop();
			process.exit(0);
		});

		await server.start();
		console.log(`MCP server running on http://localhost:${port}/mcp`);
		console.log(`TIL path: ${tilPath}`);
		console.log("Press Ctrl+C to stop");
	} else {
		console.error(`Unknown command: ${command}`);
		printUsage();
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
