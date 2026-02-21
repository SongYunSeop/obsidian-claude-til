import { describe, it, expect } from "vitest";
import { parseBacklogItems, extractTopicFromPath, computeBacklogProgress, formatProgressBar, formatBacklogTable, parseBacklogSections, type BacklogCategoryStatus } from "../src/backlog";

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

describe("formatProgressBar", () => {
	it("0%는 모두 빈 칸이다", () => {
		expect(formatProgressBar(0, 10)).toBe("░░░░░░░░░░");
	});

	it("100%는 모두 채워진다", () => {
		expect(formatProgressBar(10, 10)).toBe("██████████");
	});

	it("50%는 반만 채워진다", () => {
		expect(formatProgressBar(5, 10)).toBe("█████░░░░░");
	});

	it("total이 0이면 모두 빈 칸이다", () => {
		expect(formatProgressBar(0, 0)).toBe("░░░░░░░░░░");
	});

	it("커스텀 너비를 지원한다", () => {
		expect(formatProgressBar(3, 4, 4)).toBe("███░");
	});
});

describe("formatBacklogTable", () => {
	it("빈 배열이면 안내 메시지를 반환한다", () => {
		expect(formatBacklogTable([])).toBe("백로그 항목이 없습니다");
	});

	it("카테고리를 마크다운 링크로 출력한다", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "datadog", filePath: "til/datadog/backlog.md", done: 24, total: 25 },
		];
		const result = formatBacklogTable(categories);
		expect(result).toContain("[datadog](til/datadog/backlog.md)");
		expect(result).toContain("96%");
		expect(result).toContain("24/25");
	});

	it("진행률 내림차순으로 정렬한다", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "aws", filePath: "til/aws/backlog.md", done: 0, total: 10 },
			{ category: "datadog", filePath: "til/datadog/backlog.md", done: 9, total: 10 },
		];
		const result = formatBacklogTable(categories);
		const datadogIdx = result.indexOf("[datadog]");
		const awsIdx = result.indexOf("[aws]");
		expect(datadogIdx).toBeLessThan(awsIdx);
	});

	it("총계를 포함한다", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "a", filePath: "til/a/backlog.md", done: 3, total: 5 },
			{ category: "b", filePath: "til/b/backlog.md", done: 2, total: 5 },
		];
		const result = formatBacklogTable(categories);
		expect(result).toContain("총 10개 항목 중 5개 완료 (50%)");
	});

	it("진행바를 포함한다", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "test", filePath: "til/test/backlog.md", done: 5, total: 10 },
		];
		const result = formatBacklogTable(categories);
		expect(result).toContain("█████░░░░░");
	});
});

describe("parseBacklogSections", () => {
	it("섹션별 항목을 파싱한다", () => {
		const content = `## 선행 지식
- [ ] [복리 학습](til/agile-story/compound-learning.md)
- [x] [의도적 수련](til/agile-story/deliberate-practice.md)

## 핵심 개념
- [ ] [성과 공식](til/agile-story/performance-formula.md)`;

		const sections = parseBacklogSections(content);
		expect(sections).toHaveLength(2);
		expect(sections[0]!.heading).toBe("선행 지식");
		expect(sections[0]!.items).toHaveLength(2);
		expect(sections[0]!.items[0]).toEqual({
			displayName: "복리 학습",
			path: "til/agile-story/compound-learning.md",
			done: false,
		});
		expect(sections[0]!.items[1]).toEqual({
			displayName: "의도적 수련",
			path: "til/agile-story/deliberate-practice.md",
			done: true,
		});
		expect(sections[1]!.heading).toBe("핵심 개념");
		expect(sections[1]!.items).toHaveLength(1);
	});

	it("빈 내용은 빈 배열을 반환한다", () => {
		expect(parseBacklogSections("")).toEqual([]);
	});

	it("항목이 없는 섹션은 제외한다", () => {
		const content = `## 설명만 있는 섹션
이것은 설명 텍스트입니다.

## 항목이 있는 섹션
- [ ] [React Hooks](til/react/hooks.md)`;

		const sections = parseBacklogSections(content);
		expect(sections).toHaveLength(1);
		expect(sections[0]!.heading).toBe("항목이 있는 섹션");
	});

	it("[X] 대문자도 완료로 처리한다", () => {
		const content = `## 테스트
- [X] [대문자 완료](til/test/done.md)
- [ ] [미완료](til/test/todo.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.done).toBe(true);
		expect(sections[0]!.items[1]!.done).toBe(false);
	});

	it(".md 확장자가 없는 경로에 .md를 추가한다", () => {
		const content = `## 테스트
- [ ] [항목](til/test/item)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.path).toBe("til/test/item.md");
	});

	it("표시명이 비어있으면 경로를 사용한다", () => {
		const content = `## 테스트
- [ ] [](til/test/item.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.displayName).toBe("til/test/item");
	});
});
