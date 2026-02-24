/**
 * skills.ts 의 순수 함수 및 상수.
 * Obsidian Vault API에 의존하지 않으므로 독립적으로 테스트 가능하다.
 */

export const VERSION_PLACEHOLDER = "__PLUGIN_VERSION__";
export const MCP_MARKER_START = "<!-- oh-my-til:mcp-tools:start -->";
export const MCP_MARKER_END = "<!-- oh-my-til:mcp-tools:end -->";
export const SKILLS_BASE = ".claude/skills";
export const RULES_BASE = ".claude/rules";
export const AGENTS_BASE = ".claude/agents";
export const OLD_SKILLS_BASE = ".claude/skills/claude-til";

/**
 * 소스 파일의 __PLUGIN_VERSION__ 플레이스홀더를 실제 버전으로 치환한다.
 */
export function resolveVersionPlaceholder(content: string, version: string): string {
	return content.replace(VERSION_PLACEHOLDER, version);
}

/**
 * frontmatter에서 plugin-version 값을 추출한다.
 */
export function extractPluginVersion(content: string): string | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const versionMatch = match[1]!.match(/plugin-version:\s*"?([^"\n]+)"?/);
	return versionMatch ? versionMatch[1]!.trim() : null;
}

/**
 * semver 비교. a > b이면 true.
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
