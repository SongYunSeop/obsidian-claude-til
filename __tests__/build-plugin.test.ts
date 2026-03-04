import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "claude-plugin");

describe("build-plugin", () => {
	beforeAll(() => {
		execSync("node scripts/build-plugin.mjs", { cwd: ROOT });
	});

	it("generates the expected directory structure", () => {
		const expected = [
			".claude-plugin/plugin.json",
			".mcp.json",
			"agents/til-fetcher.md",
			"hooks/hooks.json",
			"scripts/notify-complete.sh",
			"skills/til/SKILL.md",
			"skills/backlog/SKILL.md",
			"skills/research/SKILL.md",
			"skills/save/SKILL.md",
			"skills/dashboard/SKILL.md",
			"skills/til-review/SKILL.md",
			"skills/migrate-links/SKILL.md",
			"skills/omt-setup/SKILL.md",
			"skills/setup-pages/SKILL.md",
		];

		for (const file of expected) {
			expect(fs.existsSync(path.join(OUT, file)), `missing: ${file}`).toBe(true);
		}
	});

	it("plugin.json has valid schema", () => {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(OUT, ".claude-plugin", "plugin.json"), "utf-8"),
		);

		expect(manifest.name).toBe("oh-my-til");
		expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(manifest.skills).toBe("./skills/");
		expect(manifest.agents).toBe("./agents/");
		expect(manifest.hooks).toBe("./hooks/hooks.json");
		expect(manifest.mcpServers).toBe("./.mcp.json");
	});

	it("plugin.json version matches package.json", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
		const manifest = JSON.parse(
			fs.readFileSync(path.join(OUT, ".claude-plugin", "plugin.json"), "utf-8"),
		);
		expect(manifest.version).toBe(pkg.version);
	});

	it("skill files have resolved version (no __PLUGIN_VERSION__)", () => {
		const skillsDir = path.join(OUT, "skills");
		const skillDirs = fs.readdirSync(skillsDir);

		for (const dir of skillDirs) {
			const skillPath = path.join(skillsDir, dir, "SKILL.md");
			if (!fs.existsSync(skillPath)) continue;
			const content = fs.readFileSync(skillPath, "utf-8");
			expect(content).not.toContain("__PLUGIN_VERSION__");
			expect(content).toContain("plugin-version:");
		}
	});

	it("agent files have resolved version", () => {
		const agentPath = path.join(OUT, "agents", "til-fetcher.md");
		const content = fs.readFileSync(agentPath, "utf-8");
		expect(content).not.toContain("__PLUGIN_VERSION__");
	});

	it("hooks.json uses CLAUDE_PLUGIN_ROOT variable", () => {
		const hooks = JSON.parse(
			fs.readFileSync(path.join(OUT, "hooks", "hooks.json"), "utf-8"),
		);

		expect(hooks.hooks.Notification).toBeDefined();
		const command = hooks.hooks.Notification[0].hooks[0].command;
		expect(command).toContain("${CLAUDE_PLUGIN_ROOT}");
	});

	it(".mcp.json uses npx oh-my-til mcp without path arg (defaults to cwd)", () => {
		const mcp = JSON.parse(fs.readFileSync(path.join(OUT, ".mcp.json"), "utf-8"));

		expect(mcp["oh-my-til"]).toBeDefined();
		expect(mcp["oh-my-til"].command).toBe("npx");
		expect(mcp["oh-my-til"].args).toEqual(["oh-my-til", "mcp"]);
	});

	it("notify-complete.sh is executable", () => {
		const shPath = path.join(OUT, "scripts", "notify-complete.sh");
		const stat = fs.statSync(shPath);
		// Check owner execute bit
		expect(stat.mode & 0o100).toBeTruthy();
	});
});

describe("plugin-path CLI command", () => {
	it("outputs the dist/claude-plugin path", () => {
		const result = execSync("node dist/cli.js plugin-path", {
			cwd: ROOT,
			encoding: "utf-8",
		});
		expect(result.trim()).toContain("dist/claude-plugin");
	});

	it("works even with extra args (does not parse them)", () => {
		const result = execSync("node dist/cli.js plugin-path --port abc", {
			cwd: ROOT,
			encoding: "utf-8",
		});
		expect(result.trim()).toContain("dist/claude-plugin");
	});
});
