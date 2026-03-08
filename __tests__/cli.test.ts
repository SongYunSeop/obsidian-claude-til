import { describe, it, expect } from "vitest";
import { parseArgs, expandTilde } from "../src/core/cli";
import * as os from "os";
import * as path from "path";

describe("parseArgs", () => {
	it("separates positional arguments and options", () => {
		const result = parseArgs(["~/my-til", "--port", "3000"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ port: "3000" });
	});

	it("returns empty array when no positional arguments", () => {
		const result = parseArgs(["--port", "3000"]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({ port: "3000" });
	});

	it("returns empty object when no options", () => {
		const result = parseArgs(["~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({});
	});

	it("returns all empty values when no arguments", () => {
		const result = parseArgs([]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({});
	});

	it("collects multiple positional arguments", () => {
		const result = parseArgs(["a", "b", "--til-path", "til"]);
		expect(result.positional).toEqual(["a", "b"]);
		expect(result.options).toEqual({ "til-path": "til" });
	});

	it("does not consume positional after unknown flags", () => {
		const result = parseArgs(["--verbose", "~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({});
	});

	it("collects positional arguments after options", () => {
		const result = parseArgs(["--port", "3000", "~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ port: "3000" });
	});

	it("collects --no-obsidian boolean flag", () => {
		const result = parseArgs(["~/my-til", "--no-obsidian"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ "no-obsidian": "true" });
	});

	it("ignores unknown boolean flags", () => {
		const result = parseArgs(["--verbose", "--no-obsidian", "~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ "no-obsidian": "true" });
	});

	it("parses --mode option", () => {
		const result = parseArgs(["~/my-til", "--mode", "slim"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ mode: "slim" });
	});

	it("parses --mode standard", () => {
		const result = parseArgs(["--mode", "standard"]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({ mode: "standard" });
	});

	it("parses --mode and --no-obsidian together", () => {
		const result = parseArgs(["~/my-til", "--mode", "slim", "--no-obsidian"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ mode: "slim", "no-obsidian": "true" });
	});
});

describe("expandTilde", () => {
	it("expands path starting with ~/ to home directory", () => {
		expect(expandTilde("~/my-til")).toBe(path.join(os.homedir(), "my-til"));
	});

	it("returns home directory when only ~ is given", () => {
		expect(expandTilde("~")).toBe(os.homedir());
	});

	it("returns path as-is when it does not start with ~", () => {
		expect(expandTilde("/absolute/path")).toBe("/absolute/path");
		expect(expandTilde("relative/path")).toBe("relative/path");
	});

	it("does not expand ~user form", () => {
		expect(expandTilde("~other/path")).toBe("~other/path");
	});
});

