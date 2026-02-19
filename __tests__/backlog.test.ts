import { describe, it, expect } from "vitest";
import { parseBacklogItems, extractTopicFromPath, computeBacklogProgress } from "../src/backlog";

describe("parseBacklogItems", () => {
	it("미완료 항목 [name](path.md) 을 파싱한다", () => {
		const content = `- [ ] [Permission 모드](til/claude-code/permission-mode.md)
- [ ] [Generics 완전 정복](til/typescript/generics.md)`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/claude-code/permission-mode", displayName: "Permission 모드" },
			{ path: "til/typescript/generics", displayName: "Generics 완전 정복" },
		]);
	});

	it("완료 항목 [x] 는 제외한다", () => {
		const content = `- [x] [완료됨](til/done-topic.md)
- [ ] [진행 중](til/pending-topic.md)`;

		const items = parseBacklogItems(content);
		expect(items).toHaveLength(1);
		expect(items[0]!.displayName).toBe("진행 중");
	});

	it("표시 이름 없는 경우 path를 displayName으로 사용한다", () => {
		const content = `- [ ] [](til/react/hooks.md)`;

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
		const content = `- [ ] [React Hooks](til/react/hooks.md) - 커스텀 훅 패턴 학습`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/react/hooks", displayName: "React Hooks" },
		]);
	});

	it("완료/미완료 항목이 섞여있어도 정확히 파싱한다", () => {
		const content = `# Claude Code 학습

- [x] [기본 사용법](til/claude-code/basics.md)
- [ ] [MCP 서버](til/claude-code/mcp.md)
- [x] [Hook 시스템](til/claude-code/hooks.md)
- [ ] [Skill 작성](til/claude-code/skills.md)`;

		const items = parseBacklogItems(content);
		expect(items).toHaveLength(2);
		expect(items.map((i) => i.displayName)).toEqual(["MCP 서버", "Skill 작성"]);
	});
});

describe("computeBacklogProgress", () => {
	it("완료/미완료 항목 수를 계산한다", () => {
		const content = "- [x] 완료\n- [ ] 미완료1\n- [ ] 미완료2";
		const result = computeBacklogProgress(content);
		expect(result.done).toBe(1);
		expect(result.todo).toBe(2);
	});

	it("[X] 대문자도 완료로 카운트한다", () => {
		const content = "- [X] 대문자 완료\n- [x] 소문자 완료\n- [ ] 미완료";
		const result = computeBacklogProgress(content);
		expect(result.done).toBe(2);
		expect(result.todo).toBe(1);
	});

	it("체크박스가 없으면 0을 반환한다", () => {
		const content = "# Empty backlog\nNo items here.";
		const result = computeBacklogProgress(content);
		expect(result.done).toBe(0);
		expect(result.todo).toBe(0);
	});

	it("빈 문자열에서 0을 반환한다", () => {
		const result = computeBacklogProgress("");
		expect(result.done).toBe(0);
		expect(result.todo).toBe(0);
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
