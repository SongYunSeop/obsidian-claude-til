import type { FileStorage } from "./ports/storage";

// esbuild의 text loader로 번들에 포함
import tilSkill from "../vault-assets/skills/til/SKILL.md";
import backlogSkill from "../vault-assets/skills/backlog/SKILL.md";
import researchSkill from "../vault-assets/skills/research/SKILL.md";
import saveSkill from "../vault-assets/skills/save/SKILL.md";
import migrateLinksSkill from "../vault-assets/skills/migrate-links/SKILL.md";
import dashboardSkill from "../vault-assets/skills/dashboard/SKILL.md";
import setupPagesSkill from "../vault-assets/skills/setup-pages/SKILL.md";
import omtSetupSkill from "../vault-assets/skills/omt-setup/SKILL.md";
import tilReviewSkill from "../vault-assets/skills/til-review/SKILL.md";
import claudeMdSection from "../vault-assets/claude-md-section.md";

import tilFetcherAgent from "../vault-assets/agents/til-fetcher.md";

import notifyCompleteHook from "../vault-assets/hooks/notify-complete.sh";

import {
	resolveVersionPlaceholder,
	extractPluginVersion,
	isNewerVersion,
	escapeRegExp,
	SKILLS_BASE,
	RULES_BASE,
	AGENTS_BASE,
	HOOKS_BASE,
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
	"setup-pages/SKILL.md": setupPagesSkill,
	"omt-setup/SKILL.md": omtSetupSkill,
	"til-review/SKILL.md": tilReviewSkill,
};

const RULES: Record<string, string> = {};

const AGENTS: Record<string, string> = {
	"til-fetcher.md": tilFetcherAgent,
};

const HOOKS: Record<string, string> = {
	"notify-complete.sh": notifyCompleteHook,
};

/**
 * Claude Code hooks 설정 (.claude/settings.json에 등록할 hook 규칙).
 */
const HOOKS_CONFIG: Record<string, Array<Record<string, unknown>>> = {
	Notification: [{
		matcher: "idle_prompt",
		hooks: [{ type: "command", command: "bash .claude/hooks/notify-complete.sh", async: true }],
	}],
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
	// 필요한 디렉토리를 사전에 수집하여 중복 없이 생성
	const dirs = new Set<string>();
	for (const relativePath of Object.keys(files)) {
		const fullPath = `${basePath}/${relativePath}`;
		dirs.add(fullPath.substring(0, fullPath.lastIndexOf("/")));
	}
	for (const dir of dirs) {
		if (!(await storage.exists(dir))) {
			await storage.mkdir(dir);
		}
	}

	await Promise.all(
		Object.entries(files).map(async ([relativePath, content]) => {
			const fullPath = `${basePath}/${relativePath}`;

			if (await storage.exists(fullPath)) {
				const existing = await storage.readFile(fullPath);
				const installedVersion = extractPluginVersion(existing ?? "");

				// plugin-version이 없으면 사용자 커스터마이즈 → 건너뜀
				if (!installedVersion) return;
				// 현재 버전이 더 높지 않을 때 건너뜀
				if (!isNewerVersion(pluginVersion, installedVersion)) return;
			}

			await storage.writeFile(fullPath, resolveVersionPlaceholder(content, pluginVersion));
			console.log(`Oh My TIL: ${label} 설치됨 → ${fullPath}`);
		}),
	);
}

/**
 * vault에 플러그인 에셋(skills, agents, CLAUDE.md 섹션)을 설치/업데이트한다.
 */
export async function installPlugin(storage: FileStorage, pluginVersion: string): Promise<void> {
	// 병렬 실행 전에 공유 부모 디렉토리 생성 (race condition 방지)
	if (!(await storage.exists(".claude"))) {
		await storage.mkdir(".claude");
	}
	await Promise.all([
		installFiles(storage, SKILLS_BASE, SKILLS, pluginVersion, "skill"),
		installFiles(storage, RULES_BASE, RULES, pluginVersion, "rule"),
		installFiles(storage, AGENTS_BASE, AGENTS, pluginVersion, "agent"),
		installHooks(storage),
	]);

	await installClaudeMdSection(storage, pluginVersion);
	await cleanupOldSkills(storage);
}

/**
 * hook 스크립트를 .claude/hooks/에 설치하고, .claude/settings.json에 hook 규칙을 등록한다.
 * 스크립트는 항상 덮어쓰고, settings.json은 기존 설정을 보존하며 추가만 한다.
 */
async function installHooks(storage: FileStorage): Promise<void> {
	if (!(await storage.exists(HOOKS_BASE))) {
		await storage.mkdir(HOOKS_BASE);
	}

	await Promise.all(
		Object.entries(HOOKS).map(([name, content]) =>
			storage.writeFile(`${HOOKS_BASE}/${name}`, content),
		),
	);

	await installHooksConfig(storage);
}

/**
 * .claude/settings.json에 oh-my-til hook 규칙을 등록한다.
 * 이미 등록된 hook은 건너뛰고, 기존 사용자 설정을 보존한다.
 */
async function installHooksConfig(storage: FileStorage): Promise<void> {
	const settingsPath = ".claude/settings.json";
	let settings: Record<string, unknown> = {};

	if (await storage.exists(settingsPath)) {
		const content = await storage.readFile(settingsPath);
		if (content) {
			try {
				settings = JSON.parse(content) as Record<string, unknown>;
			} catch {
				return;
			}
		}
	}

	const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
	let changed = false;

	for (const [event, entries] of Object.entries(HOOKS_CONFIG)) {
		const existing = hooks[event] as Array<{ hooks?: Array<{ command?: string }> }> | undefined;
		const alreadyInstalled = existing?.some((entry) =>
			entry.hooks?.some((h) => h.command?.includes(".claude/hooks/")),
		);

		if (!alreadyInstalled) {
			hooks[event] = [...(existing ?? []), ...entries];
			changed = true;
		}
	}

	if (changed) {
		settings.hooks = hooks;
		await storage.writeFile(settingsPath, JSON.stringify(settings, null, "\t") + "\n");
		console.log("Oh My TIL: hooks 설정 등록됨 → .claude/settings.json");
	}
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
