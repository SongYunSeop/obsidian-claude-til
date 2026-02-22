import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/obsidian/settings";

describe("DEFAULT_SETTINGS", () => {
	it("기본값이 올바르게 정의되어 있다", () => {
		expect(DEFAULT_SETTINGS.autoLaunchClaude).toBe(true);
		expect(DEFAULT_SETTINGS.resumeLastSession).toBe(false);
		expect(DEFAULT_SETTINGS.fontSize).toBe(13);
		expect(DEFAULT_SETTINGS.fontFamily).toBe('Menlo, Monaco, "Courier New", monospace');
		expect(DEFAULT_SETTINGS.lineHeight).toBe(1.0);
		expect(DEFAULT_SETTINGS.tilPath).toBe("til");
		expect(DEFAULT_SETTINGS.autoOpenNewTIL).toBe(true);
		expect(DEFAULT_SETTINGS.openDashboardOnStartup).toBe(false);
	});

	it("shellPath가 문자열이다", () => {
		expect(typeof DEFAULT_SETTINGS.shellPath).toBe("string");
		expect(DEFAULT_SETTINGS.shellPath.length).toBeGreaterThan(0);
	});
});
