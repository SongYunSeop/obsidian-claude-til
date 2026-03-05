/**
 * Pure functions and constants for skill management.
 * Independent of Obsidian Vault API, fully testable in isolation.
 */

export const VERSION_PLACEHOLDER = "__PLUGIN_VERSION__";
export const MCP_MARKER_START = "<!-- oh-my-til:mcp-tools:start -->";
export const MCP_MARKER_END = "<!-- oh-my-til:mcp-tools:end -->";
export const SKILLS_BASE = ".claude/skills";
export const RULES_BASE = ".claude/rules";
export const AGENTS_BASE = ".claude/agents";
export const HOOKS_BASE = ".claude/hooks";
export const OLD_SKILLS_BASE = ".claude/skills/claude-til";

/**
 * Replaces the __PLUGIN_VERSION__ placeholder in source files with the actual version.
 */
export function resolveVersionPlaceholder(content: string, version: string): string {
	return content.replace(VERSION_PLACEHOLDER, version);
}

/**
 * Extracts the plugin-version value from frontmatter.
 */
export function extractPluginVersion(content: string): string | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const versionMatch = match[1]!.match(/plugin-version:\s*"?([^"\n]+)"?/);
	return versionMatch ? versionMatch[1]!.trim() : null;
}

/**
 * Semver comparison. Returns true if a > b.
 */
export function isNewerVersion(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) > (pb[i] || 0)) return true;
		if ((pa[i] || 0) < (pb[i] || 0)) return false;
	}
	return false;
}

export function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
