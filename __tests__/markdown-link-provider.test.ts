import { describe, it, expect } from "vitest";
import { findMarkdownLinks, findTilFilePaths, isFullWidth, cellWidth, parseOsc8Uri } from "../src/obsidian/terminal/MarkdownLinkProvider";

describe("findMarkdownLinks", () => {
	it("detects basic [text](path.md) pattern", () => {
		const results = findMarkdownLinks("텍스트 [my note](my-note.md) 끝");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("my-note.md");
		expect(results[0]!.displayText).toBe("my note");
		expect(results[0]!.fullMatch).toBe("[my note](my-note.md)");
	});

	it("detects path-included [text](til/typescript/generics.md) pattern", () => {
		const results = findMarkdownLinks("참조: [Generics](til/typescript/generics.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("til/typescript/generics.md");
		expect(results[0]!.displayText).toBe("Generics");
	});

	it("detects Korean text", () => {
		const results = findMarkdownLinks("보기: [제네릭](generics.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("제네릭");
		expect(results[0]!.linkText).toBe("generics.md");
	});

	it("detects multiple links on a single line", () => {
		const results = findMarkdownLinks("[a](a.md) 중간 [비](b.md) 끝 [c/d](c/d.md)");
		expect(results).toHaveLength(3);
		expect(results[0]!.displayText).toBe("a");
		expect(results[0]!.linkText).toBe("a.md");
		expect(results[1]!.displayText).toBe("비");
		expect(results[1]!.linkText).toBe("b.md");
		expect(results[2]!.displayText).toBe("c/d");
		expect(results[2]!.linkText).toBe("c/d.md");
	});

	it("returns empty array when no markdown links", () => {
		const results = findMarkdownLinks("일반 텍스트입니다");
		expect(results).toEqual([]);
	});

	it("does not match image ![alt](img.png)", () => {
		const results = findMarkdownLinks("이미지: ![screenshot](img.png)");
		expect(results).toEqual([]);
	});

	it("detects only links when images and links are mixed", () => {
		const results = findMarkdownLinks("![img](a.png) 그리고 [노트](b.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("노트");
		expect(results[0]!.linkText).toBe("b.md");
	});

	it("returns empty array for empty string", () => {
		const results = findMarkdownLinks("");
		expect(results).toEqual([]);
	});

	it("detects all consecutive links", () => {
		const results = findMarkdownLinks("[a](a.md)[b](b.md)[c](c.md)");
		expect(results).toHaveLength(3);
		expect(results[0]!.displayText).toBe("a");
		expect(results[1]!.displayText).toBe("b");
		expect(results[2]!.displayText).toBe("c");
	});

	it("detects Korean note names", () => {
		const results = findMarkdownLinks("참고: [타입스크립트 제네릭](typescript-generics.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("타입스크립트 제네릭");
	});

	it("startIndex and endIndex are accurate", () => {
		const text = "앞 [link](path.md) 뒤";
		const results = findMarkdownLinks(text);
		expect(results).toHaveLength(1);
		expect(results[0]!.startIndex).toBe(2);
		expect(results[0]!.endIndex).toBe(17);
		expect(text.slice(results[0]!.startIndex, results[0]!.endIndex)).toBe("[link](path.md)");
	});

	it("uses path as displayText for empty display text [](path.md)", () => {
		const results = findMarkdownLinks("[](some/path.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("some/path.md");
		expect(results[0]!.linkText).toBe("some/path.md");
	});

	it("detects paths without extension", () => {
		const results = findMarkdownLinks("[note](some/path)");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("some/path");
	});
});

describe("findTilFilePaths", () => {
	it("detects basic til/category/slug.md pattern", () => {
		const results = findTilFilePaths("- til/datadog/backlog.md");
		expect(results).toHaveLength(1);
		expect(results[0]!.filePath).toBe("til/datadog/backlog.md");
	});

	it("detects Korean category", () => {
		const results = findTilFilePaths("│ til/도시정비사업/backlog.md │");
		expect(results).toHaveLength(1);
		expect(results[0]!.filePath).toBe("til/도시정비사업/backlog.md");
	});

	it("detects multiple paths on a single line", () => {
		const results = findTilFilePaths("til/a/b.md 그리고 til/c/d.md");
		expect(results).toHaveLength(2);
		expect(results[0]!.filePath).toBe("til/a/b.md");
		expect(results[1]!.filePath).toBe("til/c/d.md");
	});

	it("excludes paths inside () of markdown links", () => {
		const results = findTilFilePaths("[datadog](til/datadog/backlog.md)");
		expect(results).toEqual([]);
	});

	it("ignores paths not starting with til/", () => {
		const results = findTilFilePaths("src/main.ts some/path.md");
		expect(results).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		expect(findTilFilePaths("")).toEqual([]);
	});

	it("detects paths inside table cells", () => {
		const results = findTilFilePaths("│ til/postgresql/vacuum.md          │ 0%  │");
		expect(results).toHaveLength(1);
		expect(results[0]!.filePath).toBe("til/postgresql/vacuum.md");
	});

	it("detects slugs containing hyphens", () => {
		const results = findTilFilePaths("til/claude-code/permission-mode.md");
		expect(results).toHaveLength(1);
		expect(results[0]!.filePath).toBe("til/claude-code/permission-mode.md");
	});

	it("startIndex and endIndex are accurate", () => {
		const text = "- til/aws/rds-proxy.md";
		const results = findTilFilePaths(text);
		expect(results).toHaveLength(1);
		expect(results[0]!.startIndex).toBe(2);
		expect(results[0]!.endIndex).toBe(22);
		expect(text.slice(results[0]!.startIndex, results[0]!.endIndex)).toBe("til/aws/rds-proxy.md");
	});

	it("ignores extensions other than .md", () => {
		const results = findTilFilePaths("til/test/file.txt til/test/file.js");
		expect(results).toEqual([]);
	});
});

describe("isFullWidth", () => {
	it("Korean syllables are full-width", () => {
		expect(isFullWidth("가".codePointAt(0)!)).toBe(true);
		expect(isFullWidth("힣".codePointAt(0)!)).toBe(true);
	});

	it("CJK characters are full-width", () => {
		expect(isFullWidth("中".codePointAt(0)!)).toBe(true);
	});

	it("Japanese hiragana/katakana are full-width", () => {
		expect(isFullWidth("あ".codePointAt(0)!)).toBe(true);
		expect(isFullWidth("ア".codePointAt(0)!)).toBe(true);
	});

	it("ASCII characters are half-width", () => {
		expect(isFullWidth("a".codePointAt(0)!)).toBe(false);
		expect(isFullWidth("[".codePointAt(0)!)).toBe(false);
		expect(isFullWidth(" ".codePointAt(0)!)).toBe(false);
	});
});

describe("cellWidth", () => {
	it("equals character count when ASCII only", () => {
		expect(cellWidth("hello", 5)).toBe(5);
		expect(cellWidth("[link](path.md)", 1)).toBe(1);
	});

	it("calculates Korean characters as 2-cell width", () => {
		expect(cellWidth("앞 ", 1)).toBe(2);  // "앞" = 2 cells
		expect(cellWidth("앞 ", 2)).toBe(3);  // "앞 " = 2 + 1 = 3 cells
	});

	it("cell position of markdown link after Korean is accurate", () => {
		const text = "앞 [link](path.md) 뒤";
		const m = findMarkdownLinks(text)[0]!;
		// "앞 " = 2 + 1 = 3 cells → link start cell = 4 (1-based)
		expect(cellWidth(text, m.startIndex) + 1).toBe(4);
	});

	it("cell width of link containing Korean is accurate", () => {
		const text = "참고: [타입스크립트](ts.md)";
		const m = findMarkdownLinks(text)[0]!;
		// "참고: " = 2+2+1+1 = 6 cells → start cell = 7
		expect(cellWidth(text, m.startIndex) + 1).toBe(7);
	});

	it("빈 문자열은 0이다", () => {
		expect(cellWidth("", 0)).toBe(0);
	});
});

describe("parseOsc8Uri", () => {
	const vaultPath = "/Users/yunseop/workspace/obsidian-vault";

	it("file:// URI에서 vault 상대 경로를 추출한다", () => {
		const uri = "file:///Users/yunseop/workspace/obsidian-vault/til/typescript/generics.md";
		expect(parseOsc8Uri(uri, vaultPath)).toBe("til/typescript/generics.md");
	});

	it("한글 카테고리 경로를 처리한다", () => {
		const uri = "file:///Users/yunseop/workspace/obsidian-vault/til/%EB%8F%84%EC%8B%9C%EC%A0%95%EB%B9%84%EC%82%AC%EC%97%85/backlog.md";
		expect(parseOsc8Uri(uri, vaultPath)).toBe("til/도시정비사업/backlog.md");
	});

	it("절대 경로에서 vault 상대 경로를 추출한다", () => {
		const uri = "/Users/yunseop/workspace/obsidian-vault/til/datadog/rum.md";
		expect(parseOsc8Uri(uri, vaultPath)).toBe("til/datadog/rum.md");
	});

	it("상대 경로는 그대로 반환한다", () => {
		expect(parseOsc8Uri("til/aws/rds.md", vaultPath)).toBe("til/aws/rds.md");
	});

	it("vault 외부 경로는 null을 반환한다", () => {
		const uri = "file:///Users/other/docs/note.md";
		expect(parseOsc8Uri(uri, vaultPath)).toBeNull();
	});

	it("vault 외부 절대 경로는 null을 반환한다", () => {
		expect(parseOsc8Uri("/tmp/other/file.md", vaultPath)).toBeNull();
	});

	it("vaultPath에 trailing slash가 있어도 동작한다", () => {
		const uri = "file:///Users/yunseop/workspace/obsidian-vault/til/a/b.md";
		expect(parseOsc8Uri(uri, vaultPath + "/")).toBe("til/a/b.md");
	});
});
