import { describe, it, expect } from "vitest";
import {
	parseWikilink,
	toMarkdownLink,
	countWikilinks,
	migrateLinks,
	hasWikilinks,
} from "../src/migrate-links";

describe("parseWikilink", () => {
	it("단순 경로를 파싱한다", () => {
		expect(parseWikilink("til/cat/slug")).toEqual({
			path: "til/cat/slug",
			displayText: "til/cat/slug",
		});
	});

	it("alias 포함 경로를 파싱한다", () => {
		expect(parseWikilink("til/cat/slug|Display")).toEqual({
			path: "til/cat/slug",
			displayText: "Display",
		});
	});

	it("이스케이프 파이프를 구분자로 처리한다", () => {
		expect(parseWikilink("path\\|name")).toEqual({
			path: "path",
			displayText: "name",
		});
	});

	it(".md 포함 경로를 유지한다", () => {
		expect(parseWikilink("til/cat/slug.md|Name")).toEqual({
			path: "til/cat/slug.md",
			displayText: "Name",
		});
	});

	it("한글 displayText를 처리한다", () => {
		expect(parseWikilink("til/react/hooks|리액트 훅")).toEqual({
			path: "til/react/hooks",
			displayText: "리액트 훅",
		});
	});
});

describe("toMarkdownLink", () => {
	it(".md 확장자를 자동 추가한다", () => {
		expect(toMarkdownLink("path", "name")).toBe("[name](path.md)");
	});

	it(".md 중복 추가를 방지한다", () => {
		expect(toMarkdownLink("path.md", "name")).toBe("[name](path.md)");
	});

	it("긴 경로를 처리한다", () => {
		expect(toMarkdownLink("til/typescript/generics", "Generics")).toBe(
			"[Generics](til/typescript/generics.md)",
		);
	});
});

describe("countWikilinks", () => {
	it("일반 텍스트에서 wikilink를 카운트한다", () => {
		const content = "참고: [[til/a]] 그리고 [[til/b|B]]";
		expect(countWikilinks(content)).toBe(2);
	});

	it("fenced 코드 블록 내부 wikilink를 제외한다", () => {
		const content = "텍스트 [[til/a]]\n```\n[[til/b]]\n```\n[[til/c]]";
		expect(countWikilinks(content)).toBe(2);
	});

	it("인라인 코드 내부 wikilink를 제외한다", () => {
		const content = "텍스트 [[til/a]] 그리고 `[[til/b]]` 끝";
		expect(countWikilinks(content)).toBe(1);
	});

	it("wikilink가 없으면 0을 반환한다", () => {
		expect(countWikilinks("일반 텍스트")).toBe(0);
	});

	it("빈 문자열에서 0을 반환한다", () => {
		expect(countWikilinks("")).toBe(0);
	});
});

describe("migrateLinks", () => {
	it("단순 wikilink를 변환한다", () => {
		const result = migrateLinks("참고: [[path]]");
		expect(result.content).toBe("참고: [path](path.md)");
		expect(result.count).toBe(1);
	});

	it("alias wikilink를 변환한다", () => {
		const result = migrateLinks("참고: [[path|name]]");
		expect(result.content).toBe("참고: [name](path.md)");
		expect(result.count).toBe(1);
	});

	it("테이블 이스케이프 파이프를 처리한다", () => {
		const result = migrateLinks("| [[path\\|name]] |");
		expect(result.content).toBe("| [name](path.md) |");
		expect(result.count).toBe(1);
	});

	it("여러 wikilink를 일괄 변환한다", () => {
		const content = "[[til/a]] 그리고 [[til/b|B 주제]]";
		const result = migrateLinks(content);
		expect(result.content).toBe(
			"[til/a](til/a.md) 그리고 [B 주제](til/b.md)",
		);
		expect(result.count).toBe(2);
	});

	it("fenced 코드 블록 내부를 보존한다", () => {
		const content = "[[til/a]]\n```\n[[til/b]]\n```\n[[til/c]]";
		const result = migrateLinks(content);
		expect(result.content).toBe(
			"[til/a](til/a.md)\n```\n[[til/b]]\n```\n[til/c](til/c.md)",
		);
		expect(result.count).toBe(2);
	});

	it("인라인 코드 내부를 보존한다", () => {
		const content = "변환: [[til/a]] 보존: `[[til/b]]` 끝";
		const result = migrateLinks(content);
		expect(result.content).toBe(
			"변환: [til/a](til/a.md) 보존: `[[til/b]]` 끝",
		);
		expect(result.count).toBe(1);
	});

	it("코드 블록 밖 wikilink만 변환한다 (혼합)", () => {
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

	it("wikilink가 없으면 원본을 유지한다", () => {
		const content = "일반 텍스트입니다.";
		const result = migrateLinks(content);
		expect(result.content).toBe(content);
		expect(result.count).toBe(0);
	});

	it(".md 확장자가 있는 경로를 중복 추가하지 않는다", () => {
		const result = migrateLinks("[[til/cat/slug.md|Name]]");
		expect(result.content).toBe("[Name](til/cat/slug.md)");
		expect(result.count).toBe(1);
	});
});

describe("hasWikilinks", () => {
	it("wikilink가 있으면 true를 반환한다", () => {
		expect(hasWikilinks("텍스트 [[til/a]] 끝")).toBe(true);
	});

	it("코드 블록 안에만 있으면 false를 반환한다", () => {
		expect(hasWikilinks("```\n[[til/a]]\n```")).toBe(false);
	});

	it("인라인 코드 안에만 있으면 false를 반환한다", () => {
		expect(hasWikilinks("코드: `[[til/a]]`")).toBe(false);
	});

	it("모두 변환 후 false를 반환한다", () => {
		const original = "[[til/a]] [[til/b]]";
		const { content } = migrateLinks(original);
		expect(hasWikilinks(content)).toBe(false);
	});

	it("wikilink가 없으면 false를 반환한다", () => {
		expect(hasWikilinks("일반 텍스트")).toBe(false);
	});
});
