import { describe, it, expect } from "vitest";
import { parseBacklogItems, extractTopicFromPath, computeBacklogProgress, formatProgressBar, formatBacklogTable, parseBacklogSections, parseFrontmatterSources, checkBacklogItem, type BacklogCategoryStatus } from "../src/backlog";

describe("parseBacklogItems", () => {
	it("parses incomplete items [name](path.md)", () => {
		const content = `- [ ] [Permission 모드](til/claude-code/permission-mode.md)
- [ ] [Generics 완전 정복](til/typescript/generics.md)`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/claude-code/permission-mode", displayName: "Permission 모드" },
			{ path: "til/typescript/generics", displayName: "Generics 완전 정복" },
		]);
	});

	it("excludes completed items [x]", () => {
		const content = `- [x] [완료됨](til/done-topic.md)
- [ ] [진행 중](til/pending-topic.md)`;

		const items = parseBacklogItems(content);
		expect(items).toHaveLength(1);
		expect(items[0]!.displayName).toBe("진행 중");
	});

	it("uses path as displayName when display name is absent", () => {
		const content = `- [ ] [](til/react/hooks.md)`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/react/hooks", displayName: "til/react/hooks" },
		]);
	});

	it("returns empty array for empty string", () => {
		expect(parseBacklogItems("")).toEqual([]);
	});

	it("returns empty array for content with no items", () => {
		const content = `# Backlog

이것은 설명 텍스트입니다.`;

		expect(parseBacklogItems(content)).toEqual([]);
	});

	it("ignores description text in items that contain description", () => {
		const content = `- [ ] [React Hooks](til/react/hooks.md) - 커스텀 훅 패턴 학습`;

		const items = parseBacklogItems(content);
		expect(items).toEqual([
			{ path: "til/react/hooks", displayName: "React Hooks" },
		]);
	});

	it("parses correctly even when completed and incomplete items are mixed", () => {
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
	it("counts completed and incomplete items", () => {
		const content = "- [x] 완료\n- [ ] 미완료1\n- [ ] 미완료2";
		const result = computeBacklogProgress(content);
		expect(result.done).toBe(1);
		expect(result.todo).toBe(2);
	});

	it("counts uppercase [X] as completed", () => {
		const content = "- [X] 대문자 완료\n- [x] 소문자 완료\n- [ ] 미완료";
		const result = computeBacklogProgress(content);
		expect(result.done).toBe(2);
		expect(result.todo).toBe(1);
	});

	it("returns 0 when no checkboxes", () => {
		const content = "# Empty backlog\nNo items here.";
		const result = computeBacklogProgress(content);
		expect(result.done).toBe(0);
		expect(result.todo).toBe(0);
	});

	it("returns 0 for empty string", () => {
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

	it("handles path without extension the same way", () => {
		const result = extractTopicFromPath("til/typescript/generics", "til");
		expect(result).toEqual({ topic: "generics", category: "typescript" });
	});

	it("returns null for paths outside tilPath", () => {
		const result = extractTopicFromPath("notes/daily.md", "til");
		expect(result).toBeNull();
	});

	it("returns null for backlog.md path", () => {
		const result = extractTopicFromPath("til/claude-code/backlog.md", "til");
		expect(result).toBeNull();
	});

	it("returns null for files at tilPath root (no category)", () => {
		const result = extractTopicFromPath("til/readme.md", "til");
		expect(result).toBeNull();
	});

	it("supports custom tilPath", () => {
		const result = extractTopicFromPath("learning/til/react/hooks.md", "learning/til");
		expect(result).toEqual({ topic: "hooks", category: "react" });
	});

	it("handles deep paths", () => {
		const result = extractTopicFromPath("til/react/advanced/patterns.md", "til");
		expect(result).toEqual({ topic: "advanced/patterns", category: "react" });
	});
});

describe("formatProgressBar", () => {
	it("0% is all empty", () => {
		expect(formatProgressBar(0, 10)).toBe("░░░░░░░░░░");
	});

	it("100% is fully filled", () => {
		expect(formatProgressBar(10, 10)).toBe("██████████");
	});

	it("50% is half filled", () => {
		expect(formatProgressBar(5, 10)).toBe("█████░░░░░");
	});

	it("all empty when total is 0", () => {
		expect(formatProgressBar(0, 0)).toBe("░░░░░░░░░░");
	});

	it("supports custom width", () => {
		expect(formatProgressBar(3, 4, 4)).toBe("███░");
	});
});

describe("formatBacklogTable", () => {
	it("returns guidance message for empty array", () => {
		expect(formatBacklogTable([])).toBe("No backlog items found");
	});

	it("outputs categories as markdown links", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "datadog", filePath: "til/datadog/backlog.md", done: 24, total: 25 },
		];
		const result = formatBacklogTable(categories);
		expect(result).toContain("[datadog](til/datadog/backlog.md)");
		expect(result).toContain("96%");
		expect(result).toContain("24/25");
	});

	it("sorts by progress rate in descending order", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "aws", filePath: "til/aws/backlog.md", done: 0, total: 10 },
			{ category: "datadog", filePath: "til/datadog/backlog.md", done: 9, total: 10 },
		];
		const result = formatBacklogTable(categories);
		const datadogIdx = result.indexOf("[datadog]");
		const awsIdx = result.indexOf("[aws]");
		expect(datadogIdx).toBeLessThan(awsIdx);
	});

	it("includes totals", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "a", filePath: "til/a/backlog.md", done: 3, total: 5 },
			{ category: "b", filePath: "til/b/backlog.md", done: 2, total: 5 },
		];
		const result = formatBacklogTable(categories);
		expect(result).toContain("5 of 10 items completed (50%)");
	});

	it("includes progress bar", () => {
		const categories: BacklogCategoryStatus[] = [
			{ category: "test", filePath: "til/test/backlog.md", done: 5, total: 10 },
		];
		const result = formatBacklogTable(categories);
		expect(result).toContain("█████░░░░░");
	});
});

describe("parseBacklogSections", () => {
	it("parses items by section", () => {
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

	it("returns empty array for empty content", () => {
		expect(parseBacklogSections("")).toEqual([]);
	});

	it("excludes sections with no items", () => {
		const content = `## 설명만 있는 섹션
이것은 설명 텍스트입니다.

## 항목이 있는 섹션
- [ ] [React Hooks](til/react/hooks.md)`;

		const sections = parseBacklogSections(content);
		expect(sections).toHaveLength(1);
		expect(sections[0]!.heading).toBe("항목이 있는 섹션");
	});

	it("treats uppercase [X] as completed", () => {
		const content = `## 테스트
- [X] [대문자 완료](til/test/done.md)
- [ ] [미완료](til/test/todo.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.done).toBe(true);
		expect(sections[0]!.items[1]!.done).toBe(false);
	});

	it("adds .md to paths without .md extension", () => {
		const content = `## 테스트
- [ ] [항목](til/test/item)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.path).toBe("til/test/item.md");
	});

	it("uses path when display name is empty", () => {
		const content = `## 테스트
- [ ] [](til/test/item.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.displayName).toBe("til/test/item");
	});

	it("maps sourceUrls when frontmatter sources exist", () => {
		const content = `---
tags:
  - backlog
sources:
  compound-learning:
    - https://example.com/compound
    - https://example.com/compound-2
  deliberate-practice:
    - https://example.com/practice
---

## 선행 지식
- [ ] [복리 학습](til/agile-story/compound-learning.md)
- [ ] [의도적 수련](til/agile-story/deliberate-practice.md)
- [ ] [메타 인지](til/agile-story/metacognition.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.sourceUrls).toEqual([
			"https://example.com/compound",
			"https://example.com/compound-2",
		]);
		expect(sections[0]!.items[1]!.sourceUrls).toEqual(["https://example.com/practice"]);
		expect(sections[0]!.items[2]!.sourceUrls).toBeUndefined();
	});

	it("maps single inline URL format as array too", () => {
		const content = `---
sources:
  compound-learning: https://example.com/compound
---

## 선행 지식
- [ ] [복리 학습](til/agile-story/compound-learning.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.sourceUrls).toEqual(["https://example.com/compound"]);
	});

	it("sourceUrls is undefined when no frontmatter sources", () => {
		const content = `---
tags:
  - backlog
---

## 테스트
- [ ] [항목](til/test/item.md)`;

		const sections = parseBacklogSections(content);
		expect(sections[0]!.items[0]!.sourceUrls).toBeUndefined();
	});
});

describe("parseFrontmatterSources", () => {
	it("parses array-format sources", () => {
		const content = `---
tags:
  - backlog
sources:
  compound-learning:
    - https://example.com/compound
    - https://example.com/compound-alt
  deliberate-practice:
    - https://example.com/practice
updated: 2026-02-21
---

# 학습 백로그`;

		const sources = parseFrontmatterSources(content);
		expect(sources).toEqual({
			"compound-learning": ["https://example.com/compound", "https://example.com/compound-alt"],
			"deliberate-practice": ["https://example.com/practice"],
		});
	});

	it("returns inline single URL as array too", () => {
		const content = `---
sources:
  compound-learning: https://example.com/compound
---

# 학습 백로그`;

		const sources = parseFrontmatterSources(content);
		expect(sources).toEqual({
			"compound-learning": ["https://example.com/compound"],
		});
	});

	it("returns empty object when no frontmatter", () => {
		const content = `# 백로그
- [ ] [항목](til/test/item.md)`;

		expect(parseFrontmatterSources(content)).toEqual({});
	});

	it("returns empty object when no sources key", () => {
		const content = `---
tags:
  - backlog
updated: 2026-02-21
---

# 백로그`;

		expect(parseFrontmatterSources(content)).toEqual({});
	});

	it("returns empty object when sources is empty", () => {
		const content = `---
sources:
updated: 2026-02-21
---`;

		expect(parseFrontmatterSources(content)).toEqual({});
	});
});

describe("checkBacklogItem", () => {
	it("checks incomplete item matching slug as [x]", () => {
		const content = `## 핵심 개념
- [ ] [제네릭](til/typescript/generics.md) - 타입 매개변수
- [ ] [매핑된 타입](til/typescript/mapped-types.md)`;

		const result = checkBacklogItem(content, "generics");
		expect(result.found).toBe(true);
		expect(result.alreadyDone).toBe(false);
		expect(result.content).toContain("- [x] [제네릭](til/typescript/generics.md)");
		expect(result.content).toContain("- [ ] [매핑된 타입](til/typescript/mapped-types.md)");
	});

	it("returns alreadyDone for already completed items", () => {
		const content = `## 핵심 개념
- [x] [제네릭](til/typescript/generics.md)
- [ ] [타입](til/typescript/types.md)`;

		const result = checkBacklogItem(content, "generics");
		expect(result.found).toBe(true);
		expect(result.alreadyDone).toBe(true);
	});

	it("recognizes uppercase [X] completion as alreadyDone", () => {
		const content = `## 테스트
- [X] [항목](til/test/item.md)`;

		const result = checkBacklogItem(content, "item");
		expect(result.found).toBe(true);
		expect(result.alreadyDone).toBe(true);
	});

	it("returns found=false when slug does not match", () => {
		const content = `## 테스트
- [ ] [제네릭](til/typescript/generics.md)`;

		const result = checkBacklogItem(content, "nonexistent");
		expect(result.found).toBe(false);
		expect(result.alreadyDone).toBe(false);
		expect(result.content).toBe(content);
	});

	it("matches slug even in paths without extension", () => {
		const content = `## 테스트
- [ ] [항목](til/test/my-item)`;

		const result = checkBacklogItem(content, "my-item");
		expect(result.found).toBe(true);
		expect(result.alreadyDone).toBe(false);
		expect(result.content).toContain("- [x] [항목](til/test/my-item)");
	});

	it("checks only the first matching item", () => {
		const content = `## 섹션1
- [ ] [A](til/a/slug.md)
## 섹션2
- [ ] [B](til/b/slug.md)`;

		const result = checkBacklogItem(content, "slug");
		expect(result.found).toBe(true);
		// only the first one is checked
		const lines = result.content.split("\n");
		expect(lines.find((l) => l.includes("til/a/slug.md"))).toContain("[x]");
		expect(lines.find((l) => l.includes("til/b/slug.md"))).toContain("[ ]");
	});

	it("returns found=false for empty content", () => {
		const result = checkBacklogItem("", "slug");
		expect(result.found).toBe(false);
	});
});
