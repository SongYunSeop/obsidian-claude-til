import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { FsStorage, FsMetadata } from "../src/adapters/fs-adapter";

describe("FsStorage", () => {
	let tmpDir: string;
	let storage: FsStorage;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-adapter-test-"));
		storage = new FsStorage(tmpDir);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("writeFile + readFile", async () => {
		await storage.writeFile("test.md", "hello");
		const content = await storage.readFile("test.md");
		expect(content).toBe("hello");
	});

	it("readFile returns null for missing file", async () => {
		expect(await storage.readFile("nonexistent.md")).toBeNull();
	});

	it("exists returns true/false", async () => {
		expect(await storage.exists("test.md")).toBe(false);
		await storage.writeFile("test.md", "hello");
		expect(await storage.exists("test.md")).toBe(true);
	});

	it("writeFile creates nested directories", async () => {
		await storage.writeFile("a/b/c.md", "deep");
		expect(await storage.readFile("a/b/c.md")).toBe("deep");
	});

	it("listFiles walks directory", async () => {
		await storage.writeFile("til/ts/generics.md", "# Generics");
		await storage.writeFile("til/react/hooks.md", "# Hooks");
		const files = await storage.listFiles();
		expect(files.length).toBe(2);
		expect(files.map((f) => f.path).sort()).toEqual([
			"til/react/hooks.md",
			"til/ts/generics.md",
		]);
		expect(files[0]!.extension).toBe("md");
		expect(files[0]!.name).toMatch(/\.md$/);
	});

	it("listFiles skips hidden directories", async () => {
		await storage.writeFile(".hidden/secret.md", "secret");
		await storage.writeFile("visible.md", "visible");
		const files = await storage.listFiles();
		expect(files.length).toBe(1);
		expect(files[0]!.path).toBe("visible.md");
	});

	it("remove deletes file", async () => {
		await storage.writeFile("test.md", "delete me");
		await storage.remove("test.md");
		expect(await storage.exists("test.md")).toBe(false);
	});

	it("mkdir creates directory", async () => {
		await storage.mkdir("a/b/c");
		expect(await storage.exists("a/b/c")).toBe(true);
	});

	it("getBasePath returns constructor value", () => {
		expect(storage.getBasePath()).toBe(tmpDir);
	});

	it("blocks path traversal on readFile", async () => {
		expect(await storage.readFile("../../etc/passwd")).toBeNull();
	});

	it("blocks path traversal on writeFile", async () => {
		await expect(storage.writeFile("../outside.txt", "hack")).rejects.toThrow("Path traversal denied");
	});

	it("blocks path traversal on exists", async () => {
		expect(await storage.exists("../../etc/passwd")).toBe(false);
	});

	it("blocks path traversal on remove", async () => {
		// remove swallows errors, but traversal should not reach outside
		await storage.remove("../outside.txt");
		// no throw — caught internally
	});
});

describe("FsMetadata", () => {
	let tmpDir: string;
	let metadata: FsMetadata;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-metadata-test-"));
		metadata = new FsMetadata(tmpDir);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("extracts headings from markdown", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "# Title\n\nBody\n\n## Section\n\n### Sub");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.headings).toEqual(["Title", "Section", "Sub"]);
	});

	it("extracts links from markdown", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "See [link](other.md) and [ref](http://example.com)");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.outgoingLinks).toEqual(["other.md", "http://example.com"]);
	});

	it("extracts wikilinks", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "See [[other-page]] and [[aliased|display]]");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.outgoingLinks).toEqual(["other-page", "aliased"]);
	});

	it("extracts tags from frontmatter", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "---\ntags:\n  - til\n  - typescript\n---\n# Content");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.tags).toEqual(["til", "typescript"]);
	});

	it("extracts inline #tags from body", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "---\ntags:\n  - frontmatter\n---\n# Title\n\nSome text #inline-tag and #another");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.tags).toEqual(["frontmatter", "#inline-tag", "#another"]);
	});

	it("extracts frontmatter", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "---\ndate: 2024-01-15\ntags:\n  - til\n---\n# Content");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.frontmatter.date).toBe("2024-01-15");
	});

	it("returns null for missing file", async () => {
		expect(await metadata.getFileMetadata("nope.md")).toBeNull();
	});

	it("handles file without frontmatter", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "# No frontmatter\n\nJust content");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.headings).toEqual(["No frontmatter"]);
		expect(meta?.frontmatter).toEqual({});
		expect(meta?.tags).toEqual([]);
	});

	it("getActiveFilePath returns null in standalone", async () => {
		expect(await metadata.getActiveFilePath()).toBeNull();
	});

	it("getResolvedLinks returns empty in standalone", async () => {
		expect(await metadata.getResolvedLinks()).toEqual({});
	});

	it("getUnresolvedLinks returns empty in standalone", async () => {
		expect(await metadata.getUnresolvedLinks()).toEqual({});
	});

	it("blocks path traversal on getFileMetadata", async () => {
		expect(await metadata.getFileMetadata("../../etc/passwd")).toBeNull();
	});

	it("skips frontmatter headings when extracting headings", async () => {
		await fs.writeFile(path.join(tmpDir, "test.md"), "---\ntitle: Test\n---\n# Real Heading\n\nBody");
		const meta = await metadata.getFileMetadata("test.md");
		expect(meta?.headings).toEqual(["Real Heading"]);
	});
});
