import { describe, it, expect } from "vitest";
import { parseArgs, expandTilde } from "../src/core/cli";
import * as os from "os";
import * as path from "path";

describe("parseArgs", () => {
	it("positional 인자와 options를 분리한다", () => {
		const result = parseArgs(["~/my-til", "--port", "3000"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ port: "3000" });
	});

	it("positional 인자가 없으면 빈 배열을 반환한다", () => {
		const result = parseArgs(["--port", "3000"]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({ port: "3000" });
	});

	it("options가 없으면 빈 객체를 반환한다", () => {
		const result = parseArgs(["~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({});
	});

	it("인자가 없으면 모두 빈 값을 반환한다", () => {
		const result = parseArgs([]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({});
	});

	it("여러 positional 인자를 수집한다", () => {
		const result = parseArgs(["a", "b", "--til-path", "til"]);
		expect(result.positional).toEqual(["a", "b"]);
		expect(result.options).toEqual({ "til-path": "til" });
	});

	it("알 수 없는 플래그 뒤의 positional을 소비하지 않는다", () => {
		const result = parseArgs(["--verbose", "~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({});
	});

	it("options 뒤의 positional 인자도 수집한다", () => {
		const result = parseArgs(["--port", "3000", "~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ port: "3000" });
	});

	it("--no-obsidian boolean 플래그를 수집한다", () => {
		const result = parseArgs(["~/my-til", "--no-obsidian"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ "no-obsidian": "true" });
	});

	it("알 수 없는 boolean 플래그는 무시한다", () => {
		const result = parseArgs(["--verbose", "--no-obsidian", "~/my-til"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ "no-obsidian": "true" });
	});

	it("--mode 옵션을 파싱한다", () => {
		const result = parseArgs(["~/my-til", "--mode", "slim"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ mode: "slim" });
	});

	it("--mode standard를 파싱한다", () => {
		const result = parseArgs(["--mode", "standard"]);
		expect(result.positional).toEqual([]);
		expect(result.options).toEqual({ mode: "standard" });
	});

	it("--mode와 --no-obsidian을 함께 파싱한다", () => {
		const result = parseArgs(["~/my-til", "--mode", "slim", "--no-obsidian"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({ mode: "slim", "no-obsidian": "true" });
	});
});

describe("expandTilde", () => {
	it("~/로 시작하는 경로를 홈 디렉토리로 확장한다", () => {
		expect(expandTilde("~/my-til")).toBe(path.join(os.homedir(), "my-til"));
	});

	it("~만 있으면 홈 디렉토리를 반환한다", () => {
		expect(expandTilde("~")).toBe(os.homedir());
	});

	it("~로 시작하지 않는 경로는 그대로 반환한다", () => {
		expect(expandTilde("/absolute/path")).toBe("/absolute/path");
		expect(expandTilde("relative/path")).toBe("relative/path");
	});

	it("~user 형태는 확장하지 않는다", () => {
		expect(expandTilde("~other/path")).toBe("~other/path");
	});
});
