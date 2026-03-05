import { describe, it, expect, vi, beforeEach } from "vitest";
import { TFile, Vault } from "./mock-obsidian";

// Tests the core filtering logic of TILWatcher.
// Since the actual class depends on Obsidian's EventRef type,
// we reproduce the same logic here for testing.
function shouldOpenFile(file: unknown, tilPath: string): boolean {
	if (!(file instanceof TFile)) return false;
	if (!file.path.startsWith(tilPath + "/")) return false;
	if (file.extension !== "md") return false;
	return true;
}

describe("TILWatcher filtering logic", () => {
	it("detects .md files under til/", () => {
		const file = new TFile("til/react-hooks.md");
		expect(shouldOpenFile(file, "til")).toBe(true);
	});

	it("detects .md files in subdirectories under til/", () => {
		const file = new TFile("til/typescript/generics.md");
		expect(shouldOpenFile(file, "til")).toBe(true);
	});

	it("ignores files at other paths", () => {
		const file = new TFile("notes/daily.md");
		expect(shouldOpenFile(file, "til")).toBe(false);
	});

	it("ignores non-.md extensions", () => {
		const file = new TFile("til/image.png");
		expect(shouldOpenFile(file, "til")).toBe(false);
	});

	it("ignores objects that are not TFile", () => {
		expect(shouldOpenFile({ path: "til/test.md" }, "til")).toBe(false);
	});

	it("ignores files with same name as tilPath itself (no trailing slash)", () => {
		const file = new TFile("tilExtra/test.md");
		expect(shouldOpenFile(file, "til")).toBe(false);
	});

	it("supports custom tilPath", () => {
		const file = new TFile("learning/til/react.md");
		expect(shouldOpenFile(file, "learning/til")).toBe(true);
	});
});

describe("TILWatcher event integration", () => {
	let vault: Vault;
	let openedFiles: string[];

	beforeEach(() => {
		vault = new Vault();
		openedFiles = [];
	});

	it("opens file on vault 'create' event", () => {
		vi.useFakeTimers();

		const tilPath = "til";
		vault.on("create", (file: unknown) => {
			if (shouldOpenFile(file, tilPath)) {
				setTimeout(() => {
					openedFiles.push((file as TFile).path);
				}, 200);
			}
		});

		const file = new TFile("til/new-topic.md");
		vault._trigger("create", file);

		vi.advanceTimersByTime(200);
		expect(openedFiles).toContain("til/new-topic.md");

		vi.useRealTimers();
	});

	it("does not receive events after stop", () => {
		const tilPath = "til";
		const ref = vault.on("create", (file: unknown) => {
			if (shouldOpenFile(file, tilPath)) {
				openedFiles.push((file as TFile).path);
			}
		});

		vault.offref(ref as { event: string });

		const file = new TFile("til/should-not-open.md");
		vault._trigger("create", file);

		expect(openedFiles).toEqual([]);
	});
});
