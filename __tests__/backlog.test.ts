import { describe, it, expect } from "vitest";
import { parseBacklogItems, extractTopicFromPath } from "../src/backlog";

describe("parseBacklogItems", () => {
	it("미완료 항목 [[path|name]] 을 파싱한다", () => {
		const content = `- [ ] [[til/claude-code/permission-mode|Permission 모드]]
- [ ] [[til/typescript/generics|Generics 완전 정복]]`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/claude-code/permission-mode", displayName: "Permission 모드" },
			{ path: "til/typescript/generics", displayName: "Generics 완전 정복" },
		]);
	});

	it("완료 항목 [x] 는 제외한다", () => {
		const content = `- [x] [[til/done-topic|완료됨]]
- [ ] [[til/pending-topic|진행 중]]`;

		const items = parseBacklogItems(content);
		expect(items).toHaveLength(1);
		expect(items[0]!.displayName).toBe("진행 중");
	});

	it("표시 이름 없는 경우 [[path]] → path를 displayName으로 사용한다", () => {
		const content = `- [ ] [[til/react/hooks]]`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/react/hooks", displayName: "til/react/hooks" },
		]);
	});

	it("빈 문자열은 빈 배열을 반환한다", () => {
		expect(parseBacklogItems("")).toEqual([]);
	});

	it("항목이 없는 내용은 빈 배열을 반환한다", () => {
		const content = `# Backlog

이것은 설명 텍스트입니다.`;

		expect(parseBacklogItems(content)).toEqual([]);
	});

	it("설명 텍스트가 포함된 항목에서 설명을 무시한다", () => {
		const content = `- [ ] [[til/react/hooks|React Hooks]] - 커스텀 훅 패턴 학습`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/react/hooks", displayName: "React Hooks" },
		]);
	});

	it("완료/미완료 항목이 섞여있어도 정확히 파싱한다", () => {
		const content = `# Claude Code 학습

- [x] [[til/claude-code/basics|기본 사용법]]
- [ ] [[til/claude-code/mcp|MCP 서버]]
- [x] [[til/claude-code/hooks|Hook 시스템]]
- [ ] [[til/claude-code/skills|Skill 작성]]`;

		const items = parseBacklogItems(content);
		expect(items).toHaveLength(2);
		expect(items.map((i) => i.displayName)).toEqual(["MCP 서버", "Skill 작성"]);
	});
});

describe("extractTopicFromPath", () => {
	it("til/category/slug.md → { topic, category }", () => {
		const result = extractTopicFromPath("til/claude-code/permission-mode.md", "til");
		expect(result).toEqual({ topic: "permission-mode", category: "claude-code" });
	});

	it("확장자 없는 경로도 동일하게 처리한다", () => {
		const result = extractTopicFromPath("til/typescript/generics", "til");
		expect(result).toEqual({ topic: "generics", category: "typescript" });
	});

	it("tilPath 밖 경로는 null을 반환한다", () => {
		const result = extractTopicFromPath("notes/daily.md", "til");
		expect(result).toBeNull();
	});

	it("backlog.md 경로는 null을 반환한다", () => {
		const result = extractTopicFromPath("til/claude-code/backlog.md", "til");
		expect(result).toBeNull();
	});

	it("tilPath 루트의 파일은 null을 반환한다 (category 없음)", () => {
		const result = extractTopicFromPath("til/readme.md", "til");
		expect(result).toBeNull();
	});

	it("커스텀 tilPath를 지원한다", () => {
		const result = extractTopicFromPath("learning/til/react/hooks.md", "learning/til");
		expect(result).toEqual({ topic: "hooks", category: "react" });
	});

	it("깊은 경로도 처리한다", () => {
		const result = extractTopicFromPath("til/react/advanced/patterns.md", "til");
		expect(result).toEqual({ topic: "advanced/patterns", category: "react" });
	});
});
