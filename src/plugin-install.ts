import type { FileStorage } from "./ports/storage";

// Bundled via esbuild text loader
import tilSkill from "../skills/til/SKILL.md";
import backlogSkill from "../skills/backlog/SKILL.md";
import researchSkill from "../skills/research/SKILL.md";
import saveSkill from "../skills/save/SKILL.md";
import dashboardSkill from "../skills/dashboard/SKILL.md";
import omtSetupSkill from "../skills/omt-setup/SKILL.md";
import tilReviewSkill from "../skills/til-review/SKILL.md";
import claudeMdSection from "../vault-assets/claude-md-section.md";

import tilFetcherAgent from "../agents/til-fetcher.md";

import notifyCompleteHook from "../hooks/notify-complete.sh";

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
	"dashboard/SKILL.md": dashboardSkill,
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
 * Claude Code hooks configuration (hook rules to register in .claude/settings.json).
 */
const HOOKS_CONFIG: Record<string, Array<Record<string, unknown>>> = {
	Notification: [{
		matcher: "idle_prompt",
		hooks: [{ type: "command", command: "bash .claude/hooks/notify-complete.sh", async: true }],
	}],
};

/**
 * Common logic for installing/updating versioned files.
 *
 * - Installs fresh if file does not exist
 * - Updates if plugin-version is lower than current
 * - Skips if plugin-version is absent (treated as user-customized)
 */
async function installFiles(
	storage: FileStorage,
	basePath: string,
	files: Record<string, string>,
	pluginVersion: string,
	label: string,
): Promise<void> {
	// Collect required directories upfront and create them without duplicates
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

				// No plugin-version means user-customized → skip
				if (!installedVersion) return;
				// Skip when current version is not newer
				if (!isNewerVersion(pluginVersion, installedVersion)) return;
			}

			await storage.writeFile(fullPath, resolveVersionPlaceholder(content, pluginVersion));
			console.log(`Oh My TIL: ${label} installed → ${fullPath}`);
		}),
	);
}

/**
 * Installs/updates plugin assets (skills, agents, CLAUDE.md section) into the vault.
 */
export async function installPlugin(storage: FileStorage, pluginVersion: string): Promise<void> {
	// Create shared parent directory before parallel execution (prevent race condition)
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
 * Installs hook scripts into .claude/hooks/ and registers hook rules in .claude/settings.json.
 * Scripts are always overwritten; settings.json preserves existing config and only appends.
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
 * Registers oh-my-til hook rules in .claude/settings.json.
 * Skips already-registered hooks and preserves existing user settings.
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
		console.log("Oh My TIL: hooks config registered → .claude/settings.json");
	}
}

/**
 * Adds/updates the MCP tools guide section in .claude/CLAUDE.md.
 * Managed via marker comments (including version) to preserve existing content.
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

		if (existingContent.includes(markerStart)) return; // same version already installed

		// Replace if an older version marker exists
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

	console.log("Oh My TIL: MCP tools guide added to CLAUDE.md");
}

/**
 * Cleans up skill files installed under the old package name (claude-til).
 * Targets OLD_SKILLS_BASE = ".claude/skills/claude-til" (intentional legacy migration).
 * Only deletes files that have a plugin-version (protects user-customized files).
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
			console.log(`Oh My TIL: old skill removed → ${oldPath}`);
		}
	}
}
