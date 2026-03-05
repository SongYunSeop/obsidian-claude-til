import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadOmtConfig, loadSiteConfig } from "../src/core/config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("loadOmtConfig", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns empty object when oh-my-til.json does not exist", () => {
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
	});

	it("reads a valid config file", () => {
		const data = {
			deploy: {
				title: "My TIL",
				subtitle: "매일 배운 것을 기록합니다",
				github: "https://github.com/user",
				out: "docs",
				"til-path": "notes",
			},
		};
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.deploy?.title).toBe("My TIL");
		expect(config.deploy?.subtitle).toBe("매일 배운 것을 기록합니다");
		expect(config.deploy?.github).toBe("https://github.com/user");
		expect(config.deploy?.out).toBe("docs");
		expect(config.deploy?.["til-path"]).toBe("notes");
	});

	it("handles config file without deploy key", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "{}");
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
		expect(config.deploy).toBeUndefined();
	});

	it("returns empty object for invalid JSON", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "not json{");
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
	});

	it("returns empty object when JSON is an array", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "[1,2,3]");
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
	});

	it("reads config with only some fields present", () => {
		const data = { deploy: { title: "TIL Only" } };
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.deploy?.title).toBe("TIL Only");
		expect(config.deploy?.subtitle).toBeUndefined();
		expect(config.deploy?.github).toBeUndefined();
	});

	it("reads the mode field", () => {
		const data = { mode: "slim" };
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.mode).toBe("slim");
	});

	it("returns undefined for mode when not present", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "{}");
		const config = loadOmtConfig(tmpDir);
		expect(config.mode).toBeUndefined();
	});

	it("reads mode and deploy together", () => {
		const data = { mode: "slim", deploy: { title: "My TIL" } };
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.mode).toBe("slim");
		expect(config.deploy?.title).toBe("My TIL");
	});
});

describe("loadSiteConfig (deprecated alias)", () => {
	it("behaves the same as loadOmtConfig", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-alias-"));
		try {
			const data = { mode: "slim", deploy: { title: "Test" } };
			fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
			const config = loadSiteConfig(tmpDir);
			expect(config.mode).toBe("slim");
			expect(config.deploy?.title).toBe("Test");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

describe("loadSiteConfig (deprecated alias)", () => {
	it("behaves the same as loadOmtConfig", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-alias-"));
		try {
			const data = { deploy: { title: "Test" } };
			fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
			const config = loadSiteConfig(tmpDir);
			expect(config.deploy?.title).toBe("Test");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
