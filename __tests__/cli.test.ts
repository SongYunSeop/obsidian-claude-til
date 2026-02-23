import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/core/cli";

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

	it("값 없는 -- 플래그는 무시한다", () => {
		const result = parseArgs(["~/my-til", "--verbose"]);
		expect(result.positional).toEqual(["~/my-til"]);
		expect(result.options).toEqual({});
	});
});
