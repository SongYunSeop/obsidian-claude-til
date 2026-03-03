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
import { computeBacklogProgress, parseBacklogSections } from "../src/backlog";
import {
	filterDueCards,
	type SrsFileEntry,
} from "../src/core/srs";

// MCP 도구의 핵심 로직을 직접 테스트한다.
// 실제 McpServer 없이 vault 접근 로직만 검증.
// 각 테스트의 필터링 로직은 tools.ts의 실제 코드와 동일해야 한다.

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

// --- tools.ts 로직을 그대로 재현한 헬퍼 함수들 ---

function vaultReadNote(app: App, path: string): { text: string; isError?: boolean } {
	const file = app.vault.getAbstractFileByPath(path);
	if (!file || !(file instanceof TFile)) {
		return { text: `Error: 파일을 찾을 수 없습니다 — ${path}`, isError: true };
	}
	// 동기 테스트를 위해 vault.read는 별도 호출
	return { text: file.path };
}

function vaultListFiles(app: App, folder?: string, extension?: string): string[] {
	const files = app.vault.getFiles();
	return files
		.filter((f) => {
			if (folder && !f.path.startsWith(folder + "/") && f.path !== folder) return false;
			if (extension && f.extension !== extension) return false;
			return true;
		})
		.map((f) => f.path);
}

async function vaultSearch(app: App, query: string): Promise<string[]> {
	const files = app.vault.getFiles().filter((f) => f.extension === "md");
	const results: string[] = [];
	const lowerQuery = query.toLowerCase();

	for (const file of files) {
		const text = await app.vault.read(file);
		if (text.toLowerCase().includes(lowerQuery)) {
			results.push(file.path);
		}
		if (results.length >= 50) break;
	}
	return results;
}

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

// --- 테스트 ---

describe("vault_read_note", () => {
	it("존재하는 노트를 읽는다", async () => {
		const app = createApp({ "til/typescript/generics.md": "# Generics\n내용" });
		const result = vaultReadNote(app, "til/typescript/generics.md");
		expect(result.isError).toBeUndefined();

		const file = app.vault.getAbstractFileByPath("til/typescript/generics.md") as TFile;
		const content = await app.vault.read(file);
		expect(content).toBe("# Generics\n내용");
	});

	it("존재하지 않는 경로에서 에러를 반환한다", () => {
		const app = createApp({});
		const result = vaultReadNote(app, "nonexistent.md");
		expect(result.isError).toBe(true);
		expect(result.text).toContain("Error");
	});
});

describe("vault_list_files", () => {
	const files = {
		"til/ts/a.md": "",
		"til/ts/b.md": "",
		"til/react/c.md": "",
		"notes/d.md": "",
		"notes/e.txt": "",
	};

	it("폴더 필터링 — 특정 폴더만 반환한다", () => {
		const app = createApp(files);
		const result = vaultListFiles(app, "til/ts");
		expect(result).toEqual(["til/ts/a.md", "til/ts/b.md"]);
	});

	it("확장자 필터링 — md만 반환한다", () => {
		const app = createApp(files);
		const result = vaultListFiles(app, "notes", "md");
		expect(result).toEqual(["notes/d.md"]);
	});

	it("폴더+확장자 조합 필터링", () => {
		const app = createApp(files);
		const result = vaultListFiles(app, "til", "md");
		expect(result).toHaveLength(3);
	});

	it("필터 없이 전체 파일 반환", () => {
		const app = createApp(files);
		const result = vaultListFiles(app);
		expect(result).toHaveLength(5);
	});

	it("빈 vault에서 빈 배열 반환", () => {
		const app = createApp({});
		const result = vaultListFiles(app, "til");
		expect(result).toEqual([]);
	});
});

describe("vault_search", () => {
	it("대소문자 무시하고 검색한다", async () => {
		const app = createApp({
			"til/ts/generics.md": "TypeScript generics are powerful",
			"til/react/hooks.md": "React hooks pattern",
			"til/ts/types.md": "Advanced typescript types",
		});

		const results = await vaultSearch(app, "TypeScript");
		expect(results).toHaveLength(2);
		expect(results).toContain("til/ts/generics.md");
		expect(results).toContain("til/ts/types.md");
	});

	it("md 파일만 검색한다", async () => {
		const app = createApp({
			"config.json": '{"typescript": true}',
			"til/ts/a.md": "typescript content",
		});

		const results = await vaultSearch(app, "typescript");
		expect(results).toEqual(["til/ts/a.md"]);
	});

	it("결과가 없으면 빈 배열을 반환한다", async () => {
		const app = createApp({ "til/a.md": "hello world" });
		const results = await vaultSearch(app, "nonexistent");
		expect(results).toEqual([]);
	});
});

describe("til_list", () => {
	const tilPath = "til";
	const files = {
		"til/typescript/generics.md": "",
		"til/typescript/types.md": "",
		"til/react/hooks.md": "",
		"til/TIL MOC.md": "",
		"notes/other.md": "",
	};

	it("카테고리별로 분류한다", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath);

		expect(result["typescript"]).toHaveLength(2);
		expect(result["react"]).toHaveLength(1);
	});

	it("루트 파일은 (uncategorized)로 분류된다", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath);

		expect(result["(uncategorized)"]).toContain("til/TIL MOC.md");
	});

	it("tilPath 밖의 파일은 포함하지 않는다", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath);

		const allPaths = Object.values(result).flat();
		expect(allPaths).not.toContain("notes/other.md");
	});

	it("카테고리 필터를 적용한다", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath, "typescript");

		expect(Object.keys(result)).toEqual(["typescript"]);
		expect(result["typescript"]).toHaveLength(2);
	});

	it("카테고리 필터 시 루트 파일은 제외된다", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath, "typescript");

		const allPaths = Object.values(result).flat();
		expect(allPaths).not.toContain("til/TIL MOC.md");
	});

	it("존재하지 않는 카테고리 필터에 빈 결과를 반환한다", () => {
		const app = createApp(files);
		const result = tilList(app, tilPath, "nonexistent");

		expect(Object.keys(result)).toHaveLength(0);
	});
});

describe("til_backlog_status", () => {
	const tilPath = "til";

	it("til/{카테고리}/backlog.md 경로의 백로그를 찾는다", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료\n- [ ] 미완료",
			"til/react/backlog.md": "- [ ] 미완료1\n- [ ] 미완료2",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(4);
		expect(result.categories).toHaveLength(2);
	});

	it("카테고리 필터를 적용한다", async () => {
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

	it("backlog.md가 아닌 파일은 무시한다", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료",
			"til/typescript/generics.md": "- [ ] 이건 백로그가 아님",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(1);
		expect(result.categories).toHaveLength(1);
	});

	it("tilPath 밖의 backlog.md는 무시한다", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [x] 완료",
			"notes/backlog.md": "- [ ] 이건 다른 폴더",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(1);
		expect(result.totalItems).toBe(1);
	});

	it("체크박스가 없는 백로그는 결과에서 제외된다", async () => {
		const app = createApp({
			"til/empty/backlog.md": "# Empty backlog\nNo items here.",
			"til/typescript/backlog.md": "- [x] 완료\n- [ ] 미완료",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.categories).toHaveLength(1);
		expect(result.categories[0]!.name).toBe("typescript");
	});

	it("백로그가 없으면 빈 결과를 반환한다", async () => {
		const app = createApp({
			"til/typescript/generics.md": "# Generics",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(0);
		expect(result.totalItems).toBe(0);
		expect(result.categories).toHaveLength(0);
	});

	it("[X] 대문자도 완료로 카운트한다", async () => {
		const app = createApp({
			"til/typescript/backlog.md": "- [X] 대문자 완료\n- [x] 소문자 완료\n- [ ] 미완료",
		});

		const result = await tilBacklogStatus(app, tilPath);
		expect(result.totalDone).toBe(2);
		expect(result.totalItems).toBe(3);
	});

	it("category 지정 시 sections에 sourceUrls가 포함된다", async () => {
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

	it("search 파라미터로 경로를 필터링한다", () => {
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

	it("search가 대소문자를 무시한다", () => {
		const app = createApp(files);
		const allPaths = app.vault.getFiles()
			.filter((f: TFile) => f.path.startsWith(tilPath + "/") && f.extension === "md")
			.map((f: TFile) => f.path);

		const lowerSearch = "typescript";
		const filtered = allPaths.filter((p: string) => p.toLowerCase().includes(lowerSearch));
		const result = groupFilesByCategory(filtered, tilPath);

		expect(result["typescript"]).toHaveLength(2);
	});

	it("search + category 조합 필터링", () => {
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

	it("매칭 결과가 없으면 빈 객체를 반환한다", () => {
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

// --- til_review_list include_content 로직 재현 ---

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
	// 과거 날짜로 설정하여 모두 복습 대상이 되도록
	const dueFrontmatter = {
		next_review: "2026-01-01",
		interval: 1,
		ease_factor: 2.5,
		repetitions: 1,
		last_review: "2025-12-31",
	};

	it("include_content=true일 때 각 카드에 content 필드가 포함된다", async () => {
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

		// include_content=true 로직 재현 (tools.ts의 Promise.all + storage.readFile)
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

	it("include_content=false(또는 미지정)일 때 content 필드가 없다", () => {
		const srsFiles = makeSrsFiles([
			{ path: "til/typescript/generics.md", title: "Generics", frontmatter: { ...dueFrontmatter } },
		]);

		const cards = filterDueCards(srsFiles, tilPath);

		// include_content가 없으면 cards를 그대로 반환
		for (const card of cards) {
			expect(card).not.toHaveProperty("content");
		}
	});

	it("삭제된 파일(content가 null)은 빈 문자열로 대체된다", () => {
		const srsFiles = makeSrsFiles([
			{ path: "til/typescript/generics.md", title: "Generics", frontmatter: { ...dueFrontmatter } },
			{ path: "til/deleted/missing.md", title: "Missing", frontmatter: { ...dueFrontmatter } },
		]);

		const cards = filterDueCards(srsFiles, tilPath);

		// null 값을 포함한 contents 배열 시뮬레이션
		const contents: (string | null)[] = ["# Generics\n내용", null];
		const cardsWithContent = cards.map((card, i) => ({
			...card,
			content: contents[i] ?? "",
		}));

		expect(cardsWithContent[0]!.content).toBe("# Generics\n내용");
		expect(cardsWithContent[1]!.content).toBe("");
	});
});

// --- til_save_note frontmatter 생성 로직 재현 ---

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
	it("category가 frontmatter에 포함된다", () => {
		const fm = buildTilFrontmatter({ title: "제네릭", category: "typescript" });
		expect(fm).toContain("category: typescript");
	});

	it("fmCategory가 있으면 category 대신 사용된다", () => {
		const fm = buildTilFrontmatter({ title: "제네릭", category: "typescript", fmCategory: "타입스크립트" });
		expect(fm).toContain("category: 타입스크립트");
		expect(fm).not.toContain("category: typescript");
	});

	it("fmCategory가 없으면 category 파라미터가 사용된다", () => {
		const fm = buildTilFrontmatter({ title: "Hooks", category: "react" });
		expect(fm).toContain("category: react");
	});

	it("aliases가 frontmatter에 포함된다", () => {
		const fm = buildTilFrontmatter({ title: "제네릭", category: "typescript", aliases: ["제네릭", "Generics"] });
		expect(fm).toContain('aliases: ["제네릭", "Generics"]');
	});

	it("aliases가 없으면 frontmatter에 포함되지 않는다", () => {
		const fm = buildTilFrontmatter({ title: "Hooks", category: "react" });
		expect(fm).not.toContain("aliases");
	});

	it("aliases에 따옴표가 있으면 이스케이프된다", () => {
		const fm = buildTilFrontmatter({ title: "Test", category: "test", aliases: ['say "hello"'] });
		expect(fm).toContain('aliases: ["say \\"hello\\""]');
	});

	it("tags + category + aliases가 모두 포함된 완전한 frontmatter", () => {
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

describe("vault_get_active_file", () => {
	it("열린 파일이 없으면 null을 반환한다", () => {
		const app = createApp({});
		const active = app.workspace.getActiveFile();
		expect(active).toBeNull();
	});

	it("열린 파일의 경로와 내용을 반환한다", async () => {
		const app = createApp({ "til/test.md": "# Test content" });
		const file = new TFile("til/test.md");
		(app as AppWithHelpers)._setActiveFile(file);

		const active = app.workspace.getActiveFile();
		expect(active).not.toBeNull();
		expect(active!.path).toBe("til/test.md");
	});
});

// --- til_get_context 통합 테스트 ---

describe("til_get_context (통합)", () => {
	const tilPath = "til";

	it("경로 매칭 + metadataCache enrichment 전체 파이프라인", async () => {
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

		// tools.ts의 til_get_context 로직 재현
		const allFiles = app.vault.getFiles().filter((f: TFile) => f.extension === "md");
		const allPaths = allFiles.map((f: TFile) => f.path);

		const pathMatches = findPathMatches(allPaths, "typescript", tilPath);
		expect(pathMatches).toContain("til/typescript/generics.md");
		expect(pathMatches).toContain("til/typescript/types.md");
		expect(pathMatches).not.toContain("til/react/backlog.md");

		// content 매칭 (pathMatches에 포함되지 않은 파일에서)
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

		// 포맷
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
		expect(text).toContain('"typescript" 학습 컨텍스트');
		expect(text).toContain("Generics");
	});

	it("매칭 파일이 없으면 새 주제 메시지를 반환한다", () => {
		const app = createApp({ "til/react/hooks.md": "# Hooks" });
		const allPaths = app.vault.getFiles().map((f: TFile) => f.path);
		const pathMatches = findPathMatches(allPaths, "golang", tilPath);
		expect(pathMatches).toHaveLength(0);

		const result: TopicContextResult = {
			topic: "golang",
			matchedFiles: [],
			unresolvedMentions: [],
		};
		expect(formatTopicContext(result)).toContain("새 주제입니다");
	});
});

// --- til_recent_context 통합 테스트 ---

describe("til_recent_context (통합)", () => {
	const tilPath = "til";
	const now = new Date("2026-02-18T12:00:00Z").getTime();
	const day = 24 * 60 * 60 * 1000;

	it("mtime 기반 필터링 + headings 추출 전체 파이프라인", () => {
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
		expect(text).toContain("최근 7일 학습 활동 (2개 파일)");
		expect(text).toContain("Generics");
	});

	it("활동이 없으면 안내 메시지를 반환한다", () => {
		const result = filterRecentFiles([], 7, tilPath, now);
		const text = formatRecentContext(result);
		expect(text).toContain("학습 활동이 없습니다");
	});
});
