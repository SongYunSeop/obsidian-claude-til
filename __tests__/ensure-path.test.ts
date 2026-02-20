import { describe, it, expect } from "vitest";
import { ensurePath } from "../src/terminal/env";

describe("ensurePath", () => {
	it("undefined PATH → Homebrew 경로 포함", () => {
		const result = ensurePath(undefined);
		expect(result).toContain("/opt/homebrew/bin");
		expect(result).toContain("/opt/homebrew/sbin");
		expect(result).toContain("/usr/local/bin");
		expect(result).toContain("/usr/local/sbin");
	});

	it("빈 PATH → Homebrew 경로 추가", () => {
		const result = ensurePath("");
		expect(result).toContain("/opt/homebrew/bin");
		expect(result).toContain("/usr/local/bin");
	});

	it("Electron 기본 PATH → 누락된 Homebrew 경로 추가", () => {
		const minimal = "/usr/bin:/bin:/usr/sbin:/sbin";
		const result = ensurePath(minimal);
		expect(result).toBe(
			"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin"
		);
	});

	it("이미 Homebrew 경로가 있으면 중복 추가하지 않음", () => {
		const full = "/usr/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin";
		const result = ensurePath(full);
		expect(result).toBe(full);
	});

	it("일부만 있으면 누락된 것만 추가", () => {
		const partial = "/usr/bin:/opt/homebrew/bin";
		const result = ensurePath(partial);
		expect(result).toBe(
			"/usr/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin"
		);
	});
});
