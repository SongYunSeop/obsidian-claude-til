import { describe, it, expect } from "vitest";
import { findMarkdownLinks, isFullWidth, cellWidth } from "../src/terminal/MarkdownLinkProvider";

describe("findMarkdownLinks", () => {
	it("기본 [text](path.md) 패턴을 감지한다", () => {
		const results = findMarkdownLinks("텍스트 [my note](my-note.md) 끝");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("my-note.md");
		expect(results[0]!.displayText).toBe("my note");
		expect(results[0]!.fullMatch).toBe("[my note](my-note.md)");
	});

	it("경로 포함 [text](til/typescript/generics.md) 패턴을 감지한다", () => {
		const results = findMarkdownLinks("참조: [Generics](til/typescript/generics.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("til/typescript/generics.md");
		expect(results[0]!.displayText).toBe("Generics");
	});

	it("한국어 텍스트를 감지한다", () => {
		const results = findMarkdownLinks("보기: [제네릭](generics.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("제네릭");
		expect(results[0]!.linkText).toBe("generics.md");
	});

	it("한 줄에 여러 링크를 감지한다", () => {
		const results = findMarkdownLinks("[a](a.md) 중간 [비](b.md) 끝 [c/d](c/d.md)");
		expect(results).toHaveLength(3);
		expect(results[0]!.displayText).toBe("a");
		expect(results[0]!.linkText).toBe("a.md");
		expect(results[1]!.displayText).toBe("비");
		expect(results[1]!.linkText).toBe("b.md");
		expect(results[2]!.displayText).toBe("c/d");
		expect(results[2]!.linkText).toBe("c/d.md");
	});

	it("마크다운 링크가 없으면 빈 배열을 반환한다", () => {
		const results = findMarkdownLinks("일반 텍스트입니다");
		expect(results).toEqual([]);
	});

	it("이미지 ![alt](img.png)는 매치하지 않는다", () => {
		const results = findMarkdownLinks("이미지: ![screenshot](img.png)");
		expect(results).toEqual([]);
	});

	it("이미지와 링크가 섞여있으면 링크만 감지한다", () => {
		const results = findMarkdownLinks("![img](a.png) 그리고 [노트](b.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("노트");
		expect(results[0]!.linkText).toBe("b.md");
	});

	it("빈 문자열에서 빈 배열을 반환한다", () => {
		const results = findMarkdownLinks("");
		expect(results).toEqual([]);
	});

	it("연속된 링크를 모두 감지한다", () => {
		const results = findMarkdownLinks("[a](a.md)[b](b.md)[c](c.md)");
		expect(results).toHaveLength(3);
		expect(results[0]!.displayText).toBe("a");
		expect(results[1]!.displayText).toBe("b");
		expect(results[2]!.displayText).toBe("c");
	});

	it("한글 노트명을 감지한다", () => {
		const results = findMarkdownLinks("참고: [타입스크립트 제네릭](typescript-generics.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("타입스크립트 제네릭");
	});

	it("startIndex와 endIndex가 정확하다", () => {
		const text = "앞 [link](path.md) 뒤";
		const results = findMarkdownLinks(text);
		expect(results).toHaveLength(1);
		expect(results[0]!.startIndex).toBe(2);
		expect(results[0]!.endIndex).toBe(17);
		expect(text.slice(results[0]!.startIndex, results[0]!.endIndex)).toBe("[link](path.md)");
	});

	it("빈 표시 텍스트 [](path.md)는 경로를 displayText로 사용한다", () => {
		const results = findMarkdownLinks("[](some/path.md)");
		expect(results).toHaveLength(1);
		expect(results[0]!.displayText).toBe("some/path.md");
		expect(results[0]!.linkText).toBe("some/path.md");
	});

	it("확장자 없는 경로도 감지한다", () => {
		const results = findMarkdownLinks("[note](some/path)");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("some/path");
	});
});

describe("isFullWidth", () => {
	it("한글 음절은 전각이다", () => {
		expect(isFullWidth("가".codePointAt(0)!)).toBe(true);
		expect(isFullWidth("힣".codePointAt(0)!)).toBe(true);
	});

	it("CJK 한자는 전각이다", () => {
		expect(isFullWidth("中".codePointAt(0)!)).toBe(true);
	});

	it("일본어 히라가나/카타카나는 전각이다", () => {
		expect(isFullWidth("あ".codePointAt(0)!)).toBe(true);
		expect(isFullWidth("ア".codePointAt(0)!)).toBe(true);
	});

	it("ASCII 문자는 반각이다", () => {
		expect(isFullWidth("a".codePointAt(0)!)).toBe(false);
		expect(isFullWidth("[".codePointAt(0)!)).toBe(false);
		expect(isFullWidth(" ".codePointAt(0)!)).toBe(false);
	});
});

describe("cellWidth", () => {
	it("ASCII만 있으면 문자 수와 같다", () => {
		expect(cellWidth("hello", 5)).toBe(5);
		expect(cellWidth("[link](path.md)", 1)).toBe(1);
	});

	it("한글은 2셀 너비로 계산한다", () => {
		expect(cellWidth("앞 ", 1)).toBe(2);  // "앞" = 2셀
		expect(cellWidth("앞 ", 2)).toBe(3);  // "앞 " = 2 + 1 = 3셀
	});

	it("한글 앞의 마크다운 링크 셀 위치가 정확하다", () => {
		const text = "앞 [link](path.md) 뒤";
		const m = findMarkdownLinks(text)[0]!;
		// "앞 " = 2 + 1 = 3셀 → 링크 시작 셀 = 4 (1-based)
		expect(cellWidth(text, m.startIndex) + 1).toBe(4);
	});

	it("한글이 포함된 링크의 셀 너비가 정확하다", () => {
		const text = "참고: [타입스크립트](ts.md)";
		const m = findMarkdownLinks(text)[0]!;
		// "참고: " = 2+2+1+1 = 6셀 → 시작 셀 = 7
		expect(cellWidth(text, m.startIndex) + 1).toBe(7);
	});

	it("빈 문자열은 0이다", () => {
		expect(cellWidth("", 0)).toBe(0);
	});
});
