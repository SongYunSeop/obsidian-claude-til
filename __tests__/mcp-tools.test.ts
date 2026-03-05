import { describe, it, expect } from "vitest";
import { App, Vault, TFile, type CachedMetadata } from "obsidian";
import {
	findPathMatches,
	buildFileContext,
	findUnresolvedMentions,
	formatTopicContext,
	filterRecentFiles,
	formatRecentContext,
	groupFilesByCategory,
	type TilFileContext,
	type TopicContextResult,
} from "../src/mcp/context";
import { computeBacklogProgress, parseBacklogSections, checkBacklogItem } from "../src/backlog";
import {
	filterDueCards,
	type SrsFileEntry,
} from "../src/core/srs";

// Directly tests the core logic of MCP tools.
// Validates vault access logic without a real McpServer.
// The filtering logic in each test must match the actual code in tools.ts.

type AppWithHelpers = App & {
	_setActiveFile: (f: TFile | null) => void;
	_setFileCache: (path: string, cache: CachedMetadata) => void;
	_setResolvedLinks: (links: Record<string, Record<string, number>>) => void;
	_setUnresolvedLinks: (links: Record<string, Record<string, number>>) => void;
};
type VaultWithHelpers = Vault & {
	_setFile: (p: string, c: string, stat?: { ctime?: number; mtime?: number; size?: number }) => void;
};

function createApp(files: Record<string, string>): App {
	const vault = new Vault();
	for (const [path, content] of Object.entries(files)) {
		(vault as VaultWithHelpers)._setFile(path, content);
	}
	return new App(vault);
}

// --- Helper functions that reproduce the tools.ts logic as-is ---

function tilList(app: App, tilPath: string, category?: string): Record<string, string[]> {
	const filePaths = app.vault.getFiles()
		.filter((f) => f.path.startsWith(tilPath + "/") && f.extension === "md")
		.map((f) => f.path);
	return groupFilesByCategory(filePaths, tilPath, category);
}

async function tilBacklogStatus(
	app: App,
	tilPath: string,
	category?: string,
): Promise<{ totalDone: number; totalItems: number; categories: { name: string; path: string; done: number; total: number; sections?: ReturnType<typeof parseBacklogSections> }[] }> {
	const files = app.vault.getFiles().filter((f) => {
		if (!f.path.startsWith(tilPath + "/")) return false;
		if (f.name !== "backlog.md") return false;
		if (category) {
			const relative = f.path.replace(tilPath + "/", "");
			const cat = relative.split("/")[0];
			if (cat !== category) return false;
		}
		return true;
	});

	const categories: { name: string; path: string; done: number; total: number; sections?: ReturnType<typeof parseBacklogSections> }[] = [];

	for (const file of files) {
		const content = await app.vault.read(file);
		const progress = computeBacklogProgress(content);
		const total = progress.todo + progress.done;
		if (total > 0) {
			const name = file.path.replace(tilPath + "/", "").split("/")[0]!;
			const entry: typeof categories[number] = { name, path: file.path, done: progress.done, total };
			if (category) {
				entry.sections = parseBacklogSections(content);
			}
			categories.push(entry);
		}
	}

	const totalDone = categories.reduce((sum, c) => sum + c.done, 0);
	const totalItems = categories.reduce((sum, c) => sum + c.total, 0);
	return { totalDone, totalItems, categories };
}

// --- Tests ---

describe("til_list", () => {
	const tilPath = "til";
	const files = {
		"til/typescript/generics.md": "",
		"til/typescript/types.md": "",
		"til/react/hooks.md": "",
		"til/TIL MOC.md": "",
		"notes/other.md": "",
	};

	it("groups files by category", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath);

		expect(result["typescript"]).toHaveLength(2);
		expect(result["react"]).toHaveLength(1);
	});

	it("classifies root-level files as (uncategorized)", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath);

		expect(result["(uncategorized)"]).toContain("til/TIL MOC.md");
	});

	it("does not include files outside tilPath", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath);

		const allPaths = Object.values(result).flat();
		expect(allPaths).not.toContain("notes/other.md");
	});

	it("applies a category filter", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath, "typescript");

		expect(Object.keys(result)).toEqual(["typescript"]);
		expect(result["typescript"]).toHaveLength(2);
	});

	it("excludes root-level files when a category filter is applied", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath, "typescript");

		const allPaths = Object.values(result).flat();
		expect(allPaths).not.toContain("til/TIL MOC.md");
	});

	it("returns empty result for a non-existent category filter", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath, "nonexistent");

		expect(Object.keys(result)).toHaveLength(0);
	});
});

describe("til_backlog_status", () => {
	const tilPath = "til";

	it("finds backlogs at til/{category}/backlog.md paths", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료\n- [ ] 미완료",
			"til/react/backlog.md": "- [ ] 미완료1\n- [ ] 미완료2",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(4);
		expect(result.categories).toHaveLength(2);
	});

	it("applies a category filter", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료\n- [ ] 미완료",
			"til/react/backlog.md": "- [ ] 미완료1\n- [ ] 미완료2",
		});

		const result = await tilBacklogStatus(app, tilPath, "typescript");
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(2);
		expect(result.categories).toHaveLength(1);
		expect(result.categories[0]!.name).toBe("typescript");
		expect(result.categories[0]!.path).toBe("til/typescript/backlog.md");
	});

	it("ignores files that are not backlog.md", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료",
			"til/typescript/generics.md": "- [ ] 이건 백로그가 아님",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(1);
		expect(result.categories).toHaveLength(1);
	});

	it("ignores backlog.md files outside tilPath", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료",
			"notes/backlog.md": "- [ ] 이건 다른 폴더",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(1);
	});

	it("excludes backlogs without checkboxes from results", async () => {
		const app = createApp({
			"til/empty/backlog.md": "# Empty backlog\nNo items here.",
			"til/typescript/backlog.md": "- [x] 완료\n- [ ] 미완료",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.categories).toHaveLength(1);
		expect(result.categories[0]!.name).toBe("typescript");
	});

	it("returns empty result when no backlogs exist", async () => {
		const app = createApp({
			"til/typescript/generics.md": "# Generics",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(0);
		expect(result.totalItems).toBe(0);
		expect(result.categories).toHaveLength(0);
	});

	it("counts uppercase [X] as done", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [X] 대문자 완료\n- [x] 소문자 완료\n- [ ] 미완료",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(2);
		expect(result.totalItems).toBe(3);
	});

	it("includes sourceUrls in sections when a category is specified", async () => {
		const backlogContent = `---
tags:
  - backlog
sources:
  generics:
    - https://www.typescriptlang.org/docs/handbook/2/generics.html
    - https://blog.example.com/generics-deep-dive
  mapped-types:
    - https://www.typescriptlang.org/docs/handbook/2/mapped-types.html
---

## 핵심 개념
- [ ] [제네릭](til/typescript/generics.md) - 타입 매개변수
- [ ] [매핑된 타입](til/typescript/mapped-types.md) - 기존 타입 변환
- [ ] [조건부 타입](til/typescript/conditional-types.md) - 조건 분기`;

		const app = createApp({
			"til/typescript/backlog.md": backlogContent,
		});

		const result = await tilBacklogStatus(app, tilPath, "typescript");
		expect(result.categories).toHaveLength(1);
		const sections = result.categories[0]!.sections!;
		expect(sections).toHaveLength(1);
		expect(sections[0]!.items[0]!.sourceUrls).toEqual([
			"https://www.typescriptlang.org/docs/handbook/2/generics.html",
			"https://blog.example.com/generics-deep-dive",
		]);
		expect(sections[0]!.items[1]!.sourceUrls).toEqual(["https://www.typescriptlang.org/docs/handbook/2/mapped-types.html"]);
		expect(sections[0]!.items[2]!.sourceUrls).toBeUndefined();
	});
});

describe("til_list (search)", () => {
	const tilPath = "til";
	const files = {
		"til/typescript/generics.md": "",
		"til/typescript/types.md": "",
		"til/react/hooks.md": "",
		"til/llm/function-calling.md": "",
		"til/TIL MOC.md": "",
	};

	it("filters paths using the search parameter", () => {
		const app = createApp(files);
		const allPaths = app.vault.getFiles()
			.filter((f: TFile) => f.path.startsWith(tilPath + "/") && f.extension === "md")
			.map((f: TFile) => f.path);

		const lowerSearch = "function";
		const filtered = allPaths.filter((p: string) => p.toLowerCase().includes(lowerSearch));
		const result = groupFilesByCategory(filtered, tilPath);

		const allFiles = Object.values(result).flat();
		expect(allFiles).toHaveLength(1);
		expect(allFiles).toContain("til/llm/function-calling.md");
	});

	it("search is case-insensitive", () => {
		const app = createApp(files);
		const allPaths = app.vault.getFiles()
			.filter((f: TFile) => f.path.startsWith(tilPath + "/") && f.extension === "md")
			.map((f: TFile) => f.path);

		const lowerSearch = "typescript";
		const filtered = allPaths.filter((p: string) => p.toLowerCase().includes(lowerSearch));
		const result = groupFilesByCategory(filtered, tilPath);

		expect(result["typescript"]).toHaveLength(2);
	});

	it("filters by search + category combination", () => {
		const app = createApp(files);
		const allPaths = app.vault.getFiles()
			.filter((f: TFile) => f.path.startsWith(tilPath + "/") && f.extension === "md")
			.map((f: TFile) => f.path);

		const lowerSearch = "gen";
		const filtered = allPaths.filter((p: string) => p.toLowerCase().includes(lowerSearch));
		const result = groupFilesByCategory(filtered, tilPath, "typescript");

		expect(Object.keys(result)).toEqual(["typescript"]);
		expect(result["typescript"]).toEqual(["til/typescript/generics.md"]);
	});

	it("returns an empty object when there are no matching results", () => {
		const app = createApp(files);
		const allPaths = app.vault.getFiles()
			.filter((f: TFile) => f.path.startsWith(tilPath + "/") && f.extension === "md")
			.map((f: TFile) => f.path);

		const lowerSearch = "nonexistent-xyz";
		const filtered = allPaths.filter((p: string) => p.toLowerCase().includes(lowerSearch));
		const result = groupFilesByCategory(filtered, tilPath);

		expect(Object.keys(result)).toHaveLength(0);
	});
});

// --- Reproduce til_save_note auto_check_backlog logic ---

describe("til_save_note (auto_check_backlog)", () => {
	it("checks the backlog item when auto_check_backlog=true", () => {
		const backlogContent = "- [ ] [제네릭](til/typescript/generics.md) - 타입 매개변수\n- [ ] [타입](til/typescript/types.md)";
		const result = checkBacklogItem(backlogContent, "generics");
		expect(result.found).toBe(true);
		expect(result.alreadyDone).toBe(false);
		expect(result.content).toContain("[x]");
	});

	it("returns alreadyDone=true for an already-checked item", () => {
		const backlogContent = "- [x] [제네릭](til/typescript/generics.md) - 타입 매개변수";
		const result = checkBacklogItem(backlogContent, "generics");
		expect(result.found).toBe(true);
		expect(result.alreadyDone).toBe(true);
	});

	it("returns found=false when the item is not in the backlog", () => {
		const backlogContent = "- [ ] [타입](til/typescript/types.md)";
		const result = checkBacklogItem(backlogContent, "generics");
		expect(result.found).toBe(false);
	});
});

// --- Reproduce til_review_list include_content logic ---

function makeSrsFiles(
	entries: Array<{ path: string; title?: string; frontmatter?: Record<string, unknown> }>,
): SrsFileEntry[] {
	return entries.map((e) => ({
		path: e.path,
		extension: e.path.split(".").pop() ?? "",
		title: e.title ?? e.path.split("/").pop()?.replace(/\.md$/, "") ?? "",
		frontmatter: e.frontmatter ?? {},
	}));
}

describe("til_review_list (include_content)", () => {
	const tilPath = "til";
	// Set to a past date so all cards become due for review
	const dueFrontmatter = {
		next_review: "2026-01-01",
		interval: 1,
		ease_factor: 2.5,
		repetitions: 1,
		last_review: "2025-12-31",
	};

	it("includes a content field in each card when include_content=true", async () => {
		const files: Record<string, string> = {
			"til/typescript/generics.md": "# Generics\n제네릭 내용",
			"til/react/hooks.md": "# Hooks\n훅 내용",
		};
		const app = createApp(files);

		const srsFiles = makeSrsFiles([
			{ path: "til/typescript/generics.md", title: "Generics", frontmatter: { ...dueFrontmatter } },
			{ path: "til/react/hooks.md", title: "Hooks", frontmatter: { ...dueFrontmatter } },
		]);

		const cards = filterDueCards(srsFiles, tilPath);

		// Reproduce include_content=true logic (Promise.all + storage.readFile from tools.ts)
		const contents = await Promise.all(
			cards.map((card) => {
				const file = app.vault.getAbstractFileByPath(card.path);
				return file instanceof TFile ? app.vault.read(file) : Promise.resolve(null);
			}),
		);
		const cardsWithContent = cards.map((card, i) => ({
			...card,
			content: contents[i] ?? "",
		}));

		expect(cardsWithContent.length).toBe(2);
		for (const card of cardsWithContent) {
			expect(card).toHaveProperty("content");
			expect(typeof card.content).toBe("string");
			expect(card.content.length).toBeGreaterThan(0);
		}
	});

	it("does not include a content field when include_content=false (or unset)", () => {
		const srsFiles = makeSrsFiles([
			{ path: "til/typescript/generics.md", title: "Generics", frontmatter: { ...dueFrontmatter } },
		]);

		const cards = filterDueCards(srsFiles, tilPath);

		// When include_content is absent, return cards as-is
		for (const card of cards) {
			expect(card).not.toHaveProperty("content");
		}
	});

	it("replaces deleted file content (null) with an empty string", () => {
		const srsFiles = makeSrsFiles([
			{ path: "til/typescript/generics.md", title: "Generics", frontmatter: { ...dueFrontmatter } },
			{ path: "til/deleted/missing.md", title: "Missing", frontmatter: { ...dueFrontmatter } },
		]);

		const cards = filterDueCards(srsFiles, tilPath);

		// Simulate a contents array containing null values
		const contents: (string | null)[] = ["# Generics\n내용", null];
		const cardsWithContent = cards.map((card, i) => ({
			...card,
			content: contents[i] ?? "",
		}));

		expect(cardsWithContent[0]!.content).toBe("# Generics\n내용");
		expect(cardsWithContent[1]!.content).toBe("");
	});
});

// --- Reproduce til_save_note frontmatter generation logic ---

function buildTilFrontmatter(opts: {
	title: string;
	date?: string;
	tags?: string[];
	fmCategory?: string;
	category: string;
	aliases?: string[];
}): string {
	const noteDate = opts.date || new Date().toISOString().slice(0, 10);
	const fmLines = ["---", `title: "${opts.title.replace(/"/g, '\\"')}"`, `date: ${noteDate}`];
	const effectiveCategory = opts.fmCategory ?? opts.category;
	fmLines.push(`category: ${effectiveCategory}`);
	if (opts.tags && opts.tags.length > 0) {
		fmLines.push("tags:");
		for (const tag of opts.tags) {
			fmLines.push(`  - ${tag}`);
		}
	}
	if (opts.aliases && opts.aliases.length > 0) {
		fmLines.push(`aliases: [${opts.aliases.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ")}]`);
	}
	fmLines.push("---", "");
	return fmLines.join("\n");
}

describe("til_save_note (frontmatter)", () => {
	it("includes category in frontmatter", () => {
		const fm = buildTilFrontmatter({ title: "제네릭", category: "typescript" });
		expect(fm).toContain("category: typescript");
	});

	it("uses fmCategory instead of category when fmCategory is provided", () => {
		const fm = buildTilFrontmatter({ title: "제네릭", category: "typescript", fmCategory: "타입스크립트" });
		expect(fm).toContain("category: 타입스크립트");
		expect(fm).not.toContain("category: typescript");
	});

	it("uses the category parameter when fmCategory is absent", () => {
		const fm = buildTilFrontmatter({ title: "Hooks", category: "react" });
		expect(fm).toContain("category: react");
	});

	it("includes aliases in frontmatter", () => {
		const fm = buildTilFrontmatter({ title: "제네릭", category: "typescript", aliases: ["제네릭", "Generics"] });
		expect(fm).toContain('aliases: ["제네릭", "Generics"]');
	});

	it("does not include aliases in frontmatter when absent", () => {
		const fm = buildTilFrontmatter({ title: "Hooks", category: "react" });
		expect(fm).not.toContain("aliases");
	});

	it("escapes quotes in aliases", () => {
		const fm = buildTilFrontmatter({ title: "Test", category: "test", aliases: ['say "hello"'] });
		expect(fm).toContain('aliases: ["say \\"hello\\""]');
	});

	it("produces complete frontmatter with tags + category + aliases", () => {
		const fm = buildTilFrontmatter({
			title: "제네릭 기초",
			category: "typescript",
			date: "2026-03-02",
			tags: ["til", "typescript"],
			aliases: ["제네릭 기초", "Generics Basics"],
		});
		expect(fm).toContain("---");
		expect(fm).toContain('title: "제네릭 기초"');
		expect(fm).toContain("date: 2026-03-02");
		expect(fm).toContain("category: typescript");
		expect(fm).toContain("  - til");
		expect(fm).toContain("  - typescript");
		expect(fm).toContain('aliases: ["제네릭 기초", "Generics Basics"]');
	});
});

// --- til_get_context integration tests ---

describe("til_get_context (integration)", () => {
	const tilPath = "til";

	it("full pipeline: path matching + metadataCache enrichment", async () => {
		const vault = new Vault();
		const v = vault as VaultWithHelpers;
		v._setFile("til/typescript/generics.md", "# Generics\n제네릭 기초 내용");
		v._setFile("til/typescript/types.md", "# Types\n타입 관련 내용");
		v._setFile("til/react/hooks.md", "# Hooks\ntypescript와 함께 사용");
		v._setFile("til/react/backlog.md", "- [ ] 미완료");

		const app = new App(vault) as AppWithHelpers;
		app._setFileCache("til/typescript/generics.md", {
			headings: [{ heading: "Generics", level: 1 }, { heading: "제약 조건", level: 2 }],
			links: [{ link: "types" }],
			tags: [{ tag: "#typescript" }],
		});
		app._setResolvedLinks({
			"til/react/hooks.md": { "til/typescript/generics.md": 1 },
		});
		app._setUnresolvedLinks({
			"til/typescript/generics.md": { "고급 타입": 1, "유틸리티 타입": 1 },
		});

		// Reproduce the til_get_context logic from tools.ts
		const allFiles = app.vault.getFiles().filter((f: TFile) => f.extension === "md");
		const allPaths = allFiles.map((f: TFile) => f.path);

		const pathMatches = findPathMatches(allPaths, "typescript", tilPath);
		expect(pathMatches).toContain("til/typescript/generics.md");
		expect(pathMatches).toContain("til/typescript/types.md");
		expect(pathMatches).not.toContain("til/react/backlog.md");

		// content matching (in files not included in pathMatches)
		const pathMatchSet = new Set(pathMatches);
		const contentMatches: string[] = [];
		for (const file of allFiles) {
			if (pathMatchSet.has(file.path)) continue;
			if (!file.path.startsWith(tilPath + "/")) continue;
			if (file.name === "backlog.md") continue;
			const text = await app.vault.read(file);
			if (text.toLowerCase().includes("typescript")) {
				contentMatches.push(file.path);
			}
		}
		expect(contentMatches).toContain("til/react/hooks.md");

		// enrichment
		const file = app.vault.getAbstractFileByPath("til/typescript/generics.md") as TFile;
		const cache = app.metadataCache.getFileCache(file);
		expect(cache?.headings).toHaveLength(2);
		expect(cache?.tags).toHaveLength(1);

		// backlinks
		const resolvedLinks = app.metadataCache.resolvedLinks;
		const backlinks: string[] = [];
		for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
			if (targets["til/typescript/generics.md"]) {
				backlinks.push(sourcePath);
			}
		}
		expect(backlinks).toContain("til/react/hooks.md");

		// unresolved mentions
		const unresolvedMentions = findUnresolvedMentions(
			app.metadataCache.unresolvedLinks,
			"타입",
			tilPath,
		);
		expect(unresolvedMentions).toHaveLength(2);

		// format
		const result: TopicContextResult = {
			topic: "typescript",
			matchedFiles: [
				buildFileContext(
					"til/typescript/generics.md",
					tilPath,
					"path",
					cache!.headings!.map((h) => h.heading),
					cache!.links!.map((l) => l.link),
					backlinks,
					cache!.tags!.map((t) => t.tag),
				),
			],
			unresolvedMentions,
		};
		const text = formatTopicContext(result);
		expect(text).toContain('Learning Context for "typescript"');
		expect(text).toContain("Generics");
	});

	it("returns a new topic message when no matching files exist", () => {
		const app = createApp({ "til/react/hooks.md": "# Hooks" });
		const allPaths = app.vault.getFiles().map((f: TFile) => f.path);
		const pathMatches = findPathMatches(allPaths, "golang", tilPath);
		expect(pathMatches).toHaveLength(0);

		const result: TopicContextResult = {
			topic: "golang",
			matchedFiles: [],
			unresolvedMentions: [],
		};
		expect(formatTopicContext(result)).toContain("This is a new topic.");
	});
});

// --- til_recent_context integration tests ---

describe("til_recent_context (integration)", () => {
	const tilPath = "til";
	const now = new Date("2026-02-18T12:00:00Z").getTime();
	const day = 24 * 60 * 60 * 1000;

	it("full pipeline: mtime-based filtering + headings extraction", () => {
		const vault = new Vault();
		const v = vault as VaultWithHelpers;
		v._setFile("til/typescript/generics.md", "# Generics", { mtime: now - 1 * day });
		v._setFile("til/react/hooks.md", "# Hooks", { mtime: now - 3 * day });
		v._setFile("til/old/ancient.md", "# Old", { mtime: now - 30 * day });
		v._setFile("til/react/backlog.md", "- [ ] todo", { mtime: now - 1 * day });

		const app = new App(vault) as AppWithHelpers;
		app._setFileCache("til/typescript/generics.md", {
			headings: [{ heading: "Generics", level: 1 }],
		});
		app._setFileCache("til/react/hooks.md", {
			headings: [{ heading: "Hooks", level: 1 }, { heading: "useState", level: 2 }],
		});

		const allFiles = app.vault.getFiles().filter((f: TFile) => f.extension === "md");
		const filesWithMeta = allFiles.map((f: TFile) => {
			const cache = app.metadataCache.getFileCache(f);
			const headings = (cache?.headings ?? []).map((h) => h.heading);
			return { path: f.path, mtime: f.stat.mtime, headings };
		});

		const result = filterRecentFiles(filesWithMeta, 7, tilPath, now);
		expect(result.totalFiles).toBe(2);
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).toContain("til/typescript/generics.md");
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).toContain("til/react/hooks.md");
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).not.toContain("til/old/ancient.md");
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).not.toContain("til/react/backlog.md");

		const text = formatRecentContext(result);
		expect(text).toContain("Recent Learning Activity (7 days, 2 files)");
		expect(text).toContain("Generics");
	});

	it("returns a guidance message when there is no activity", () => {
		const result = filterRecentFiles([], 7, tilPath, now);
		const text = formatRecentContext(result);
		expect(text).toContain("No learning activity in the last");
	});
});
