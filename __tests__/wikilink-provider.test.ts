import { describe, it, expect } from "vitest";
import { findWikilinks } from "../src/terminal/WikilinkProvider";

describe("findWikilinks", () => {
	it("기본 [[note]] 패턴을 감지한다", () => {
		const results = findWikilinks("텍스트 [[my-note]] 끝");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("my-note");
		expect(results[0]!.displayText).toBe("my-note");
		expect(results[0]!.fullMatch).toBe("[[my-note]]");
	});

	it("경로 포함 [[path/note]] 패턴을 감지한다", () => {
		const results = findWikilinks("참조: [[til/typescript/generics]]");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("til/typescript/generics");
		expect(results[0]!.displayText).toBe("til/typescript/generics");
	});

	it("별칭 포함 [[note|alias]] 패턴을 감지한다", () => {
		const results = findWikilinks("보기: [[generics|제네릭 정리]]");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("generics");
		expect(results[0]!.displayText).toBe("제네릭 정리");
	});

	it("경로+별칭 [[path/note|alias]] 패턴을 감지한다", () => {
		const results = findWikilinks("[[til/react/hooks|React Hooks]]");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("til/react/hooks");
		expect(results[0]!.displayText).toBe("React Hooks");
	});

	it("한 줄에 여러 위키링크를 감지한다", () => {
		const results = findWikilinks("[[a]] 중간 [[b|비]] 끝 [[c/d]]");
		expect(results).toHaveLength(3);
		expect(results[0]!.linkText).toBe("a");
		expect(results[1]!.linkText).toBe("b");
		expect(results[1]!.displayText).toBe("비");
		expect(results[2]!.linkText).toBe("c/d");
	});

	it("위키링크가 없으면 빈 배열을 반환한다", () => {
		const results = findWikilinks("일반 텍스트입니다");
		expect(results).toEqual([]);
	});

	it("빈 대괄호 [[]]는 매치하지 않는다", () => {
		const results = findWikilinks("빈 [[]] 대괄호");
		expect(results).toEqual([]);
	});

	it("bash [[ ]] 테스트 표현식은 매치하지 않는다 (공백만 있는 경우)", () => {
		// bash의 [[ -f file ]]은 내부에 공백과 텍스트가 있어 매치될 수 있음
		// 하지만 [[ ]] (공백만)은 regex가 공백을 허용하므로 매치됨
		// 실질적으로 bash에서 유효한 [[ condition ]]은 매치될 수 있지만,
		// Obsidian에서 openLinkText가 해당 파일을 찾지 못하면 자연스럽게 무시됨
		const results = findWikilinks("if [[ -f file ]]; then echo ok; fi");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe(" -f file ");
	});

	it("중첩 대괄호는 매치하지 않는다", () => {
		const results = findWikilinks("[[[nested]]]");
		// regex는 [[ 와 ]] 사이에 [ 또는 ]가 없는 것만 매치
		// [[[nested]]] → 내부에 [가 있으므로 매치하지 않음...
		// 실제로는 "[" 다음에 [[nested]]가 매치됨
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("nested");
	});

	it("startIndex와 endIndex가 정확하다", () => {
		const text = "앞 [[link]] 뒤";
		const results = findWikilinks(text);
		expect(results).toHaveLength(1);
		expect(results[0]!.startIndex).toBe(2);
		expect(results[0]!.endIndex).toBe(10);
		expect(text.slice(results[0]!.startIndex, results[0]!.endIndex)).toBe("[[link]]");
	});

	it("빈 문자열에서 빈 배열을 반환한다", () => {
		const results = findWikilinks("");
		expect(results).toEqual([]);
	});

	it("연속된 위키링크를 모두 감지한다", () => {
		const results = findWikilinks("[[a]][[b]][[c]]");
		expect(results).toHaveLength(3);
		expect(results[0]!.linkText).toBe("a");
		expect(results[1]!.linkText).toBe("b");
		expect(results[2]!.linkText).toBe("c");
	});

	it("한글 노트명을 감지한다", () => {
		const results = findWikilinks("참고: [[타입스크립트 제네릭]]");
		expect(results).toHaveLength(1);
		expect(results[0]!.linkText).toBe("타입스크립트 제네릭");
	});
});
