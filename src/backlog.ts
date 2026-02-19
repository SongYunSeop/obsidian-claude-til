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
