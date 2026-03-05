import { describe, it, expect } from "vitest";
import {
	parseWikilink,
	toMarkdownLink,
	countWikilinks,
	migrateLinks,
	hasWikilinks,
} from "../src/migrate-links";

describe("parseWikilink", () => {
	it("parses a simple path", () => {
		expect(parseWikilink("til/cat/slug")).toEqual({
			path: "til/cat/slug",
			displayText: "til/cat/slug",
		});
	});

	it("parses path with alias", () => {
		expect(parseWikilink("til/cat/slug|Display")).toEqual({
			path: "til/cat/slug",
			displayText: "Display",
		});
	});

	it("treats escaped pipe as delimiter", () => {
		expect(parseWikilink("path\\|name")).toEqual({
			path: "path",
			displayText: "name",
		});
	});

	it("preserves path containing .md", () => {
		expect(parseWikilink("til/cat/slug.md|Name")).toEqual({
			path: "til/cat/slug.md",
			displayText: "Name",
		});
	});

	it("handles Korean displayText", () => {
		expect(parseWikilink("til/react/hooks|리액트 훅")).toEqual({
			path: "til/react/hooks",
			displayText: "리액트 훅",
		});
	});
});

describe("toMarkdownLink", () => {
	it("automatically adds .md extension", () => {
		expect(toMarkdownLink("path", "name")).toBe("[name](path.md)");
	});

	it("prevents duplicate .md addition", () => {
		expect(toMarkdownLink("path.md", "name")).toBe("[name](path.md)");
	});

	it("handles a long path", () => {
		expect(toMarkdownLink("til/typescript/generics", "Generics")).toBe(
			"[Generics](til/typescript/generics.md)",
		);
	});
});

describe("countWikilinks", () => {
	it("counts wikilinks in plain text", () => {
		const content = "참고: [[til/a]] 그리고 [[til/b|B]]";
		expect(countWikilinks(content)).toBe(2);
	});

	it("excludes wikilinks inside fenced code blocks", () => {
		const content = "텍스트 [[til/a]]\n```\n[[til/b]]\n```\n[[til/c]]";
		expect(countWikilinks(content)).toBe(2);
	});

	it("excludes wikilinks inside inline code", () => {
		const content = "텍스트 [[til/a]] 그리고 `[[til/b]]` 끝";
		expect(countWikilinks(content)).toBe(1);
	});

	it("returns 0 when no wikilinks", () => {
		expect(countWikilinks("일반 텍스트")).toBe(0);
	});

	it("returns 0 for empty string", () => {
		expect(countWikilinks("")).toBe(0);
	});
});

describe("migrateLinks", () => {
	it("converts a simple wikilink", () => {
		const result = migrateLinks("참고: [[path]]");
		expect(result.content).toBe("참고: [path](path.md)");
		expect(result.count).toBe(1);
	});

	it("converts alias wikilink", () => {
		const result = migrateLinks("참고: [[path|name]]");
		expect(result.content).toBe("참고: [name](path.md)");
		expect(result.count).toBe(1);
	});

	it("handles table escaped pipe", () => {
		const result = migrateLinks("| [[path\\|name]] |");
		expect(result.content).toBe("| [name](path.md) |");
		expect(result.count).toBe(1);
	});

	it("converts multiple wikilinks in bulk", () => {
		const content = "[[til/a]] 그리고 [[til/b|B 주제]]";
		const result = migrateLinks(content);
		expect(result.content).toBe(
			"[til/a](til/a.md) 그리고 [B 주제](til/b.md)",
		);
		expect(result.count).toBe(2);
	});

	it("preserves content inside fenced code blocks", () => {
		const content = "[[til/a]]\n```\n[[til/b]]\n```\n[[til/c]]";
		const result = migrateLinks(content);
		expect(result.content).toBe(
			"[til/a](til/a.md)\n```\n[[til/b]]\n```\n[til/c](til/c.md)",
		);
		expect(result.count).toBe(2);
	});

	it("preserves content inside inline code", () => {
		const content = "변환: [[til/a]] 보존: `[[til/b]]` 끝";
		const result = migrateLinks(content);
		expect(result.content).toBe(
			"변환: [til/a](til/a.md) 보존: `[[til/b]]` 끝",
		);
		expect(result.count).toBe(1);
	});

	it("converts only wikilinks outside code blocks (mixed)", () => {
		const content = `# 제목

[[til/outside]]

\`\`\`typescript
const link = "[[til/inside]]";
\`\`\`

텍스트 \`[[til/inline]]\` 중간

[[til/another|표시 이름]]`;

		const result = migrateLinks(content);
		expect(result.content).toBe(`# 제목

[til/outside](til/outside.md)

\`\`\`typescript
const link = "[[til/inside]]";
\`\`\`

텍스트 \`[[til/inline]]\` 중간

[표시 이름](til/another.md)`);
		expect(result.count).toBe(2);
	});

	it("preserves original content when no wikilinks", () => {
		const content = "일반 텍스트입니다.";
		const result = migrateLinks(content);
		expect(result.content).toBe(content);
		expect(result.count).toBe(0);
	});

	it("does not duplicate .md extension for paths that already have it", () => {
		const result = migrateLinks("[[til/cat/slug.md|Name]]");
		expect(result.content).toBe("[Name](til/cat/slug.md)");
		expect(result.count).toBe(1);
	});
});

describe("hasWikilinks", () => {
	it("returns true when wikilinks exist", () => {
		expect(hasWikilinks("텍스트 [[til/a]] 끝")).toBe(true);
	});

	it("returns false when wikilinks exist only inside code blocks", () => {
		expect(hasWikilinks("```\n[[til/a]]\n```")).toBe(false);
	});

	it("returns false when wikilinks exist only inside inline code", () => {
		expect(hasWikilinks("코드: `[[til/a]]`")).toBe(false);
	});

	it("returns false after all wikilinks are converted", () => {
		const original = "[[til/a]] [[til/b]]";
		const { content } = migrateLinks(original);
		expect(hasWikilinks(content)).toBe(false);
	});

	it("returns false when no wikilinks", () => {
		expect(hasWikilinks("일반 텍스트")).toBe(false);
	});
});
