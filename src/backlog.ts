export interface BacklogItem {
	path: string;        // "til/claude-code/permission-mode"
	displayName: string; // "Permission 모드"
}

/**
 * backlog.md 내용에서 미완료 항목을 파싱한다.
 * 형식: `- [ ] [[path|displayName]]` 또는 `- [ ] [[path]]`
 * 완료 항목 `- [x]`는 제외한다.
 */
export function parseBacklogItems(content: string): BacklogItem[] {
	const items: BacklogItem[] = [];
	const lines = content.split("\n");

	for (const line of lines) {
		const match = line.match(/^-\s+\[ \]\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
		if (match) {
			const path = match[1]!.trim();
			const displayName = match[2]?.trim() ?? path;
			items.push({ path, displayName });
		}
	}

	return items;
}

/**
 * 파일 경로에서 topic과 category를 추출한다.
 * `til/{category}/{slug}.md` → `{ topic: slug, category }`
 */
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
