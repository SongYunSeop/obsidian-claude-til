import { parse as parseYaml } from "yaml";

export interface BacklogItem {
	path: string;        // "til/claude-code/permission-mode"
	displayName: string; // "Permission mode"
}

/**
 * Parses incomplete items from backlog.md content.
 * Format: `- [ ] [displayName](path.md)` or `- [ ] [](path.md)`
 * Completed items `- [x]` are excluded.
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
 * Extracts topic and category from a file path.
 * `til/{category}/{slug}.md` → `{ topic: slug, category }`
 */
export interface BacklogProgress {
	todo: number;
	done: number;
}

/**
 * Counts completed/incomplete items from backlog content.
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
	/** category name (e.g. "datadog") */
	category: string;
	/** backlog.md file path (e.g. "til/datadog/backlog.md") */
	filePath: string;
	/** number of completed items */
	done: number;
	/** total number of items */
	total: number;
}

/**
 * Generates a progress bar. █ = completed, ░ = incomplete.
 * Pure function — no side effects.
 */
export function formatProgressBar(done: number, total: number, width = 10): string {
	if (total === 0) return "░".repeat(width);
	const filled = Math.round((done / total) * width);
	return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Formats the backlog category list as a markdown table.
 * Category names are rendered as [category](path) markdown links.
 * Sorted by progress in descending order.
 * Pure function — no side effects, unit-testable.
 */
export function formatBacklogTable(categories: BacklogCategoryStatus[]): string {
	if (categories.length === 0) return "No backlog items found";

	const sorted = [...categories].sort((a, b) => {
		const pctA = a.total > 0 ? a.done / a.total : 0;
		const pctB = b.total > 0 ? b.done / b.total : 0;
		return pctB - pctA;
	});

	const totalDone = sorted.reduce((sum, c) => sum + c.done, 0);
	const totalAll = sorted.reduce((sum, c) => sum + c.total, 0);
	const totalPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

	const lines: string[] = [];
	lines.push("Learning Backlog Status\n");
	lines.push("| Category | Progress | Done | Bar |");
	lines.push("|---------|--------|------|--------|");

	for (const c of sorted) {
		const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
		const bar = formatProgressBar(c.done, c.total);
		lines.push(`| [${c.category}](${c.filePath}) | ${pct}% | ${c.done}/${c.total} | ${bar} |`);
	}

	lines.push(`\n${totalDone} of ${totalAll} items completed (${totalPct}%)`);

	return lines.join("\n");
}

export interface BacklogSectionItem {
	/** display name (e.g. "Knowledge and ability compound like interest") */
	displayName: string;
	/** file path (e.g. "til/agile-story/compound-learning.md") */
	path: string;
	/** whether completed */
	done: boolean;
	/** list of original source URLs (mapped from frontmatter sources) */
	sourceUrls?: string[];
}

export interface BacklogSection {
	/** section heading (e.g. "Prerequisites") */
	heading: string;
	/** list of items in the section */
	items: BacklogSectionItem[];
}

/**
 * Parses the sources map from backlog frontmatter.
 * Supports two formats:
 * 1. Single URL: `  slug: url` → normalized to array
 * 2. Multiple URLs: `  slug:\n    - url1\n    - url2`
 * Parsed with the yaml package. Pure function — no side effects.
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
 * Parses backlog content by section and returns individual items.
 * Parses `- [ ]`/`- [x]` items under `## section name` headings.
 * Pure function — no side effects.
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
			// Extract slug: til/{category}/{slug}.md → slug
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

export interface CheckBacklogResult {
	/** transformed backlog content (original unchanged if no changes) */
	content: string;
	/** whether the check succeeded */
	found: boolean;
	/** whether the item was already completed */
	alreadyDone: boolean;
}

/**
 * Checks the item matching the slug in the backlog content as `[x]`.
 * Matches when the last segment of the link path (excluding extension) equals the slug.
 * Pure function — no side effects.
 */
export function checkBacklogItem(content: string, slug: string): CheckBacklogResult {
	const lines = content.split("\n");
	let found = false;
	let alreadyDone = false;

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i]!.match(/^(-\s+\[)([ xX])(\]\s+\[[^\[\]]*\]\()([^()]+)(\).*)/);
		if (!match) continue;

		const rawPath = match[4]!.trim();
		const pathSlug = rawPath.replace(/\.md$/, "").split("/").pop() ?? "";
		if (pathSlug !== slug) continue;

		found = true;
		if (match[2] !== " ") {
			alreadyDone = true;
			break;
		}

		lines[i] = `${match[1]}x${match[3]}${match[4]}${match[5]}`;
		break;
	}

	return { content: lines.join("\n"), found, alreadyDone };
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
