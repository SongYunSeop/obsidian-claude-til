import { FsStorage, FsMetadata } from "../adapters/fs-adapter";
import { TILMcpServer } from "../mcp/server";
import { installSkills } from "../skills-install";
import { parseArgs } from "../core/cli";
import * as path from "path";
import * as fs from "fs";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0";

function printUsage(): void {
	console.log(`oh-my-til v${VERSION}

Usage:
  oh-my-til init [<path>]             Install skills, rules, and CLAUDE.md
  oh-my-til serve [<path>] [options]  Start MCP server
  oh-my-til version                   Print version

Options (serve):
  --til-path <path>  TIL folder path (default: til)
  --port <port>      MCP server port (default: 22360)
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
	const basePath = path.resolve(parsed.positional[0] ?? process.cwd());
	const tilPath = parsed.options["til-path"] ?? "til";
	const port = parseInt(parsed.options["port"] ?? "22360", 10);

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
		console.log(`\nTo start MCP server: oh-my-til serve --port ${port}`);
		console.log(`To register with Claude Code: claude mcp add --transport http oh-my-til http://localhost:${port}/mcp`);

		const obsidianDir = path.join(basePath, ".obsidian");
		if (fs.existsSync(obsidianDir)) {
			console.log("\nObsidian vault detected.");
			console.log("To install the Obsidian plugin, see:");
			console.log("  https://github.com/SongYunSeop/oh-my-til#option-b-obsidian-plugin");
		} else {
			console.log("\nUsing Obsidian? See plugin installation:");
			console.log("  https://github.com/SongYunSeop/oh-my-til#option-b-obsidian-plugin");
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
