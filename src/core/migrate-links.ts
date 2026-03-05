export interface MigrateResult {
	content: string;
	count: number;
}

/**
 * Splits the inner string of `[[...]]` into path and displayText.
 * Handles `|` or `\|` (table escape) as the separator.
 * Uses path as displayText when no alias is present.
 */
export function parseWikilink(inner: string): {
	path: string;
	displayText: string;
} {
	// Split by `\|` (escaped pipe in tables) or `|` as separator
	const pipeIndex = inner.search(/\\?\|/);
	if (pipeIndex === -1) {
		return { path: inner, displayText: inner };
	}

	const path = inner.slice(0, pipeIndex);
	// `\|` separator is 2 chars, `|` separator is 1 char
	const separatorLength = inner[pipeIndex] === "\\" ? 2 : 1;
	const displayText = inner.slice(pipeIndex + separatorLength);

	return { path, displayText };
}

/**
 * Builds a standard markdown link from path and displayText.
 * Automatically appends `.md` extension if absent; preserves it if already present.
 */
export function toMarkdownLink(path: string, displayText: string): string {
	const mdPath = path.endsWith(".md") ? path : `${path}.md`;
	return `[${displayText}](${mdPath})`;
}

/**
 * Regex matching code blocks and wikilinks.
 * Group 1: fenced/inline code blocks (to preserve)
 * Group 2: wikilinks (to convert)
 */
const WIKILINK_REGEX = /(```[\s\S]*?```|`[^`\n]+`)|(\[\[[^\[\]]+?\]\])/g;

/**
 * Counts wikilinks excluding content inside code blocks.
 */
export function countWikilinks(content: string): number {
	let count = 0;
	const regex = new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		if (match[2]) {
			count++;
		}
	}

	return count;
}

/**
 * Converts wikilinks to standard markdown links while preserving code block contents.
 * Regex alternation pattern: code blocks match first and are preserved; wikilinks are converted.
 */
export function migrateLinks(content: string): MigrateResult {
	let count = 0;

	const result = content.replace(
		new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags),
		(fullMatch, codeBlock: string | undefined, wikilink: string | undefined) => {
			// Code block match → return original unchanged
			if (codeBlock) return fullMatch;

			// Wikilink match → perform conversion
			if (wikilink) {
				const inner = wikilink.slice(2, -2); // Remove [[ ]]
				const { path, displayText } = parseWikilink(inner);
				count++;
				return toMarkdownLink(path, displayText);
			}

			return fullMatch;
		},
	);

	return { content: result, count };
}

/**
 * Checks whether any remaining wikilinks exist, excluding content inside code blocks.
 */
export function hasWikilinks(content: string): boolean {
	return countWikilinks(content) > 0;
}
