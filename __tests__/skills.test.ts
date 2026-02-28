import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Vault } from "./mock-obsidian";

// --- 순수 함수 테스트 (skills.ts에서 로직만 복사) ---

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

// --- installFiles 로직 재현 (esbuild text import 우회) ---

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

// --- 테스트 ---

describe("resolveVersionPlaceholder", () => {
	it("__PLUGIN_VERSION__을 실제 버전으로 치환한다", () => {
		const content = '---\nplugin-version: "__PLUGIN_VERSION__"\n---\n# Skill';
		const result = resolveVersionPlaceholder(content, "0.5.0");
		expect(result).toBe('---\nplugin-version: "0.5.0"\n---\n# Skill');
	});

	it("플레이스홀더가 없으면 원본을 그대로 반환한다", () => {
		const content = '---\nplugin-version: "0.2.0"\n---\n# Skill';
		expect(resolveVersionPlaceholder(content, "0.5.0")).toBe(content);
	});
});

describe("extractPluginVersion", () => {
	it("frontmatter에서 plugin-version을 추출한다", () => {
		const content = '---\nname: til\nplugin-version: "0.1.2"\n---\n# TIL';
		expect(extractPluginVersion(content)).toBe("0.1.2");
	});

	it("따옴표 없는 버전도 추출한다", () => {
		const content = "---\nplugin-version: 1.0.0\n---\n# Content";
		expect(extractPluginVersion(content)).toBe("1.0.0");
	});

	it("frontmatter가 없으면 null을 반환한다", () => {
		expect(extractPluginVersion("# No frontmatter")).toBeNull();
	});

	it("plugin-version 필드가 없으면 null을 반환한다", () => {
		const content = "---\nname: til\n---\n# Content";
		expect(extractPluginVersion(content)).toBeNull();
	});
});

describe("isNewerVersion", () => {
	it("major가 높으면 true", () => {
		expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
	});

	it("minor가 높으면 true", () => {
		expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
	});

	it("patch가 높으면 true", () => {
		expect(isNewerVersion("0.1.3", "0.1.2")).toBe(true);
	});

	it("같은 버전이면 false", () => {
		expect(isNewerVersion("0.1.2", "0.1.2")).toBe(false);
	});

	it("낮은 버전이면 false", () => {
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

	it("파일이 없으면 새로 설치한다", async () => {
		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).toContain(".claude/skills/til/SKILL.md");
		expect(installed).toContain(".claude/skills/backlog/SKILL.md");
		expect(installed).toContain(".claude/skills/save/SKILL.md");

		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toContain("# TIL Skill v2");
		expect(content).toContain('plugin-version: "0.2.0"');
		expect(content).not.toContain("__PLUGIN_VERSION__");
	});

	it("plugin-version이 낮은 파일은 업데이트한다", async () => {
		vault._setFile(
			".claude/skills/til/SKILL.md",
			'---\nplugin-version: "0.1.0"\n---\n# TIL Skill v1',
		);

		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).toContain(".claude/skills/til/SKILL.md");
		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toContain("# TIL Skill v2");
	});

	it("같은 버전이면 건너뛴다", async () => {
		vault._setFile(
			".claude/skills/til/SKILL.md",
			'---\nplugin-version: "0.2.0"\n---\n# TIL Skill v2 (기존)',
		);

		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).not.toContain(".claude/skills/til/SKILL.md");
		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toContain("기존");
	});

	it("plugin-version이 없으면 사용자 커스터마이즈로 간주하고 건너뛴다", async () => {
		vault._setFile(
			".claude/skills/til/SKILL.md",
			"# 사용자가 직접 작성한 스킬",
		);

		const installed = await installFiles(vault, SKILLS_BASE, skills, "0.2.0");

		expect(installed).not.toContain(".claude/skills/til/SKILL.md");
		const content = await vault.adapter.read(".claude/skills/til/SKILL.md");
		expect(content).toBe("# 사용자가 직접 작성한 스킬");
	});

	it("빈 스킬 목록이면 아무것도 설치하지 않는다", async () => {
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

	it("에이전트 파일이 없으면 새로 설치한다", async () => {
		const installed = await installFiles(vault, AGENTS_BASE, agents, "0.2.0");

		expect(installed).toContain(".claude/agents/til-fetcher.md");
		expect(installed).toHaveLength(1);

		const content = await vault.adapter.read(".claude/agents/til-fetcher.md");
		expect(content).toContain("# til-fetcher");
		expect(content).toContain('plugin-version: "0.2.0"');
		expect(content).not.toContain("__PLUGIN_VERSION__");
	});

	it("plugin-version이 낮은 에이전트 파일은 업데이트한다", async () => {
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

	it("같은 버전이면 건너뛴다", async () => {
		vault._setFile(
			".claude/agents/til-fetcher.md",
			'---\nplugin-version: "0.2.0"\n---\n# til-fetcher (기존)',
		);

		const installed = await installFiles(vault, AGENTS_BASE, agents, "0.2.0");

		expect(installed).not.toContain(".claude/agents/til-fetcher.md");
		const content = await vault.adapter.read(".claude/agents/til-fetcher.md");
		expect(content).toContain("기존");
	});

	it("plugin-version이 없으면 사용자 커스터마이즈로 간주하고 건너뛴다", async () => {
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

	it("빈 rules 맵이면 아무것도 설치하지 않는다", async () => {
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

	it("CLAUDE.md가 없으면 새로 생성한다", async () => {
		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain(`${MCP_MARKER_START}:0.1.2`);
		expect(content).toContain("## MCP 도구 안내");
		expect(content).toContain(MCP_MARKER_END);
	});

	it("CLAUDE.md가 있으면 끝에 추가한다", async () => {
		vault._setFile(".claude/CLAUDE.md", "# 기존 내용");

		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain("# 기존 내용");
		expect(content).toContain(`${MCP_MARKER_START}:0.1.2`);
		expect(content).toContain("## MCP 도구 안내");
	});

	it("같은 버전의 마커가 있으면 중복 추가하지 않는다", async () => {
		vault._setFile(
			".claude/CLAUDE.md",
			`기존\n\n${MCP_MARKER_START}:0.1.2\n이전 내용\n${MCP_MARKER_END}`,
		);

		await installClaudeMdSection(vault, "0.1.2", mcpContent);

		const content = await vault.adapter.read(".claude/CLAUDE.md");
		expect(content).toContain("이전 내용");
		expect(content).not.toContain("## MCP 도구 안내");
	});

	it("이전 버전의 마커가 있으면 새 버전으로 교체한다", async () => {
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

	it("이전 경로의 plugin-managed 스킬을 삭제한다", async () => {
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

	it("plugin-version이 없는 사용자 파일은 보존한다", async () => {
		vault._setFile(
			".claude/skills/claude-til/til/SKILL.md",
			"# 사용자가 직접 작성한 스킬",
		);

		const removed = await cleanupOldSkills(vault);

		expect(removed).toEqual([]);
		expect(await vault.adapter.exists(".claude/skills/claude-til/til/SKILL.md")).toBe(true);
	});

	it("이전 경로에 파일이 없으면 아무것도 하지 않는다", async () => {
		const removed = await cleanupOldSkills(vault);
		expect(removed).toEqual([]);
	});
});

describe("vault-assets/skills SKILL.md frontmatter 유효성", () => {
	const skillsDir = join(__dirname, "..", "vault-assets", "skills");
	const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	it.each(skillDirs)("%s/SKILL.md에 plugin-version 플레이스홀더가 있다", (dir) => {
		const content = readFileSync(join(skillsDir, dir, "SKILL.md"), "utf8");
		const version = extractPluginVersion(content);
		expect(version).toBe("__PLUGIN_VERSION__");
	});

	it.each(skillDirs)("%s/SKILL.md에 name 필드가 있다", (dir) => {
		const content = readFileSync(join(skillsDir, dir, "SKILL.md"), "utf8");
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/^name:\s*.+/m);
	});
});

