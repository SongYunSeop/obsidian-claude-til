import { parse as parseYaml } from "yaml";

export interface BacklogItem {
	path: string;        // "til/claude-code/permission-mode"
	displayName: string; // "Permission 모드"
}

/**
 * backlog.md 내용에서 미완료 항목을 파싱한다.
 * 형식: `- [ ] [displayName](path.md)` 또는 `- [ ] [](path.md)`
 * 완료 항목 `- [x]`는 제외한다.
 */
export function parseBacklogItems(content: string): BacklogItem[] {
	const items: BacklogItem[] = [];
	const lines = content.split("\n");

	for (const line of lines) {
		const match = line.match(/^-\s+\[ \]\s+\[([^\[\]]*)\]\(([^()]+)\)/);
		if (match) {
			const rawPath = match[2]!.trim().replace(/\.md$/, "");
			const displayName = match[1]?.trim() || rawPath;
			items.push({ path: rawPath, displayName });
		}
	}

	return items;
}

/**
 * 파일 경로에서 topic과 category를 추출한다.
 * `til/{category}/{slug}.md` → `{ topic: slug, category }`
 */
export interface BacklogProgress {
	todo: number;
	done: number;
}

/**
 * 백로그 내용에서 완료/미완료 항목 수를 계산한다.
 * `- [ ]` → todo, `- [x]`/`- [X]` → done
 */
export function computeBacklogProgress(content: string): BacklogProgress {
	const todoMatches = content.match(/- \[ \]/g);
	const doneMatches = content.match(/- \[x\]/gi);
	return {
		todo: todoMatches?.length ?? 0,
		done: doneMatches?.length ?? 0,
	};
}

export interface BacklogCategoryStatus {
	/** 카테고리명 (예: "datadog") */
	category: string;
	/** backlog.md 파일 경로 (예: "til/datadog/backlog.md") */
	filePath: string;
	/** 완료 항목 수 */
	done: number;
	/** 전체 항목 수 */
	total: number;
}

/**
 * 진행률 바를 생성한다. █ = 완료, ░ = 미완료.
 * 순수 함수 — 부수효과 없음.
 */
export function formatProgressBar(done: number, total: number, width = 10): string {
	if (total === 0) return "░".repeat(width);
	const filled = Math.round((done / total) * width);
	return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * 백로그 카테고리 목록을 마크다운 테이블로 포맷한다.
 * 카테고리명은 [카테고리](경로) 마크다운 링크 형식으로 출력한다.
 * 진행률 내림차순 정렬.
 * 순수 함수 — 부수효과 없음, 단위 테스트 가능.
 */
export function formatBacklogTable(categories: BacklogCategoryStatus[]): string {
	if (categories.length === 0) return "백로그 항목이 없습니다";

	const sorted = [...categories].sort((a, b) => {
		const pctA = a.total > 0 ? a.done / a.total : 0;
		const pctB = b.total > 0 ? b.done / b.total : 0;
		return pctB - pctA;
	});

	const totalDone = sorted.reduce((sum, c) => sum + c.done, 0);
	const totalAll = sorted.reduce((sum, c) => sum + c.total, 0);
	const totalPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

	const lines: string[] = [];
	lines.push("학습 백로그 현황\n");
	lines.push("| 카테고리 | 진행률 | 완료 | 진행바 |");
	lines.push("|---------|--------|------|--------|");

	for (const c of sorted) {
		const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
		const bar = formatProgressBar(c.done, c.total);
		lines.push(`| [${c.category}](${c.filePath}) | ${pct}% | ${c.done}/${c.total} | ${bar} |`);
	}

	lines.push(`\n총 ${totalAll}개 항목 중 ${totalDone}개 완료 (${totalPct}%)`);

	return lines.join("\n");
}

export interface BacklogSectionItem {
	/** 표시명 (예: "지식과 능력은 복리처럼 누적된다") */
	displayName: string;
	/** 파일 경로 (예: "til/agile-story/compound-learning.md") */
	path: string;
	/** 완료 여부 */
	done: boolean;
	/** 원본 출처 URL 목록 (frontmatter sources에서 매핑) */
	sourceUrls?: string[];
}

export interface BacklogSection {
	/** 섹션 제목 (예: "선행 지식") */
	heading: string;
	/** 섹션 내 항목 목록 */
	items: BacklogSectionItem[];
}

/**
 * 백로그 frontmatter에서 sources 맵을 파싱한다.
 * 두 가지 형식을 지원한다:
 * 1. 단일 URL: `  slug: url` → 배열로 정규화
 * 2. 복수 URL: `  slug:\n    - url1\n    - url2`
 * yaml 패키지로 파싱. 순수 함수 — 부수효과 없음.
 */
export function parseFrontmatterSources(content: string): Record<string, string[]> {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) return {};

	let parsed: Record<string, unknown>;
	try {
		parsed = parseYaml(fmMatch[1]!) as Record<string, unknown>;
	} catch {
		return {};
	}

	if (!parsed || typeof parsed !== "object" || !parsed.sources) return {};

	const sources = parsed.sources as Record<string, unknown>;
	if (typeof sources !== "object" || sources === null) return {};

	const result: Record<string, string[]> = {};
	for (const [slug, value] of Object.entries(sources)) {
		if (typeof value === "string") {
			result[slug] = [value];
		} else if (Array.isArray(value)) {
			result[slug] = value.filter((v): v is string => typeof v === "string");
		}
	}
	return result;
}

/**
 * 백로그 내용을 섹션별로 파싱하여 개별 항목을 반환한다.
 * `## 섹션명` 헤딩 아래의 `- [ ]`/`- [x]` 항목을 파싱한다.
 * 순수 함수 — 부수효과 없음.
 */
export function parseBacklogSections(content: string): BacklogSection[] {
	const sources = parseFrontmatterSources(content);
	const sections: BacklogSection[] = [];
	let currentSection: BacklogSection | null = null;

	for (const line of content.split("\n")) {
		const headingMatch = line.match(/^##\s+(.+)/);
		if (headingMatch) {
			currentSection = { heading: headingMatch[1]!.trim(), items: [] };
			sections.push(currentSection);
			continue;
		}

		if (!currentSection) continue;

		const itemMatch = line.match(/^-\s+\[([ xX])\]\s+\[([^\[\]]*)\]\(([^()]+)\)/);
		if (itemMatch) {
			const done = itemMatch[1] !== " ";
			const rawPath = itemMatch[3]!.trim();
			const path = rawPath.endsWith(".md") ? rawPath : rawPath + ".md";
			const displayName = itemMatch[2]?.trim() || path.replace(/\.md$/, "");
			// slug 추출: til/{category}/{slug}.md → slug
			const slug = path.replace(/\.md$/, "").split("/").pop() ?? "";
			const item: BacklogSectionItem = { displayName, path, done };
			if (sources[slug] && sources[slug]!.length > 0) {
				item.sourceUrls = sources[slug];
			}
			currentSection.items.push(item);
		}
	}

	return sections.filter((s) => s.items.length > 0);
}

export function extractTopicFromPath(
	filePath: string,
	tilPath: string,
): { topic: string; category: string } | null {
	const prefix = tilPath.endsWith("/") ? tilPath : tilPath + "/";

	if (!filePath.startsWith(prefix)) return null;

	const relative = filePath.slice(prefix.length);
	const withoutExt = relative.endsWith(".md")
		? relative.slice(0, -3)
		: relative;

	const parts = withoutExt.split("/");
	if (parts.length < 2) return null;

	const lastSegment = parts[parts.length - 1];
	if (lastSegment === "backlog") return null;

	const category = parts[0]!;
	const topic = parts.slice(1).join("/");

	return { topic, category };
}
