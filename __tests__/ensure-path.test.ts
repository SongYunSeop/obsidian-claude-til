import { describe, it, expect } from "vitest";
import { ensurePath } from "../src/core/env";

describe("ensurePath", () => {
	it("undefined PATH → includes Homebrew paths", () => {
		const result = ensurePath(undefined);
		expect(result).toContain("/opt/homebrew/bin");
		expect(result).toContain("/opt/homebrew/sbin");
		expect(result).toContain("/usr/local/bin");
		expect(result).toContain("/usr/local/sbin");
	});

	it("empty PATH → adds Homebrew paths", () => {
		const result = ensurePath("");
		expect(result).toContain("/opt/homebrew/bin");
		expect(result).toContain("/usr/local/bin");
	});

	it("Electron default PATH → adds missing Homebrew paths", () => {
		const minimal = "/usr/bin:/bin:/usr/sbin:/sbin";
		const result = ensurePath(minimal);
		expect(result).toBe(
			"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin"
		);
	});

	it("if Homebrew paths already present, does not add duplicates", () => {
		const full = "/usr/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin";
		const result = ensurePath(full);
		expect(result).toBe(full);
	});

	it("if only some paths present, adds only the missing ones", () => {
		const partial = "/usr/bin:/opt/homebrew/bin";
		const result = ensurePath(partial);
		expect(result).toBe(
			"/usr/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin"
		);
	});
});
