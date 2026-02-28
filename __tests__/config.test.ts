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

	it("oh-my-til.json이 없으면 빈 객체를 반환한다", () => {
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
	});

	it("유효한 설정 파일을 읽는다", () => {
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

	it("deploy 키가 없는 설정 파일도 처리한다", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "{}");
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
		expect(config.deploy).toBeUndefined();
	});

	it("잘못된 JSON이면 빈 객체를 반환한다", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "not json{");
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
	});

	it("JSON이 배열이면 빈 객체를 반환한다", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "[1,2,3]");
		const config = loadOmtConfig(tmpDir);
		expect(config).toEqual({});
	});

	it("일부 필드만 있는 설정도 읽는다", () => {
		const data = { deploy: { title: "TIL Only" } };
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.deploy?.title).toBe("TIL Only");
		expect(config.deploy?.subtitle).toBeUndefined();
		expect(config.deploy?.github).toBeUndefined();
	});

	it("mode 필드를 읽는다", () => {
		const data = { mode: "slim" };
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.mode).toBe("slim");
	});

	it("mode가 없으면 undefined를 반환한다", () => {
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), "{}");
		const config = loadOmtConfig(tmpDir);
		expect(config.mode).toBeUndefined();
	});

	it("mode와 deploy를 함께 읽는다", () => {
		const data = { mode: "slim", deploy: { title: "My TIL" } };
		fs.writeFileSync(path.join(tmpDir, "oh-my-til.json"), JSON.stringify(data));
		const config = loadOmtConfig(tmpDir);
		expect(config.mode).toBe("slim");
		expect(config.deploy?.title).toBe("My TIL");
	});
});

describe("loadSiteConfig (deprecated alias)", () => {
	it("loadOmtConfig과 동일하게 동작한다", () => {
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
	it("loadOmtConfig과 동일하게 동작한다", () => {
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
