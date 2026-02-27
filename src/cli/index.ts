import { FsStorage, FsMetadata } from "../adapters/fs-adapter";
import { TILMcpServer } from "../mcp/server";
import { installPlugin } from "../plugin-install";
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

import { loadSiteConfig } from "../core/config";

function printUsage(): void {
	console.log(`oh-my-til v${VERSION}

Usage:
  oh-my-til init [<path>] [options]    Install skills, rules, and CLAUDE.md
  oh-my-til serve [<path>] [options]   Start MCP server
  oh-my-til deploy [<path>] [options]  Generate static site from TIL files
  oh-my-til version                    Print version

Options (init):
  --no-obsidian      Skip Obsidian plugin installation

Options (serve):
  --til-path <path>  TIL folder path (default: til)
  --port <port>      MCP server port (default: 22360)

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
		await installPlugin(storage, VERSION);
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
	} else if (command === "deploy") {
		const siteConfig = loadSiteConfig(basePath);
		const dc = siteConfig.deploy ?? {};
		// CLI 옵션이 설정 파일보다 우선
		const deployTilPath = parsed.options["til-path"] ?? dc["til-path"] ?? tilPath;
		const outDir = parsed.options["out"] ?? dc.out ?? "_site";
		const siteTitle = parsed.options["title"] ?? dc.title ?? "TIL";
		const subtitle = parsed.options["subtitle"] ?? dc.subtitle;
		const githubUrl = parsed.options["github"] ?? dc.github;

		const storage = new FsStorage(basePath);
		const metadata = new FsMetadata(basePath);
		const files = await storage.listFiles();

		// tilPath 하위 .md 파일 수집 (backlog.md 제외)
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

		// 존재하는 TIL 파일 경로 Set (missing-link 판별용)
		const existingTilPaths = new Set(tilFiles.map((f) => f.path));

		const config: ProfileConfig = {
			title: siteTitle,
			description: "", // generated 카운트 확정 후 설정
			githubUrl,
			subtitle,
		};

		// 카테고리별 데이터 수집
		const categoryMap = new Map<string, CategoryPageData["tils"]>();
		const statsEntries: EnhancedStatsFileEntry[] = [];
		let generated = 0;

		// 1차: 데이터 수집 (카테고리 맵, 히트맵 엔트리, 페이지 데이터)
		const tilPageEntries: Array<{
			title: string; category: string; slug: string;
			createdDate: string; contentHtml: string; summary: string;
		}> = [];

		for (const file of tilFiles) {
			const content = await storage.readFile(file.path);
			if (!content) continue;

			const meta = await metadata.getFileMetadata(file.path);

			// 태그 필터링: tags:til 필수, tags:moc 제외 (Dashboard와 동일)
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

		// 2차: 개별 TIL 페이지 생성 (같은 카테고리의 다른 TIL 포함)
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

		// 카테고리 인덱스 페이지 생성
		for (const [category, tils] of categoryMap) {
			// 날짜 역순 정렬
			tils.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
			const catHtml = generateCategoryIndexHtml({ category, tils }, config);
			await storage.writeFile(path.join(outDir, category, "index.html"), catHtml);
		}

		// 히트맵 데이터 계산 (statsEntries는 이미 TIL 파일만 포함하므로 _prefilteredFiles로 전달)
		const heatmapData = computeHeatmapData(statsEntries, deployTilPath, undefined, statsEntries);
		const streak = computeStreak(statsEntries, deployTilPath, undefined, statsEntries);
		const heatmapHtml = renderHeatmapHtml(heatmapData.cells, streak, generated);

		// This Week 카운트: 최근 7일 내 생성된 TIL 수
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		const oneWeekAgoStr = oneWeekAgo.toISOString().slice(0, 10);
		const thisWeekCount = statsEntries.filter((e) => (e.createdDate ?? "") >= oneWeekAgoStr).length;

		// 최근 5개 TIL (createdDate 역순)
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

		// 프로필 페이지 생성 (전체 TIL 목록 + 히트맵 + 요약 카드 + 최근 TIL 포함)
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
