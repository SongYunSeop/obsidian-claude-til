import { describe, it, expect } from "vitest";
import { getPluginArtifacts, buildPluginPackageJson, needsRebuild, isValidVersion } from "../src/cli/obsidian-install";
import * as path from "path";

describe("getPluginArtifacts", () => {
	it("returns absolute paths for 4 artifacts", () => {
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

	it("generates paths relative to packageRoot", () => {
		const artifacts = getPluginArtifacts("/other/root");
		for (const a of artifacts) {
			expect(a.startsWith("/other/root/")).toBe(true);
		}
	});
});

describe("buildPluginPackageJson", () => {
	it("returns valid JSON", () => {
		const json = buildPluginPackageJson();
		const parsed = JSON.parse(json);
		expect(parsed).toBeDefined();
	});

	it("includes node-pty, ajv, ajv-formats dependencies", () => {
		const parsed = JSON.parse(buildPluginPackageJson());
		expect(parsed.dependencies).toHaveProperty("node-pty");
		expect(parsed.dependencies).toHaveProperty("ajv");
		expect(parsed.dependencies).toHaveProperty("ajv-formats");
	});

	it("sets type: commonjs", () => {
		const parsed = JSON.parse(buildPluginPackageJson());
		expect(parsed.type).toBe("commonjs");
	});

	it("sets private: true", () => {
		const parsed = JSON.parse(buildPluginPackageJson());
		expect(parsed.private).toBe(true);
	});
});

describe("needsRebuild", () => {
	it("returns false when versions are the same", () => {
		expect(needsRebuild("37.10.2", "37.10.2")).toBe(false);
	});

	it("returns true when cached is null (first build)", () => {
		expect(needsRebuild("37.10.2", null)).toBe(true);
	});

	it("returns false when current is null (detection failure)", () => {
		expect(needsRebuild(null, "37.10.2")).toBe(false);
		expect(needsRebuild(null, null)).toBe(false);
	});

	it("returns true when versions differ", () => {
		expect(needsRebuild("38.0.0", "37.10.2")).toBe(true);
	});
});

describe("isValidVersion", () => {
	it("accepts valid semver versions", () => {
		expect(isValidVersion("37.10.2")).toBe(true);
		expect(isValidVersion("1.0.0")).toBe(true);
		expect(isValidVersion("38.0.0-beta.1")).toBe(true);
	});

	it("rejects invalid formats", () => {
		expect(isValidVersion("")).toBe(false);
		expect(isValidVersion("not-a-version")).toBe(false);
		expect(isValidVersion('"; rm -rf /')).toBe(false);
		expect(isValidVersion("37.10")).toBe(false);
		expect(isValidVersion("37")).toBe(false);
	});
});
