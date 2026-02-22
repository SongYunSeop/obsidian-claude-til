import type { FileStorage } from "./ports/storage";

// esbuild의 text loader로 번들에 포함
import tilSkill from "../vault-assets/skills/til/SKILL.md";
import backlogSkill from "../vault-assets/skills/backlog/SKILL.md";
import researchSkill from "../vault-assets/skills/research/SKILL.md";
import saveSkill from "../vault-assets/skills/save/SKILL.md";
import migrateLinksSkill from "../vault-assets/skills/migrate-links/SKILL.md";
import dashboardSkill from "../vault-assets/skills/dashboard/SKILL.md";
import saveRules from "../vault-assets/rules/save-rules.md";
import claudeMdSection from "../vault-assets/claude-md-section.md";

import {
	resolveVersionPlaceholder,
	extractPluginVersion,
	isNewerVersion,
	escapeRegExp,
	SKILLS_BASE,
	RULES_BASE,
	OLD_SKILLS_BASE,
	MCP_MARKER_START,
	MCP_MARKER_END,
} from "./core/skills";

export { resolveVersionPlaceholder, extractPluginVersion, isNewerVersion };

const SKILLS: Record<string, string> = {
	"til/SKILL.md": tilSkill,
	"backlog/SKILL.md": backlogSkill,
	"research/SKILL.md": researchSkill,
	"save/SKILL.md": saveSkill,
	"migrate-links/SKILL.md": migrateLinksSkill,
	"dashboard/SKILL.md": dashboardSkill,
};

const RULES: Record<string, string> = {
	"save-rules.md": saveRules,
};

/**
 * 버전 관리 파일을 설치/업데이트하는 공통 로직.
 *
 * - 파일이 없으면 새로 설치
 * - plugin-version이 현재보다 낮으면 업데이트
 * - plugin-version이 없으면 사용자 커스터마이즈로 간주, 건너뜀
 */
async function installFiles(
	storage: FileStorage,
	basePath: string,
	files: Record<string, string>,
	pluginVersion: string,
	label: string,
): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = `${basePath}/${relativePath}`;

		if (await storage.exists(fullPath)) {
			const existing = await storage.readFile(fullPath);
			const installedVersion = extractPluginVersion(existing ?? "");

			// plugin-version이 없으면 사용자 커스터마이즈 → 건너뜀
			if (!installedVersion) continue;
			// 현재 버전이 더 높지 않으면 건너뜀
			if (!isNewerVersion(pluginVersion, installedVersion)) continue;
		}

		// 디렉토리 생성
		const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
		if (!(await storage.exists(dir))) {
			await storage.mkdir(dir);
		}

		await storage.writeFile(fullPath, resolveVersionPlaceholder(content, pluginVersion));
		console.log(`Oh My TIL: ${label} 설치됨 → ${fullPath}`);
	}
}

/**
 * vault의 .claude/skills/ 에 skill 파일과 .claude/rules/ 에 rule 파일을 설치/업데이트한다.
 */
export async function installSkills(storage: FileStorage, pluginVersion: string): Promise<void> {
	await installFiles(storage, SKILLS_BASE, SKILLS, pluginVersion, "skill");
	await installFiles(storage, RULES_BASE, RULES, pluginVersion, "rule");

	await installClaudeMdSection(storage, pluginVersion);
	await cleanupOldSkills(storage);
}

/**
 * .claude/CLAUDE.md에 MCP 도구 안내 섹션을 추가/업데이트한다.
 * 마커 주석(버전 포함)으로 관리하여 기존 내용을 보존한다.
 */
async function installClaudeMdSection(storage: FileStorage, pluginVersion: string): Promise<void> {
	const filePath = ".claude/CLAUDE.md";
	const markerStart = `${MCP_MARKER_START}:${pluginVersion}`;
	const section = `${markerStart}\n${claudeMdSection}\n${MCP_MARKER_END}`;

	if (!(await storage.exists(".claude"))) {
		await storage.mkdir(".claude");
	}

	if (await storage.exists(filePath)) {
		const existing = await storage.readFile(filePath);
		const existingContent = existing ?? "";

		if (existingContent.includes(markerStart)) return; // 같은 버전 이미 설치됨

		// 이전 버전 마커가 있으면 교체
		if (existingContent.includes(MCP_MARKER_START)) {
			const replaced = existingContent.replace(
				new RegExp(`${escapeRegExp(MCP_MARKER_START)}[\\s\\S]*?${escapeRegExp(MCP_MARKER_END)}`),
				section,
			);
			await storage.writeFile(filePath, replaced);
		} else {
			await storage.writeFile(filePath, existingContent.trimEnd() + "\n\n" + section + "\n");
		}
	} else {
		await storage.writeFile(filePath, section + "\n");
	}

	console.log("Oh My TIL: CLAUDE.md에 MCP 도구 안내 추가됨");
}

/**
 * 이전 패키지명(claude-til)으로 설치된 skill 파일을 정리한다.
 * OLD_SKILLS_BASE = ".claude/skills/claude-til" 경로 대상 (의도적 레거시 마이그레이션).
 * plugin-version이 있는 파일만 삭제 (사용자 커스터마이즈 보호).
 */
async function cleanupOldSkills(storage: FileStorage): Promise<void> {
	const oldPaths = ["til/SKILL.md", "backlog/SKILL.md", "research/SKILL.md"];
	for (const relativePath of oldPaths) {
		const oldPath = `${OLD_SKILLS_BASE}/${relativePath}`;
		if (!(await storage.exists(oldPath))) continue;

		const content = await storage.readFile(oldPath);
		const version = extractPluginVersion(content ?? "");
		if (version) {
			await storage.remove(oldPath);
			console.log(`Oh My TIL: 이전 skill 삭제 → ${oldPath}`);
		}
	}
}
