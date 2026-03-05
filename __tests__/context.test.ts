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

	it("matches by basename", () => {
		const result = findPathMatches(paths, "generics", tilPath);
		expect(result).toEqual(["til/typescript/generics.md"]);
	});

	it("matches by category (folder name)", () => {
		const result = findPathMatches(paths, "typescript", tilPath);
		expect(result).toEqual(["til/typescript/generics.md", "til/typescript/types.md"]);
	});

	it("is case-insensitive", () => {
		const result = findPathMatches(paths, "TypeScript", tilPath);
		expect(result).toEqual(["til/typescript/generics.md", "til/typescript/types.md"]);
	});

	it("excludes backlog.md", () => {
		const result = findPathMatches(paths, "react", tilPath);
		expect(result).toEqual(["til/react/hooks.md"]);
	});

	it("excludes files outside tilPath", () => {
		const result = findPathMatches(paths, "typescript", tilPath);
		expect(result).not.toContain("notes/typescript.md");
	});

	it("returns an empty array from an empty vault", () => {
		const result = findPathMatches([], "anything", tilPath);
		expect(result).toEqual([]);
	});

	it("returns an empty array when no match is found", () => {
		const result = findPathMatches(paths, "nonexistent", tilPath);
		expect(result).toEqual([]);
	});
});

describe("buildFileContext", () => {
	it("extracts category correctly", () => {
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

	it("classifies root files as (uncategorized)", () => {
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

	it("preserves metadata as-is", () => {
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
	it("finds unresolved links matching the topic", () => {
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

	it("excludes source files outside tilPath", () => {
		const unresolvedLinks = {
			"til/typescript/generics.md": { "고급 타입": 1 },
			"notes/random.md": { "고급 타입": 1 },
		};
		const result = findUnresolvedMentions(unresolvedLinks, "타입", tilPath);
		expect(result).toHaveLength(1);
		expect(result[0]!.mentionedIn).toEqual(["til/typescript/generics.md"]);
	});

	it("returns an empty array when no matching links are found", () => {
		const unresolvedLinks = {
			"til/typescript/generics.md": { "커스텀 훅": 1 },
		};
		const result = findUnresolvedMentions(unresolvedLinks, "타입", tilPath);
		expect(result).toEqual([]);
	});

	it("returns an empty array from empty unresolvedLinks", () => {
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

	it("filters by cutoff based on days", () => {
		const result = filterRecentFiles(files, 3, tilPath, now);
		expect(result.totalFiles).toBe(2);
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).toContain("til/typescript/generics.md");
		expect(result.groups.flatMap((g) => g.files.map((f) => f.path))).toContain("til/react/hooks.md");
	});

	it("sorts newest-first", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		expect(result.groups[0]!.date).toBe("2026-02-17"); // most recent
		const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
		expect(allPaths[0]).toBe("til/typescript/generics.md");
	});

	it("groups by date", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		expect(result.groups.length).toBeGreaterThanOrEqual(2);
		for (const group of result.groups) {
			expect(group.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it("excludes backlog.md", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
		expect(allPaths).not.toContain("til/react/backlog.md");
	});

	it("excludes files outside tilPath", () => {
		const result = filterRecentFiles(files, 7, tilPath, now);
		const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
		expect(allPaths).not.toContain("notes/outside.md");
	});

	it("returns empty result when days=0", () => {
		const result = filterRecentFiles(files, 0, tilPath, now);
		expect(result.totalFiles).toBe(0);
		expect(result.groups).toHaveLength(0);
	});

	it("extracts category correctly", () => {
		const result = filterRecentFiles(files, 3, tilPath, now);
		const tsFile = result.groups.flatMap((g) => g.files).find((f) => f.path === "til/typescript/generics.md");
		expect(tsFile!.category).toBe("typescript");
	});
});

describe("formatTopicContext", () => {
	it("outputs the correct format when matching files exist", () => {
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
		expect(text).toContain('Learning Context for "typescript"');
		expect(text).toContain("Related Files (1)");
		expect(text).toContain("til/typescript/generics.md");
		expect(text).toContain("제네릭 기초");
		expect(text).toContain("Unresolved Related Links (1)");
		expect(text).toContain("고급 타입");
	});

	it("outputs a new topic message when there are no matches", () => {
		const result: TopicContextResult = {
			topic: "unknown",
			matchedFiles: [],
			unresolvedMentions: [],
		};
		const text = formatTopicContext(result);
		expect(text).toContain("This is a new topic.");
	});

	it("outputs even when only unresolved links exist", () => {
		const result: TopicContextResult = {
			topic: "타입",
			matchedFiles: [],
			unresolvedMentions: [
				{ linkName: "고급 타입", mentionedIn: ["til/ts/a.md"] },
			],
		};
		const text = formatTopicContext(result);
		expect(text).toContain("Unresolved Related Links");
		expect(text).toContain("[고급 타입](고급 타입.md)");
		expect(text).not.toContain("Related Files");
	});
});

describe("extractCategory", () => {
	it("extracts the subfolder name as category", () => {
		expect(extractCategory("til/typescript/generics.md", "til")).toBe("typescript");
	});

	it("returns (uncategorized) for root files", () => {
		expect(extractCategory("til/overview.md", "til")).toBe("(uncategorized)");
	});

	it("returns the first folder as category from a deep path", () => {
		expect(extractCategory("til/react/advanced/patterns.md", "til")).toBe("react");
	});

	it("supports a custom tilPath", () => {
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

	it("groups by category", () => {
		const result = groupFilesByCategory(paths, "til");
		expect(result["typescript"]).toHaveLength(2);
		expect(result["react"]).toHaveLength(1);
		expect(result["(uncategorized)"]).toContain("til/overview.md");
	});

	it("excludes files outside tilPath", () => {
		const result = groupFilesByCategory(paths, "til");
		const allPaths = Object.values(result).flat();
		expect(allPaths).not.toContain("notes/other.md");
	});

	it("applies a category filter", () => {
		const result = groupFilesByCategory(paths, "til", "typescript");
		expect(Object.keys(result)).toEqual(["typescript"]);
		expect(result["typescript"]).toHaveLength(2);
	});

	it("returns empty result for a non-existent category filter", () => {
		const result = groupFilesByCategory(paths, "til", "nonexistent");
		expect(Object.keys(result)).toHaveLength(0);
	});

	it("returns an empty object from an empty array", () => {
		const result = groupFilesByCategory([], "til");
		expect(result).toEqual({});
	});
});

describe("formatRecentContext", () => {
	it("outputs the correct format when there is activity", () => {
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
		expect(text).toContain("Recent Learning Activity (7 days, 2 files)");
		expect(text).toContain("2026-02-17");
		expect(text).toContain("2026-02-16");
		expect(text).toContain("til/ts/generics.md");
	});

	it("outputs a guidance message when there is no activity", () => {
		const result: RecentContextResult = {
			days: 7,
			totalFiles: 0,
			groups: [],
		};
		const text = formatRecentContext(result);
		expect(text).toContain("No learning activity in the last");
	});
});
