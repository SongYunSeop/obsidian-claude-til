import { FsStorage, FsMetadata } from "../adapters/fs-adapter";
import { TILMcpServer } from "../mcp/server";
import { installSkills } from "../skills-install";
import * as path from "path";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0";

function printUsage(): void {
	console.log(`oh-my-til v${VERSION}

Usage:
  oh-my-til init [options]    Install skills, rules, and CLAUDE.md
  oh-my-til serve [options]   Start MCP server
  oh-my-til version           Print version

Options:
  --til-path <path>  TIL folder path (default: til)
  --port <port>      MCP server port (default: 22360)
  --base <path>      Base directory (default: current directory)
`);
}

function parseArgs(args: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg.startsWith("--") && i + 1 < args.length) {
			result[arg.slice(2)] = args[++i]!;
		}
	}
	return result;
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

	const opts = parseArgs(args.slice(1));
	const basePath = path.resolve(opts["base"] ?? process.cwd());
	const tilPath = opts["til-path"] ?? "til";
	const port = parseInt(opts["port"] ?? "22360", 10);

	const storage = new FsStorage(basePath);

	if (command === "init") {
		console.log(`Initializing oh-my-til in ${basePath}...`);
		await installSkills(storage, VERSION);
		console.log("\nInstalled:");
		console.log("  - .claude/skills/ (6 skills)");
		console.log("  - .claude/rules/ (1 rule)");
		console.log("  - .claude/CLAUDE.md (MCP section)");
		console.log(`\nTo start MCP server: oh-my-til serve --port ${port}`);
		console.log(`To register with Claude Code: claude mcp add --transport http oh-my-til http://localhost:${port}/mcp`);
	} else if (command === "serve") {
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
