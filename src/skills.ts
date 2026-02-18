import { Vault } from "obsidian";

// esbuild의 text loader로 번들에 포함
import tilSkill from "../vault-assets/skills/til/SKILL.md";
import backlogSkill from "../vault-assets/skills/backlog/SKILL.md";
import researchSkill from "../vault-assets/skills/research/SKILL.md";
import saveSkill from "../vault-assets/skills/save/SKILL.md";
import saveRules from "../vault-assets/rules/save-rules.md";
import claudeMdSection from "../vault-assets/claude-md-section.md";

const SKILLS: Record<string, string> = {
	"til/SKILL.md": tilSkill,
	"backlog/SKILL.md": backlogSkill,
	"research/SKILL.md": researchSkill,
	"save/SKILL.md": saveSkill,
};

const RULES: Record<string, string> = {
	"save-rules.md": saveRules,
};

const SKILLS_BASE = ".claude/skills";
const RULES_BASE = ".claude/rules";
const OLD_SKILLS_BASE = ".claude/skills/claude-til";

const MCP_MARKER_START = "<!-- claude-til:mcp-tools:start -->";
const MCP_MARKER_END = "<!-- claude-til:mcp-tools:end -->";

const VERSION_PLACEHOLDER = "__PLUGIN_VERSION__";

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

/**
 * 버전 관리 파일을 설치/업데이트하는 공통 로직.
 *
 * - 파일이 없으면 새로 설치
 * - plugin-version이 현재보다 낮으면 업데이트
 * - plugin-version이 없으면 사용자 커스터마이즈로 간주, 건너뜀
 */
async function installFiles(
	vault: Vault,
	basePath: string,
	files: Record<string, string>,
	pluginVersion: string,
	label: string,
): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = `${basePath}/${relativePath}`;

		if (await vault.adapter.exists(fullPath)) {
			const existing = await vault.adapter.read(fullPath);
			const installedVersion = extractPluginVersion(existing);

			// plugin-version이 없으면 사용자 커스터마이즈 → 건너뜀
			if (!installedVersion) continue;
			// 현재 버전이 더 높지 않으면 건너뜀
			if (!isNewerVersion(pluginVersion, installedVersion)) continue;
		}

		// 디렉토리 생성
		const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
		if (!(await vault.adapter.exists(dir))) {
			await vault.adapter.mkdir(dir);
		}

		await vault.adapter.write(fullPath, resolveVersionPlaceholder(content, pluginVersion));
		console.log(`Claude TIL: ${label} 설치됨 → ${fullPath}`);
	}
}

/**
 * vault의 .claude/skills/ 에 skill 파일과 .claude/rules/ 에 rule 파일을 설치/업데이트한다.
 */
export async function installSkills(vault: Vault, pluginVersion: string): Promise<void> {
	await installFiles(vault, SKILLS_BASE, SKILLS, pluginVersion, "skill");
	await installFiles(vault, RULES_BASE, RULES, pluginVersion, "rule");

	await installClaudeMdSection(vault, pluginVersion);
	await cleanupOldSkills(vault);
}

/**
 * .claude/CLAUDE.md에 MCP 도구 안내 섹션을 추가/업데이트한다.
 * 마커 주석(버전 포함)으로 관리하여 기존 내용을 보존한다.
 */
async function installClaudeMdSection(vault: Vault, pluginVersion: string): Promise<void> {
	const filePath = ".claude/CLAUDE.md";
	const markerStart = `${MCP_MARKER_START}:${pluginVersion}`;
	const section = `${markerStart}\n${claudeMdSection}\n${MCP_MARKER_END}`;

	if (!(await vault.adapter.exists(".claude"))) {
		await vault.adapter.mkdir(".claude");
	}

	if (await vault.adapter.exists(filePath)) {
		const existing = await vault.adapter.read(filePath);

		if (existing.includes(markerStart)) return; // 같은 버전 이미 설치됨

		// 이전 버전 마커가 있으면 교체
		if (existing.includes(MCP_MARKER_START)) {
			const replaced = existing.replace(
				new RegExp(`${escapeRegExp(MCP_MARKER_START)}[\\s\\S]*?${escapeRegExp(MCP_MARKER_END)}`),
				section,
			);
			await vault.adapter.write(filePath, replaced);
		} else {
			await vault.adapter.write(filePath, existing.trimEnd() + "\n\n" + section + "\n");
		}
	} else {
		await vault.adapter.write(filePath, section + "\n");
	}

	console.log("Claude TIL: CLAUDE.md에 MCP 도구 안내 추가됨");
}

/**
 * 이전 경로(.claude/skills/claude-til/ 등)의 skill을 정리한다.
 * plugin-version이 있는 파일만 삭제 (사용자 커스터마이즈 보호).
 */
async function cleanupOldSkills(vault: Vault): Promise<void> {
	const oldPaths = ["til/SKILL.md", "backlog/SKILL.md", "research/SKILL.md"];
	for (const relativePath of oldPaths) {
		const oldPath = `${OLD_SKILLS_BASE}/${relativePath}`;
		if (!(await vault.adapter.exists(oldPath))) continue;

		const content = await vault.adapter.read(oldPath);
		const version = extractPluginVersion(content);
		if (version) {
			await vault.adapter.remove(oldPath);
			console.log(`Claude TIL: 이전 skill 삭제 → ${oldPath}`);
		}
	}
}

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
