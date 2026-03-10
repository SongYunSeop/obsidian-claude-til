import { runConfigCommand } from "./global-config";
import { FsStorage, FsMetadata } from "../adapters/fs-adapter";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "../mcp/tools";
import { installObsidianPlugin } from "./obsidian-install";
import { parseArgs, expandTilde } from "../core/cli";
import { extractCategory } from "../core/context";
import { extractSummary, computeHeatmapData, computeStreak } from "../core/stats";
import type { EnhancedStatsFileEntry } from "../core/stats";
import { renderMarkdown, rewriteTilLinks } from "../core/markdown";
import {
	generateProfileHtml,
	generateTilPageHtml,
	generateCategoryIndexHtml,
	renderAllTilsHtml,
	renderHeatmapHtml,
	renderSummaryCardsHtml,
	renderRecentTilsHtml,
} from "../core/profile";
import type { ProfileConfig, CategoryTilGroup, CategoryPageData, RecentTilEntry } from "../core/profile";
import * as path from "path";
import * as fs from "fs";

declare const __CLI_VERSION__: string;
const VERSION = typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0";

function printUsage(): void {
	console.log(`oh-my-til v${VERSION}

Usage:
  oh-my-til mcp [<path>] [options]     Start MCP server (stdio)
  oh-my-til install-obsidian [<path>]   Install Obsidian desktop plugin only
  oh-my-til deploy [<path>] [options]  Generate static site from TIL files
  oh-my-til config get                 Show current global config
  oh-my-til config set <key> <value>   Set a config value
  oh-my-til version                    Print version

Config keys:
  vault              TIL vault path (e.g. ~/my-til)
  ai.provider        AI provider: anthropic | openai | ollama
  ai.model           AI model name
  ai.apiKey          AI API key (stored with chmod 600)

Options (mcp):
  --til-path <path>  TIL folder path (default: til)

Options (deploy):
  --til-path <path>  TIL folder path (default: til)
  --out <path>       Output directory (default: _site)
  --title <title>    Site title (default: TIL)
  --subtitle <text>  Profile page subtitle
  --github <url>     GitHub profile URL

Config file (oh-my-til.json):
  Place in vault root. CLI options override config values.
  { "deploy": { "title": "...", "subtitle": "...", "github": "..." } }

Environment:
  TIL_VAULT_PATH     TIL vault directory (fallback when no path argument given)
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
	const envPath = process.env["TIL_VAULT_PATH"];
	const basePath = path.resolve(
		rawPath ? expandTilde(rawPath) : envPath ? expandTilde(envPath) : process.cwd(),
	);
	const tilPath = parsed.options["til-path"] ?? "til";

	if (command === "mcp") {
		const storage = new FsStorage(basePath);
		const metadata = new FsMetadata(basePath);
		const mcpServer = new McpServer({
			name: "oh-my-til",
			version: VERSION,
		});
		registerTools(mcpServer, storage, metadata, tilPath);

		const transport = new StdioServerTransport();
		await mcpServer.connect(transport);

		// stdout is used by stdio transport — log to stderr
		process.stderr.write(`oh-my-til MCP server running (stdio, tilPath=${tilPath})\n`);

		const shutdown = async () => {
			await mcpServer.close();
			process.exit(0);
		};
		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	} else if (command === "install-obsidian") {
		const obsidianDir = path.join(basePath, ".obsidian");
		if (!fs.existsSync(obsidianDir)) {
			console.error("No .obsidian/ folder found. Run this command inside an Obsidian vault.");
			process.exit(1);
		}
		console.log("Installing Obsidian plugin...");
		const packageRoot = path.resolve(__dirname, "..");
		const result = installObsidianPlugin(basePath, packageRoot);
		if (result.success) {
			console.log(`Plugin installed: ${result.pluginDir}`);
			if (result.rebuilt) {
				console.log("node-pty rebuilt for Electron.");
			}
			for (const w of result.warnings) {
				console.warn(`Warning: ${w}`);
			}
			console.log("Restart Obsidian or reload the plugin to activate.");
		} else {
			console.error("Plugin installation failed:");
			for (const w of result.warnings) {
				console.error(`  ${w}`);
			}
			process.exit(1);
		}
	} else if (command === "deploy") {
		const { loadOmtConfig } = await import("../core/config");
		const omtConfig = loadOmtConfig(basePath);
		const dc = omtConfig.deploy ?? {};
		// CLI options take precedence over config file values
		const deployTilPath = parsed.options["til-path"] ?? dc["til-path"] ?? tilPath;
		const outDir = parsed.options["out"] ?? dc.out ?? "_site";
		const siteTitle = parsed.options["title"] ?? dc.title ?? "TIL";
		const subtitle = parsed.options["subtitle"] ?? dc.subtitle;
		const githubUrl = parsed.options["github"] ?? dc.github;

		const storage = new FsStorage(basePath);
		const metadata = new FsMetadata(basePath);
		const files = await storage.listFiles();

		// Collect .md files under tilPath (excluding backlog.md)
		const tilFiles = files.filter((f) => {
			if (!f.path.startsWith(deployTilPath + "/")) return false;
			if (f.extension !== "md") return false;
			if (f.name === "backlog.md") return false;
			return true;
		});

		if (tilFiles.length === 0) {
			console.log(`No TIL files found in ${deployTilPath}/`);
			process.exit(0);
		}

		// Set of existing TIL file paths (used to detect missing links)
		const existingTilPaths = new Set(tilFiles.map((f) => f.path));

		const config: ProfileConfig = {
			title: siteTitle,
			description: "", // set after generated count is finalized
			githubUrl,
			subtitle,
		};

		// Collect per-category data
		const categoryMap = new Map<string, CategoryPageData["tils"]>();
		const statsEntries: EnhancedStatsFileEntry[] = [];
		let generated = 0;

		// Pass 1: data collection (category map, heatmap entries, page data)
		const tilPageEntries: Array<{
			title: string; category: string; slug: string;
			createdDate: string; contentHtml: string; summary: string;
		}> = [];

		for (const file of tilFiles) {
			const content = await storage.readFile(file.path);
			if (!content) continue;

			const meta = await metadata.getFileMetadata(file.path);

			// Tag filtering: tags:til required, tags:moc excluded (same as Dashboard)
			const fmTags = meta?.frontmatter?.["tags"];
			const tags: string[] = Array.isArray(fmTags) ? fmTags.filter((t: unknown) => typeof t === "string") : [];
			if (!tags.includes("til")) continue;
			if (tags.includes("moc")) continue;

			const category = extractCategory(file.path, deployTilPath);
			const slug = file.name.replace(/\.md$/, "");

			const headings = meta?.headings ?? [];
			const fmTitle = meta?.frontmatter?.["title"];
			const title = headings.length > 0
				? headings[0]!
				: (typeof fmTitle === "string" && fmTitle ? fmTitle : slug.replace(/-/g, " "));

			const fmDate = meta?.frontmatter?.["date"];
			const createdDate = typeof fmDate === "string" ? fmDate.slice(0, 10) : new Date(file.ctime).toISOString().slice(0, 10);

			const contentHtml = rewriteTilLinks(renderMarkdown(content), existingTilPaths);
			const summary = extractSummary(content);

			tilPageEntries.push({ title, category, slug, createdDate, contentHtml, summary });

			if (!categoryMap.has(category)) categoryMap.set(category, []);
			categoryMap.get(category)!.push({ title, slug, createdDate, summary });

			statsEntries.push({
				path: file.path,
				extension: file.extension,
				mtime: file.mtime,
				ctime: file.ctime,
				createdDate,
			});
		}

		// Pass 2: generate individual TIL pages (including sibling TILs in the same category)
		for (const entry of tilPageEntries) {
			const siblings = categoryMap.get(entry.category) ?? [];
			const relatedTils = siblings
				.filter((t) => t.slug !== entry.slug)
				.slice(0, 5)
				.map((t) => ({ title: t.title, slug: t.slug }));

			const tilPageHtml = generateTilPageHtml(
				{ title: entry.title, category: entry.category, createdDate: entry.createdDate, contentHtml: entry.contentHtml, relatedTils },
				config,
			);
			await storage.writeFile(path.join(outDir, entry.category, `${entry.slug}.html`), tilPageHtml);
			generated++;
		}

		// Generate category index pages
		for (const [category, tils] of categoryMap) {
			// Sort by date descending
			tils.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
			const catHtml = generateCategoryIndexHtml({ category, tils }, config);
			await storage.writeFile(path.join(outDir, category, "index.html"), catHtml);
		}

		// Compute heatmap data (statsEntries already contains only TIL files, so pass as _prefilteredFiles)
		const heatmapData = computeHeatmapData(statsEntries, deployTilPath, undefined, statsEntries);
		const streak = computeStreak(statsEntries, deployTilPath, undefined, statsEntries);
		const heatmapHtml = renderHeatmapHtml(heatmapData.cells, streak, generated);

		// This Week count: number of TILs created within the last 7 days
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		const oneWeekAgoStr = oneWeekAgo.toISOString().slice(0, 10);
		const thisWeekCount = statsEntries.filter((e) => (e.createdDate ?? "") >= oneWeekAgoStr).length;

		// Most recent 5 TILs (sorted by createdDate descending)
		const allTilsSorted = Array.from(categoryMap.entries()).flatMap(([cat, tils]) =>
			tils.map((t) => ({ ...t, category: cat })),
		);
		allTilsSorted.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
		const recentTils: RecentTilEntry[] = allTilsSorted.slice(0, 5).map((t) => ({
			title: t.title,
			slug: t.slug,
			category: t.category,
			createdDate: t.createdDate,
			summary: t.summary,
		}));

		// Generate profile page (includes full TIL list + heatmap + summary cards + recent TILs)
		config.description = `${generated} TILs`;
		const allCategories: CategoryTilGroup[] = Array.from(categoryMap.entries())
			.map(([name, tils]) => ({ name, tils }))
			.sort((a, b) => b.tils.length - a.tils.length);

		const summaryCardsHtml = renderSummaryCardsHtml(generated, categoryMap.size, thisWeekCount, streak);
		const recentTilsHtml = renderRecentTilsHtml(recentTils);
		const allTilsHtml = renderAllTilsHtml(allCategories);
		const profileHtml = generateProfileHtml(config, summaryCardsHtml, heatmapHtml, recentTilsHtml, allTilsHtml);
		await storage.writeFile(path.join(outDir, "index.html"), profileHtml);

		console.log(`Generated ${generated} TIL pages + ${categoryMap.size} category indexes + profile`);
		console.log(`Output: ${path.resolve(basePath, outDir)}/`);
	} else if (command === "config") {
		runConfigCommand(args.slice(1));
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
