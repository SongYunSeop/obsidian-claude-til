/**
 * Pure function module for MCP learning context tools.
 * Follows the backlog.ts pattern; testable without Obsidian API dependency.
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
 * Finds TIL files matching the topic based on path/filename.
 * Excludes backlog.md.
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
 * Extracts the category from a TIL file path.
 * `tilPath/{category}/file.md` → category, or "(uncategorized)" if no subfolder.
 */
export function extractCategory(filePath: string, tilPath: string): string {
	const relative = filePath.slice(tilPath.length + 1);
	const parts = relative.split("/");
	return parts.length >= 2 ? parts[0]! : "(uncategorized)";
}

/**
 * Builds a TilFileContext by combining file path and metadata.
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
 * Finds entries in unresolvedLinks that match the topic and groups them.
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
 * Formats a TopicContextResult as text for Claude consumption.
 */
export function formatTopicContext(result: TopicContextResult): string {
	const lines: string[] = [];

	if (result.matchedFiles.length === 0 && result.unresolvedMentions.length === 0) {
		return `No existing learning content found for "${result.topic}". This is a new topic.`;
	}

	lines.push(`## Learning Context for "${result.topic}"\n`);

	if (result.matchedFiles.length > 0) {
		lines.push(`### Related Files (${result.matchedFiles.length})\n`);
		for (const f of result.matchedFiles) {
			lines.push(`- **${f.path}** [${f.category}] (${f.matchType} match)`);
			if (f.headings.length > 0) {
				lines.push(`  Headings: ${f.headings.join(", ")}`);
			}
			if (f.outgoingLinks.length > 0) {
				lines.push(`  Outgoing links: ${f.outgoingLinks.join(", ")}`);
			}
			if (f.backlinks.length > 0) {
				lines.push(`  Backlinks: ${f.backlinks.join(", ")}`);
			}
			if (f.tags.length > 0) {
				lines.push(`  Tags: ${f.tags.join(", ")}`);
			}
		}
	}

	if (result.unresolvedMentions.length > 0) {
		lines.push(`\n### Unresolved Related Links (${result.unresolvedMentions.length})\n`);
		for (const u of result.unresolvedMentions) {
			lines.push(`- [${u.linkName}](${u.linkName}.md) — Mentioned in: ${u.mentionedIn.join(", ")}`);
		}
	}

	return lines.join("\n");
}

/**
 * Groups file paths by category.
 * If category is specified, returns only that category.
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
 * Filters recent files by mtime and groups them by date.
 * Sorted newest-first.
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

	// Sort dates in reverse order
	const groups = Array.from(groupMap.entries())
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([date, entries]) => ({ date, files: entries }));

	return { days, groups, totalFiles: filtered.length };
}

/**
 * Formats a RecentContextResult as text for Claude consumption.
 */
export function formatRecentContext(result: RecentContextResult): string {
	if (result.totalFiles === 0) {
		return `No learning activity in the last ${result.days} days.`;
	}

	const lines: string[] = [];
	lines.push(`## Recent Learning Activity (${result.days} days, ${result.totalFiles} files)\n`);

	for (const group of result.groups) {
		lines.push(`### ${group.date}\n`);
		for (const f of group.files) {
			lines.push(`- **${f.path}** [${f.category}]`);
			if (f.headings.length > 0) {
				lines.push(`  Headings: ${f.headings.join(", ")}`);
			}
		}
	}

	return lines.join("\n");
}
