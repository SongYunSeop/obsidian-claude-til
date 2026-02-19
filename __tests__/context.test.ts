import { describe, it, expect } from "vitest";
import {
	findPathMatches,
	buildFileContext,
	findUnresolvedMentions,
	filterRecentFiles,
	formatTopicContext,
	formatRecentContext,
	extractCategory,
	groupFilesByCategory,
	type TopicContextResult,
	type RecentContextResult,
} from "../src/mcp/context";

const tilPath = "til";

describe("findPathMatches", () => {
	const paths = [
		"til/typescript/generics.md",
		"til/typescript/types.md",
		"til/react/hooks.md",
		"til/react/backlog.md",
		"til/css/flexbox.md",
		"notes/typescript.md",
	];

	it("basename으로 매칭한다", () => {
		const result = findPathMatches(paths, "generics", tilPath);
		expect(result).toEqual(["til/typescript/generics.md"]);
	});

	it("카테고리(폴더명)로 매칭한다", () => {
		const result = findPathMatches(paths, "typescript", tilPath);
		expect(result).toEqual(["til/typescript/generics.md", "til/typescript/types.md"]);
	});

	it("대소문자를 무시한다", () => {
		const result = findPathMatches(paths, "TypeScript", tilPath);
		expect(result).toEqual(["til/typescript/generics.md", "til/typescript/types.md"]);
	});

	it("backlog.md를 제외한다", () => {
		const result = findPathMatches(paths, "react", tilPath);
		expect(result).toEqual(["til/react/hooks.md"]);
	});

	it("tilPath 밖의 파일을 제외한다", () => {
		const result = findPathMatches(paths, "typescript", tilPath);
		expect(result).not.toContain("notes/typescript.md");
	});

	it("빈 vault에서 빈 배열을 반환한다", () => {
		const result = findPathMatches([], "anything", tilPath);
		expect(result).toEqual([]);
	});

	it("매칭되지 않으면 빈 배열을 반환한다", () => {
		const result = findPathMatches(paths, "nonexistent", tilPath);
		expect(result).toEqual([]);
	});
});

describe("buildFileContext", () => {
	it("카테고리를 올바르게 추출한다", () => {
		const ctx = buildFileContext(
			"til/typescript/generics.md",
			tilPath,
			"path",
			["제네릭 기초", "제약 조건"],
			["types"],
			["hooks"],
			["#typescript"],
		);
		expect(ctx.category).toBe("typescript");
		expect(ctx.matchType).toBe("path");
		expect(ctx.headings).toEqual(["제네릭 기초", "제약 조건"]);
		expect(ctx.outgoingLinks).toEqual(["types"]);
		expect(ctx.backlinks).toEqual(["hooks"]);
		expect(ctx.tags).toEqual(["#typescript"]);
	});

	it("루트 파일은 (uncategorized)로 분류한다", () => {
		const ctx = buildFileContext(
			"til/overview.md",
			tilPath,
			"content",
			[],
			[],
			[],
			[],
		);
		expect(ctx.category).toBe("(uncategorized)");
	});

	it("메타데이터를 그대로 보존한다", () => {
		const ctx = buildFileContext(
			"til/react/hooks.md",
			tilPath,
			"content",
			["useState", "useEffect"],
			["state-management"],
			["components"],
			["#react", "#hooks"],
		);
		expect(ctx.path).toBe("til/react/hooks.md");
		expect(ctx.headings).toHaveLength(2);
		expect(ctx.outgoingLinks).toHaveLength(1);
		expect(ctx.backlinks).toHaveLength(1);
		expect(ctx.tags).toHaveLength(2);
	});
});

describe("findUnresolvedMentions", () => {
	it("topic에 매칭되는 미작성 링크를 찾는다", () => {
		const unresolvedLinks = {
			"til/typescript/generics.md": { "고급 타입": 1, "유틸리티 타입": 1 },
			"til/react/hooks.md": { "커스텀 훅": 1, "고급 타입": 1 },
		};
		const result = findUnresolvedMentions(unresolvedLinks, "타입", tilPath);
		expect(result).toHaveLength(2);

		const advanced = result.find((r) => r.linkName === "고급 타입");
		expect(advanced).toBeDefined();
		expect(advanced!.mentionedIn).toEqual([
			"til/typescript/generics.md",
			"til/react/hooks.md",
		]);

		const utility = result.find((r) => r.linkName === "유틸리티 타입");
		expect(utility).toBeDefined();
		expect(utility!.mentionedIn).toEqual(["til/typescript/generics.md"]);
	});

	it("tilPath 밖의 소스 파일을 제외한다", () => {
		const unresolvedLinks = {
			"til/typescript/generics.md": { "고급 타입": 1 },
			"notes/random.md": { "고급 타입": 1 },
		};
		const result = findUnresolvedMentions(unresolvedLinks, "타입", tilPath);
		expect(result).toHaveLength(1);
		expect(result[0]!.mentionedIn).toEqual(["til/typescript/generics.md"]);
	});

	it("매칭되는 링크가 없으면 빈 배열을 반환한다", () => {
		const unresolvedLinks = {
			"til/typescript/generics.md": { "커스텀 훅": 1 },
		};
		const result = findUnresolvedMentions(unresolvedLinks, "타입", tilPath);
		expect(result).toEqual([]);
	});

	it("빈 unresolvedLinks에서 빈 배열을 반환한다", () => {
		const result = findUnresolvedMentions({}, "anything", tilPath);
		expect(result).toEqual([]);
	});
});

describe("filterRecentFiles", () => {
	const now = new Date("2026-02-18T12:00:00Z").getTime();
	const day = 24 * 60 * 60 * 1000;

	const files = [
		{ path: "til/typescript/generics.md", mtime: now - 1 * day, headings: ["제네릭"] },
		{ path: "til/react/hooks.md", mtime: now - 2 * day, headings: ["useState"] },
		{ path: "til/css/flexbox.md", mtime: now - 5 * day, headings: ["flex"] },
		{ path: "til/old/ancient.md", mtime: now - 30 * day, headings: ["옛날"] },
		{ path: "til/react/backlog.md", mtime: now - 1 * day, headings: [] },
		{ path: "notes/outside.md", mtime: now - 1 * day, headings: ["외부"] },
	];

	it("days 기준으로 cutoff 필터링한다", () => {
		const result = filterRecentFiles(files, 3, tilPath, now);
		expect(result.totalFiles).toBe(2);
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).toContain("til/typescript/generics.md");
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).toContain("til/react/hooks.md");
	});

	it("newest-first로 정렬한다", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		expect(result.groups[0]!.date).toBe("2026-02-17"); // 가장 최근
		const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
		expect(allPaths[0]).toBe("til/typescript/generics.md");
	});

	it("날짜별로 그룹핑한다", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		expect(result.groups.length).toBeGreaterThanOrEqual(2);
		for (const group of result.groups) {
			expect(group.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it("backlog.md를 제외한다", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
		expect(allPaths).not.toContain("til/react/backlog.md");
	});

	it("tilPath 밖의 파일을 제외한다", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
		expect(allPaths).not.toContain("notes/outside.md");
	});

	it("days=0이면 빈 결과를 반환한다", () => {
		const result = filterRecentFiles(files, 0, tilPath, now);
		expect(result.totalFiles).toBe(0);
		expect(result.groups).toHaveLength(0);
	});

	it("카테고리를 올바르게 추출한다", () => {
		const result = filterRecentFiles(files, 3, tilPath, now);
		const tsFile = result.groups.flatMap((g) => g.files).find((f) => f.path === "til/typescript/generics.md");
		expect(tsFile!.category).toBe("typescript");
	});
});

describe("formatTopicContext", () => {
	it("매칭 파일이 있을 때 올바른 형식을 출력한다", () => {
		const result: TopicContextResult = {
			topic: "typescript",
			matchedFiles: [
				{
					path: "til/typescript/generics.md",
					category: "typescript",
					headings: ["제네릭 기초"],
					outgoingLinks: ["types"],
					backlinks: ["hooks"],
					tags: ["#ts"],
					matchType: "path",
				},
			],
			unresolvedMentions: [
				{ linkName: "고급 타입", mentionedIn: ["til/typescript/generics.md"] },
			],
		};
		const text = formatTopicContext(result);
		expect(text).toContain('"typescript" 학습 컨텍스트');
		expect(text).toContain("관련 파일 (1개)");
		expect(text).toContain("til/typescript/generics.md");
		expect(text).toContain("제네릭 기초");
		expect(text).toContain("미작성 관련 링크 (1개)");
		expect(text).toContain("고급 타입");
	});

	it("매칭이 없을 때 새 주제 메시지를 출력한다", () => {
		const result: TopicContextResult = {
			topic: "unknown",
			matchedFiles: [],
			unresolvedMentions: [],
		};
		const text = formatTopicContext(result);
		expect(text).toContain("새 주제입니다");
	});

	it("unresolved만 있을 때도 출력한다", () => {
		const result: TopicContextResult = {
			topic: "타입",
			matchedFiles: [],
			unresolvedMentions: [
				{ linkName: "고급 타입", mentionedIn: ["til/ts/a.md"] },
			],
		};
		const text = formatTopicContext(result);
		expect(text).toContain("미작성 관련 링크");
		expect(text).toContain("[고급 타입](고급 타입.md)");
		expect(text).not.toContain("관련 파일");
	});
});

describe("extractCategory", () => {
	it("하위 폴더명을 카테고리로 추출한다", () => {
		expect(extractCategory("til/typescript/generics.md", "til")).toBe("typescript");
	});

	it("루트 파일은 (uncategorized)로 반환한다", () => {
		expect(extractCategory("til/overview.md", "til")).toBe("(uncategorized)");
	});

	it("깊은 경로에서 첫 번째 폴더를 카테고리로 반환한다", () => {
		expect(extractCategory("til/react/advanced/patterns.md", "til")).toBe("react");
	});

	it("커스텀 tilPath를 지원한다", () => {
		expect(extractCategory("learning/react/hooks.md", "learning")).toBe("react");
	});
});

describe("groupFilesByCategory", () => {
	const paths = [
		"til/typescript/generics.md",
		"til/typescript/types.md",
		"til/react/hooks.md",
		"til/overview.md",
		"notes/other.md",
	];

	it("카테고리별로 그룹핑한다", () => {
		const result = groupFilesByCategory(paths, "til");
		expect(result["typescript"]).toHaveLength(2);
		expect(result["react"]).toHaveLength(1);
		expect(result["(uncategorized)"]).toContain("til/overview.md");
	});

	it("tilPath 밖의 파일을 제외한다", () => {
		const result = groupFilesByCategory(paths, "til");
		const allPaths = Object.values(result).flat();
		expect(allPaths).not.toContain("notes/other.md");
	});

	it("카테고리 필터를 적용한다", () => {
		const result = groupFilesByCategory(paths, "til", "typescript");
		expect(Object.keys(result)).toEqual(["typescript"]);
		expect(result["typescript"]).toHaveLength(2);
	});

	it("존재하지 않는 카테고리 필터에 빈 결과를 반환한다", () => {
		const result = groupFilesByCategory(paths, "til", "nonexistent");
		expect(Object.keys(result)).toHaveLength(0);
	});

	it("빈 배열에서 빈 객체를 반환한다", () => {
		const result = groupFilesByCategory([], "til");
		expect(result).toEqual({});
	});
});

describe("formatRecentContext", () => {
	it("활동이 있을 때 올바른 형식을 출력한다", () => {
		const result: RecentContextResult = {
			days: 7,
			totalFiles: 2,
			groups: [
				{
					date: "2026-02-17",
					files: [
						{ path: "til/ts/generics.md", category: "ts", headings: ["제네릭"], mtime: 0 },
					],
				},
				{
					date: "2026-02-16",
					files: [
						{ path: "til/react/hooks.md", category: "react", headings: ["훅"], mtime: 0 },
					],
				},
			],
		};
		const text = formatRecentContext(result);
		expect(text).toContain("최근 7일 학습 활동 (2개 파일)");
		expect(text).toContain("2026-02-17");
		expect(text).toContain("2026-02-16");
		expect(text).toContain("til/ts/generics.md");
	});

	it("활동이 없을 때 안내 메시지를 출력한다", () => {
		const result: RecentContextResult = {
			days: 7,
			totalFiles: 0,
			groups: [],
		};
		const text = formatRecentContext(result);
		expect(text).toContain("학습 활동이 없습니다");
	});
});
