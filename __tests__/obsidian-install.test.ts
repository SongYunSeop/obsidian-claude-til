import { describe, it, expect } from "vitest";
import { getPluginArtifacts, buildPluginPackageJson, needsRebuild, isValidVersion } from "../src/cli/obsidian-install";
import * as path from "path";

describe("getPluginArtifacts", () => {
	it("4개 아티팩트의 절대 경로를 반환한다", () => {
		const root = "/fake/package";
		const artifacts = getPluginArtifacts(root);
		expect(artifacts).toHaveLength(4);
		expect(artifacts).toEqual([
			path.join(root, "main.js"),
			path.join(root, "manifest.json"),
			path.join(root, "styles.css"),
			path.join(root, "migrate-links.mjs"),
		]);
	});

	it("packageRoot 기준으로 경로를 생성한다", () => {
		const artifacts = getPluginArtifacts("/other/root");
		for (const a of artifacts) {
			expect(a.startsWith("/other/root/")).toBe(true);
		}
	});
});

describe("buildPluginPackageJson", () => {
	it("유효한 JSON을 반환한다", () => {
		const json = buildPluginPackageJson();
		const parsed = JSON.parse(json);
		expect(parsed).toBeDefined();
	});

	it("node-pty, ajv, ajv-formats 의존성을 포함한다", () => {
		const parsed = JSON.parse(buildPluginPackageJson());
		expect(parsed.dependencies).toHaveProperty("node-pty");
		expect(parsed.dependencies).toHaveProperty("ajv");
		expect(parsed.dependencies).toHaveProperty("ajv-formats");
	});

	it("type: commonjs를 설정한다", () => {
		const parsed = JSON.parse(buildPluginPackageJson());
		expect(parsed.type).toBe("commonjs");
	});

	it("private: true를 설정한다", () => {
		const parsed = JSON.parse(buildPluginPackageJson());
		expect(parsed.private).toBe(true);
	});
});

describe("needsRebuild", () => {
	it("같은 버전이면 false를 반환한다", () => {
		expect(needsRebuild("37.10.2", "37.10.2")).toBe(false);
	});

	it("cached가 null이면 true를 반환한다 (최초 빌드)", () => {
		expect(needsRebuild("37.10.2", null)).toBe(true);
	});

	it("current가 null이면 false를 반환한다 (감지 실패)", () => {
		expect(needsRebuild(null, "37.10.2")).toBe(false);
		expect(needsRebuild(null, null)).toBe(false);
	});

	it("다른 버전이면 true를 반환한다", () => {
		expect(needsRebuild("38.0.0", "37.10.2")).toBe(true);
	});
});

describe("isValidVersion", () => {
	it("정상 semver 버전을 통과시킨다", () => {
		expect(isValidVersion("37.10.2")).toBe(true);
		expect(isValidVersion("1.0.0")).toBe(true);
		expect(isValidVersion("38.0.0-beta.1")).toBe(true);
	});

	it("잘못된 형식을 거부한다", () => {
		expect(isValidVersion("")).toBe(false);
		expect(isValidVersion("not-a-version")).toBe(false);
		expect(isValidVersion('"; rm -rf /')).toBe(false);
		expect(isValidVersion("37.10")).toBe(false);
		expect(isValidVersion("37")).toBe(false);
	});
});
