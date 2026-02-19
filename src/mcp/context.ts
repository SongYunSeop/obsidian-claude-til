/**
 * MCP 학습 컨텍스트 도구의 순수 함수 모듈.
 * backlog.ts 패턴을 따라 Obsidian API 의존 없이 테스트 가능하다.
 */

export interface TilFileContext {
	path: string;
	category: string;
	headings: string[];
	outgoingLinks: string[];
	backlinks: string[];
	tags: string[];
	matchType: "path" | "content";
}

export interface UnresolvedTopicLink {
	linkName: string;
	mentionedIn: string[];
}

export interface TopicContextResult {
	topic: string;
	matchedFiles: TilFileContext[];
	unresolvedMentions: UnresolvedTopicLink[];
}

export interface RecentFileEntry {
	path: string;
	category: string;
	headings: string[];
	mtime: number;
}

export interface RecentDayGroup {
	date: string; // YYYY-MM-DD
	files: RecentFileEntry[];
}

export interface RecentContextResult {
	days: number;
	groups: RecentDayGroup[];
	totalFiles: number;
}

/**
 * 경로/파일명 기반으로 topic에 매칭되는 TIL 파일을 찾는다.
 * backlog.md는 제외한다.
 */
export function findPathMatches(
	filePaths: string[],
	topic: string,
	tilPath: string,
): string[] {
	const lowerTopic = topic.toLowerCase();
	return filePaths.filter((p) => {
		if (!p.startsWith(tilPath + "/")) return false;
		if (p.endsWith("/backlog.md") || p.split("/").pop() === "backlog.md") return false;
		const relative = p.slice(tilPath.length + 1);
		return relative.toLowerCase().includes(lowerTopic);
	});
}

/**
 * TIL 파일 경로에서 카테고리를 추출한다.
 * `tilPath/{category}/file.md` → category, 하위 폴더 없으면 "(uncategorized)"
 */
export function extractCategory(filePath: string, tilPath: string): string {
	const relative = filePath.slice(tilPath.length + 1);
	const parts = relative.split("/");
	return parts.length >= 2 ? parts[0]! : "(uncategorized)";
}

/**
 * 파일 경로와 메타데이터를 조합하여 TilFileContext를 생성한다.
 */
export function buildFileContext(
	path: string,
	tilPath: string,
	matchType: "path" | "content",
	headings: string[],
	outgoingLinks: string[],
	backlinks: string[],
	tags: string[],
): TilFileContext {
	const category = extractCategory(path, tilPath);
	return { path, category, headings, outgoingLinks, backlinks, tags, matchType };
}

/**
 * 미작성 링크(unresolvedLinks) 중 topic에 매칭되는 것을 찾아 그룹핑한다.
 */
export function findUnresolvedMentions(
	unresolvedLinks: Record<string, Record<string, number>>,
	topic: string,
	tilPath: string,
): UnresolvedTopicLink[] {
	const lowerTopic = topic.toLowerCase();
	const linkMap = new Map<string, string[]>();

	for (const [sourcePath, links] of Object.entries(unresolvedLinks)) {
		if (!sourcePath.startsWith(tilPath + "/")) continue;
		for (const linkName of Object.keys(links)) {
			if (linkName.toLowerCase().includes(lowerTopic)) {
				if (!linkMap.has(linkName)) linkMap.set(linkName, []);
				linkMap.get(linkName)!.push(sourcePath);
			}
		}
	}

	return Array.from(linkMap.entries()).map(([linkName, mentionedIn]) => ({
		linkName,
		mentionedIn,
	}));
}

/**
 * TopicContextResult를 Claude 소비용 텍스트로 포맷한다.
 */
export function formatTopicContext(result: TopicContextResult): string {
	const lines: string[] = [];

	if (result.matchedFiles.length === 0 && result.unresolvedMentions.length === 0) {
		return `"${result.topic}"에 대한 기존 학습 내용이 없습니다. 새 주제입니다.`;
	}

	lines.push(`## "${result.topic}" 학습 컨텍스트\n`);

	if (result.matchedFiles.length > 0) {
		lines.push(`### 관련 파일 (${result.matchedFiles.length}개)\n`);
		for (const f of result.matchedFiles) {
			lines.push(`- **${f.path}** [${f.category}] (${f.matchType} 매칭)`);
			if (f.headings.length > 0) {
				lines.push(`  목차: ${f.headings.join(", ")}`);
			}
			if (f.outgoingLinks.length > 0) {
				lines.push(`  참조: ${f.outgoingLinks.join(", ")}`);
			}
			if (f.backlinks.length > 0) {
				lines.push(`  역참조: ${f.backlinks.join(", ")}`);
			}
			if (f.tags.length > 0) {
				lines.push(`  태그: ${f.tags.join(", ")}`);
			}
		}
	}

	if (result.unresolvedMentions.length > 0) {
		lines.push(`\n### 미작성 관련 링크 (${result.unresolvedMentions.length}개)\n`);
		for (const u of result.unresolvedMentions) {
			lines.push(`- [${u.linkName}](${u.linkName}.md) — 언급 파일: ${u.mentionedIn.join(", ")}`);
		}
	}

	return lines.join("\n");
}

/**
 * 파일 경로를 카테고리별로 그룹핑한다.
 * category 지정 시 해당 카테고리만 반환한다.
 */
export function groupFilesByCategory(
	filePaths: string[],
	tilPath: string,
	category?: string,
): Record<string, string[]> {
	const prefix = tilPath + "/";
	const result: Record<string, string[]> = {};

	for (const p of filePaths) {
		if (!p.startsWith(prefix)) continue;
		const relative = p.slice(prefix.length);
		const parts = relative.split("/");
		const cat = parts.length >= 2 ? parts[0]! : "(uncategorized)";
		if (category && cat !== category) continue;
		if (!result[cat]) result[cat] = [];
		result[cat]!.push(p);
	}

	return result;
}

/**
 * mtime 기준으로 최근 파일을 필터링하고 날짜별로 그룹핑한다.
 * newest-first 정렬.
 */
export function filterRecentFiles(
	files: Array<{ path: string; mtime: number; headings: string[] }>,
	days: number,
	tilPath: string,
	now?: number,
): RecentContextResult {
	const currentTime = now ?? Date.now();
	const cutoff = currentTime - days * 24 * 60 * 60 * 1000;

	const filtered = files
		.filter((f) => {
			if (!f.path.startsWith(tilPath + "/")) return false;
			if (f.path.endsWith("/backlog.md") || f.path.split("/").pop() === "backlog.md") return false;
			if (f.mtime < cutoff) return false;
			return true;
		})
		.sort((a, b) => b.mtime - a.mtime);

	const groupMap = new Map<string, RecentFileEntry[]>();
	for (const f of filtered) {
		const d = new Date(f.mtime);
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		const category = extractCategory(f.path, tilPath);

		if (!groupMap.has(date)) groupMap.set(date, []);
		groupMap.get(date)!.push({
			path: f.path,
			category,
			headings: f.headings,
			mtime: f.mtime,
		});
	}

	// 날짜 역순 정렬
	const groups = Array.from(groupMap.entries())
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([date, entries]) => ({ date, files: entries }));

	return { days, groups, totalFiles: filtered.length };
}

/**
 * RecentContextResult를 Claude 소비용 텍스트로 포맷한다.
 */
export function formatRecentContext(result: RecentContextResult): string {
	if (result.totalFiles === 0) {
		return `최근 ${result.days}일간 학습 활동이 없습니다.`;
	}

	const lines: string[] = [];
	lines.push(`## 최근 ${result.days}일 학습 활동 (${result.totalFiles}개 파일)\n`);

	for (const group of result.groups) {
		lines.push(`### ${group.date}\n`);
		for (const f of group.files) {
			lines.push(`- **${f.path}** [${f.category}]`);
			if (f.headings.length > 0) {
				lines.push(`  목차: ${f.headings.join(", ")}`);
			}
		}
	}

	return lines.join("\n");
}
