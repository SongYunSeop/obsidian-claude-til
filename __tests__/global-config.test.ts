import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Mock fs and os
vi.mock("fs");
vi.mock("os", () => ({
	homedir: () => "/home/testuser",
}));

const CONFIG_DIR = "/home/testuser/.config/oh-my-til";
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

describe("global-config", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		delete process.env["TIL_VAULT_PATH"];
		delete process.env["ANTHROPIC_API_KEY"];
		delete process.env["OPENAI_API_KEY"];
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("readConfig", () => {
		it("returns empty object if config file does not exist", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			const { readConfig } = await import("../src/cli/global-config");
			expect(readConfig()).toEqual({});
		});

		it("returns parsed config if file exists", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({ vault: "~/my-til", ai: { provider: "anthropic" } }),
			);
			const { readConfig } = await import("../src/cli/global-config");
			expect(readConfig()).toEqual({ vault: "~/my-til", ai: { provider: "anthropic" } });
		});

		it("returns empty object on parse error", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("invalid json");
			const { readConfig } = await import("../src/cli/global-config");
			expect(readConfig()).toEqual({});
		});
	});

	describe("writeConfig", () => {
		it("creates config dir and writes file with mode 600", async () => {
			vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
			vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
			const { writeConfig } = await import("../src/cli/global-config");

			writeConfig({ vault: "~/my-til" });

			expect(fs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				CONFIG_FILE,
				expect.stringContaining('"vault"'),
				{ encoding: "utf-8", mode: 0o600 },
			);
		});
	});

	describe("getConfig", () => {
		it("applies TIL_VAULT_PATH env fallback when vault not set", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			process.env["TIL_VAULT_PATH"] = "/env/vault";
			const { getConfig } = await import("../src/cli/global-config");
			const config = getConfig();
			expect(config.vault).toBe("/env/vault");
		});

		it("applies ANTHROPIC_API_KEY env fallback", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({ ai: { provider: "anthropic" } }),
			);
			process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
			const { getConfig } = await import("../src/cli/global-config");
			const config = getConfig();
			expect(config.ai?.apiKey).toBe("sk-ant-test");
		});

		it("expands ~ in vault path", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ vault: "~/my-til" }));
			const { getConfig } = await import("../src/cli/global-config");
			const config = getConfig();
			expect(config.vault).toBe("/home/testuser/my-til");
		});
	});

	describe("runConfigCommand", () => {
		it("prints 'No config set' when config is empty", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const { runConfigCommand } = await import("../src/cli/global-config");
			runConfigCommand(["get"]);
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No config set"));
		});

		it("prints masked apiKey in get output", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({ ai: { provider: "anthropic", apiKey: "sk-ant-abcdefgh" } }),
			);
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const { runConfigCommand } = await import("../src/cli/global-config");
			runConfigCommand(["get"]);
			const output = consoleSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain("sk-a");
			expect(output).not.toContain("sk-ant-abcdefgh");
		});

		it("sets vault value", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
			vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const { runConfigCommand } = await import("../src/cli/global-config");
			runConfigCommand(["set", "vault", "~/my-til"]);
			expect(consoleSpy).toHaveBeenCalledWith("vault = ~/my-til");
		});

		it("rejects invalid provider", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
			const { runConfigCommand } = await import("../src/cli/global-config");
			runConfigCommand(["set", "ai.provider", "invalid"]);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid provider"));
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("sets ai.provider to anthropic", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
			vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const { runConfigCommand } = await import("../src/cli/global-config");
			runConfigCommand(["set", "ai.provider", "anthropic"]);
			expect(consoleSpy).toHaveBeenCalledWith("ai.provider = anthropic");
		});
	});
});
