import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Vault } from "./mock-obsidian";

// --- Pure function tests (logic copied from skills.ts only) ---

const VERSION_PLACEHOLDER = "__PLUGIN_VERSION__";

function resolveVersionPlaceholder(content: string, version: string): string {
	return content.replace(VERSION_PLACEHOLDER, version);
}

function extractPluginVersion(content: string): string | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const versionMatch = match[1]!.match(/plugin-version:\s*"?([^"\n]+)"?/);
	return versionMatch ? versionMatch[1]!.trim() : null;
}

function isNewerVersion(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) > (pb[i] || 0)) return true;
		if ((pa[i] || 0) < (pb[i] || 0)) return false;
	}
	return false;
}

// --- Reproduce installFiles logic (workaround for esbuild text import) ---

const SKILLS_BASE = ".claude/skills";
const RULES_BASE = ".claude/rules";
const AGENTS_BASE = ".claude/agents";
const OLD_SKILLS_BASE = ".claude/skills/claude-til";
const MCP_MARKER_START = "<!-- oh-my-til:mcp-tools:start -->";
const MCP_MARKER_END = "<!-- oh-my-til:mcp-tools:end -->";

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function installFiles(
	vault: Vault,
	basePath: string,
	files: Record<string, string>,
	pluginVersion: string,
): Promise<string[]> {
	const installed: string[] = [];
	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = `${basePath}/${relativePath}`;

		if (await vault.adapter.exists(fullPath)) {
			const existing = await vault.adapter.read(fullPath);
			const installedVersion = extractPluginVersion(existing);
			if (!installedVersion) continue;
			if (!isNewerVersion(pluginVersion, installedVersion)) continue;
		}

		const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
		if (!(await vault.adapter.exists(dir))) {
			await vault.adapter.mkdir(dir);
		}

		await vault.adapter.write(fullPath, resolveVersionPlaceholder(content, pluginVersion));
		installed.push(fullPath);
	}
	return installed;
}

async function installClaudeMdSection(
	vault: Vault,
	pluginVersion: string,
	sectionContent: string,
): Promise<void> {
	const filePath = ".claude/CLAUDE.md";
	const markerStart = `${MCP_MARKER_START}:${pluginVersion}`;
	const section = `${markerStart}\n${sectionContent}\n${MCP_MARKER_END}`;

	if (!(await vault.adapter.exists(".claude"))) {
		await vault.adapter.mkdir(".claude");
	}

	if (await vault.adapter.exists(filePath)) {
		const existing = await vault.adapter.read(filePath);
		if (existing.includes(markerStart)) return;

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
}

async function cleanupOldSkills(vault: Vault): Promise<string[]> {
	const oldPaths = ["til/SKILL.md", "backlog/SKILL.md", "research/SKILL.md"];
	const removed: string[] = [];
	for (const relativePath of oldPaths) {
		const oldPath = `${OLD_SKILLS_BASE}/${relativePath}`;
		if (!(await vault.adapter.exists(oldPath))) continue;

		const content = await vault.adapter.read(oldPath);
		const version = extractPluginVersion(content);
		if (version) {
			await vault.adapter.remove(oldPath);
			removed.push(oldPath);
		}
	}
	return removed;
}

// --- Tests ---

describe("resolveVersionPlaceholder", () => {
	it("replaces __PLUGIN_VERSION__ with the actual version", () => {
		const content = '---\nplugin-version: "__PLUGIN_VERSION__"\n---\n# Skill';
		const result = resolveVersionPlaceholder(content, "0.5.0");
		expect(result).toBe('---\nplugin-version: "0.5.0"\n---\n# Skill');
	});

	it("returns the original content unchanged when no placeholder is present", () => {
		const content = '---\nplugin-version: "0.2.0"\n---\n# Skill';
		expect(resolveVersionPlaceholder(content, "0.5.0")).toBe(content);
	});
});

describe("extractPluginVersion", () => {
	it("extracts plugin-version from frontmatter", () => {
		const content = '---\nname: til\nplugin-version: "0.1.2"\n---\n# TIL';
		expect(extractPluginVersion(content)).toBe("0.1.2");
	});

	it("extracts version without quotes", () => {
		const content = "---\nplugin-version: 1.0.0\n---\n# Content";
		expect(extractPluginVersion(content)).toBe("1.0.0");
	});

	it("returns null when frontmatter is absent", () => {
		expect(extractPluginVersion("# No frontmatter")).toBeNull();
	});

	it("returns null when plugin-version field is absent", () => {
		const content = "---\nname: til\n---\n# Content";
		expect(extractPluginVersion(content)).toBeNull();
	});
});

describe("isNewerVersion", () => {
	it("returns true when major is higher", () => {
		expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
	});

	it("returns true when minor is higher", () => {
		expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
	});

	it("returns true when patch is higher", () => {
		expect(isNewerVersion("0.1.3", "0.1.2")).toBe(true);
	});

	it("returns false when versions are equal", () => {
		expect(isNewerVersion("0.1.2", "0.1.2")).toBe(false);
	});

	it("returns false when version is lower", () => {
		expect(isNewerVersion("0.1.0", "0.1.2")).toBe(false);
	});
});

describe("installFiles (skills)", () => {
	let vault: Vault;
	const skills: Record<string, string> = {
		"til/SKILL.md": '---\nplugin-version: "__PLUGIN_VERSION__"\n---\n# TIL Skill v2',
		"backlog/SKILL.md": '---\nplugin-version: "__PLUGIN_VERSION__"\n---\n# Backlog Skill v2',
		"save/SKILL.md": '---\nplugin-version: "__PLUGIN_VERSION__"\n---\n# Save Skill v2',
	};

	beforeEach(() => {
		vault = new Vault();
	});

	it("installs files when they do not exist", async () => {
		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).toContain(".claude/skills/til/SKILL.md");
		expect(installed).toContain(".claude/skills/backlog/SKILL.md");
		expect(installed).toContain(".claude/skills/save/SKILL.md");

		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toContain("# TIL Skill v2");
		expect(content).toContain('plugin-version: "0.2.0"');
		expect(content).not.toContain("__PLUGIN_VERSION__");
	});

	it("updates files whose plugin-version is lower", async () => {
		vault._setFile(
			".claude/skills/til/SKILL.md",
			'---\nplugin-version: "0.1.0"\n---\n# TIL Skill v1',
		);

		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).toContain(".claude/skills/til/SKILL.md");
		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toContain("# TIL Skill v2");
	});

	it("skips files with the same version", async () => {
		vault._setFile(
			".claude/skills/til/SKILL.md",
			'---\nplugin-version: "0.2.0"\n---\n# TIL Skill v2 (기존)',
		);

		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).not.toContain(".claude/skills/til/SKILL.md");
		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toContain("기존");
	});

	it("skips files without plugin-version, treating them as user-customized", async () => {
		vault._setFile(
			".claude/skills/til/SKILL.md",
			"# 사용자가 직접 작성한 스킬",
		);

		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).not.toContain(".claude/skills/til/SKILL.md");
		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toBe("# 사용자가 직접 작성한 스킬");
	});

	it("installs nothing when the skill list is empty", async () => {
		const installed = await installFiles(vault, SKILLS_BASE, {}, "0.2.0");
		expect(installed).toEqual([]);
	});
});

describe("installFiles (agents)", () => {
	let vault: Vault;
	const agents: Record<string, string> = {
		"til-fetcher.md": '---\nplugin-version: "__PLUGIN_VERSION__"\n---\n# til-fetcher',
	};

	beforeEach(() => {
		vault = new Vault();
	});

	it("installs agent files when they do not exist", async () => {
		const installed = await installFiles(vault, AGENTS_BASE, agents, "0.2.0");

		expect(installed).toContain(".claude/agents/til-fetcher.md");
		expect(installed).toHaveLength(1);

		const content = await vault.adapter.read(".claude/agents/til-fetcher.md");
		expect(content).toContain("# til-fetcher");
		expect(content).toContain('plugin-version: "0.2.0"');
		expect(content).not.toContain("__PLUGIN_VERSION__");
	});

	it("updates agent files whose plugin-version is lower", async () => {
		vault._setFile(
			".claude/agents/til-fetcher.md",
			'---\nplugin-version: "0.1.0"\n---\n# til-fetcher v1',
		);

		const installed = await installFiles(vault, AGENTS_BASE, agents, "0.2.0");

		expect(installed).toContain(".claude/agents/til-fetcher.md");
		const content = await vault.adapter.read(".claude/agents/til-fetcher.md");
		expect(content).toContain("# til-fetcher");
		expect(content).toContain('plugin-version: "0.2.0"');
	});

	it("skips agent files with the same version", async () => {
		vault._setFile(
			".claude/agents/til-fetcher.md",
			'---\nplugin-version: "0.2.0"\n---\n# til-fetcher (기존)',
		);

		const installed = await installFiles(vault, AGENTS_BASE, agents, "0.2.0");

		expect(installed).not.toContain(".claude/agents/til-fetcher.md");
		const content = await vault.adapter.read(".claude/agents/til-fetcher.md");
		expect(content).toContain("기존");
	});

	it("skips agent files without plugin-version, treating them as user-customized", async () => {
		vault._setFile(
			".claude/agents/til-fetcher.md",
			"# 사용자가 직접 작성한 에이전트",
		);

		const installed = await installFiles(vault, AGENTS_BASE, agents, "0.2.0");

		expect(installed).not.toContain(".claude/agents/til-fetcher.md");
		const content = await vault.adapter.read(".claude/agents/til-fetcher.md");
		expect(content).toBe("# 사용자가 직접 작성한 에이전트");
	});
});

describe("installFiles (empty rules)", () => {
	let vault: Vault;

	beforeEach(() => {
		vault = new Vault();
	});

	it("installs nothing when the rules map is empty", async () => {
		const installed = await installFiles(vault, RULES_BASE, {}, "0.2.0");
		expect(installed).toEqual([]);
	});
});

describe("installClaudeMdSection", () => {
	let vault: Vault;
	const mcpContent = "## MCP 도구 안내";

	beforeEach(() => {
		vault = new Vault();
	});

	it("creates CLAUDE.md when it does not exist", async () => {
		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain(`${MCP_MARKER_START}:0.1.2`);
		expect(content).toContain("## MCP 도구 안내");
		expect(content).toContain(MCP_MARKER_END);
	});

	it("appends to existing CLAUDE.md", async () => {
		vault._setFile(".claude/CLAUDE.md", "# 기존 내용");

		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain("# 기존 내용");
		expect(content).toContain(`${MCP_MARKER_START}:0.1.2`);
		expect(content).toContain("## MCP 도구 안내");
	});

	it("does not duplicate the section when the same version marker already exists", async () => {
		vault._setFile(
			".claude/CLAUDE.md",
			`기존\n\n${MCP_MARKER_START}:0.1.2\n이전 내용\n${MCP_MARKER_END}`,
		);

		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain("이전 내용");
		expect(content).not.toContain("## MCP 도구 안내");
	});

	it("replaces the section with the new version when an older version marker exists", async () => {
		vault._setFile(
			".claude/CLAUDE.md",
			`기존\n\n${MCP_MARKER_START}:0.1.0\n구버전 내용\n${MCP_MARKER_END}\n\n끝`,
		);

		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain(`${MCP_MARKER_START}:0.1.2`);
		expect(content).toContain("## MCP 도구 안내");
		expect(content).not.toContain("구버전 내용");
		expect(content).toContain("기존");
		expect(content).toContain("끝");
	});
});

describe("cleanupOldSkills", () => {
	let vault: Vault;

	beforeEach(() => {
		vault = new Vault();
	});

	it("deletes plugin-managed skills at the old path", async () => {
		vault._setFile(
			".claude/skills/claude-til/til/SKILL.md",
			'---\nplugin-version: "0.1.0"\n---\n# TIL',
		);
		vault._setFile(
			".claude/skills/claude-til/backlog/SKILL.md",
			'---\nplugin-version: "0.1.0"\n---\n# Backlog',
		);

		const removed = await cleanupOldSkills(vault);

		expect(removed).toContain(".claude/skills/claude-til/til/SKILL.md");
		expect(removed).toContain(".claude/skills/claude-til/backlog/SKILL.md");
		expect(await vault.adapter.exists(".claude/skills/claude-til/til/SKILL.md")).toBe(false);
	});

	it("preserves user files without plugin-version", async () => {
		vault._setFile(
			".claude/skills/claude-til/til/SKILL.md",
			"# 사용자가 직접 작성한 스킬",
		);

		const removed = await cleanupOldSkills(vault);

		expect(removed).toEqual([]);
		expect(await vault.adapter.exists(".claude/skills/claude-til/til/SKILL.md")).toBe(true);
	});

	it("does nothing when no files exist at the old path", async () => {
		const removed = await cleanupOldSkills(vault);
		expect(removed).toEqual([]);
	});
});

describe("skills/ SKILL.md frontmatter validity", () => {
	const skillsDir = join(__dirname, "..", "skills");
	const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	it.each(skillDirs)("%s/SKILL.md has a plugin-version placeholder", (dir) => {
		const content = readFileSync(join(skillsDir, dir, "SKILL.md"), "utf8");
		const version = extractPluginVersion(content);
		expect(version).toBe("__PLUGIN_VERSION__");
	});

	it.each(skillDirs)("%s/SKILL.md has a name field", (dir) => {
		const content = readFileSync(join(skillsDir, dir, "SKILL.md"), "utf8");
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/^name:\s*.+/m);
	});
});

