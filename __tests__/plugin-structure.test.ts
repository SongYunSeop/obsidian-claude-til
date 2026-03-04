import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readManifest() {
	return JSON.parse(
		fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf-8"),
	);
}

/** plugin.json のパスは plugin root (= repo root) 基準で解決 */
function resolvePluginPath(relativePath: string): string {
	return path.resolve(ROOT, relativePath);
}

describe("plugin-structure", () => {
	it(".claude-plugin/plugin.json exists and has valid schema", () => {
		const manifestPath = path.join(ROOT, ".claude-plugin", "plugin.json");
		expect(fs.existsSync(manifestPath)).toBe(true);

		const manifest = readManifest();
		expect(manifest.name).toBe("oh-my-til");
		expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(typeof manifest.description).toBe("string");
		expect(typeof manifest.skills).toBe("string");
		expect(Array.isArray(manifest.agents)).toBe(true);
		expect(typeof manifest.hooks).toBe("string");
		expect(typeof manifest.mcpServers).toBe("string");
	});

	it("plugin.json skills path resolves to existing directory", () => {
		const manifest = readManifest();
		const skillsDir = resolvePluginPath(manifest.skills);
		expect(fs.existsSync(skillsDir), `skills dir missing: ${skillsDir}`).toBe(true);
		expect(fs.statSync(skillsDir).isDirectory()).toBe(true);

		// At least one skill should exist
		const entries = fs.readdirSync(skillsDir);
		expect(entries.length).toBeGreaterThan(0);
	});

	it("plugin.json agents paths resolve to existing files", () => {
		const manifest = readManifest();
		expect(manifest.agents.length).toBeGreaterThan(0);

		for (const agentPath of manifest.agents) {
			const resolved = resolvePluginPath(agentPath);
			expect(fs.existsSync(resolved), `agent file missing: ${resolved}`).toBe(true);
		}
	});

	it("plugin.json hooks path resolves to valid JSON file", () => {
		const manifest = readManifest();
		const hooksPath = resolvePluginPath(manifest.hooks);
		expect(fs.existsSync(hooksPath), `hooks file missing: ${hooksPath}`).toBe(true);

		const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
		expect(hooks.hooks).toBeDefined();
	});

	it("hooks.json references existing script files", () => {
		const manifest = readManifest();
		const hooksPath = resolvePluginPath(manifest.hooks);
		const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));

		// Extract script paths from hook commands (replace ${CLAUDE_PLUGIN_ROOT} with repo root)
		for (const category of Object.values(hooks.hooks) as Array<Array<{ hooks: Array<{ command: string }> }>>) {
			for (const matcher of category) {
				for (const hook of matcher.hooks) {
					const command = hook.command;
					// Extract the file path after "bash "
					const match = command.match(/bash\s+\$\{CLAUDE_PLUGIN_ROOT\}\/(.+)/);
					if (match) {
						const scriptPath = path.join(ROOT, match[1]);
						expect(fs.existsSync(scriptPath), `script missing: ${scriptPath}`).toBe(true);
					}
				}
			}
		}
	});

	it("plugin.json mcpServers path resolves to valid JSON file", () => {
		const manifest = readManifest();
		const mcpPath = resolvePluginPath(manifest.mcpServers);
		expect(fs.existsSync(mcpPath), `mcp file missing: ${mcpPath}`).toBe(true);

		const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
		expect(mcp["oh-my-til"]).toBeDefined();
		expect(mcp["oh-my-til"].command).toBe("npx");
	});

	it("plugin.json version matches package.json", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
		const manifest = readManifest();
		expect(manifest.version).toBe(pkg.version);
	});
});
