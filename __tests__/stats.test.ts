import { describe, it, expect } from "vitest";
import { computeStats } from "../src/dashboard/stats";
import type { StatsFileEntry } from "../src/dashboard/stats";

function makeFiles(paths: string[]): StatsFileEntry[] {
	return paths.map((p) => ({
		path: p,
		extension: p.split(".").pop() ?? "",
	}));
}

describe("computeStats", () => {
	it("빈 배열에서 통계를 반환한다", () => {
		const stats = computeStats([], "til");

		expect(stats.totalTils).toBe(0);
		expect(stats.categories).toEqual([]);
	});

	it("TIL 파일 수를 정확히 카운트한다", () => {
		const files = makeFiles([
			"til/typescript/generics.md",
			"til/typescript/mapped-types.md",
			"til/react/hooks.md",
		]);
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(3);
	});

	it("카테고리별로 분류한다", () => {
		const files = makeFiles([
			"til/typescript/generics.md",
			"til/typescript/mapped-types.md",
			"til/react/hooks.md",
			"til/react/context.md",
			"til/react/suspense.md",
		]);
		const stats = computeStats(files, "til");

		expect(stats.categories).toHaveLength(2);
		// react가 3개로 가장 많으므로 첫 번째
		expect(stats.categories[0]).toEqual({ name: "react", count: 3 });
		expect(stats.categories[1]).toEqual({ name: "typescript", count: 2 });
	});

	it("tilPath 외부의 파일은 무시한다", () => {
		const files = makeFiles([
			"til/typescript/generics.md",
			"notes/random.md",
			"daily/2024-01-01.md",
		]);
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(1);
	});

	it(".md가 아닌 파일은 무시한다", () => {
		const files: StatsFileEntry[] = [
			{ path: "til/typescript/generics.md", extension: "md" },
			{ path: "til/typescript/notes.txt", extension: "txt" },
		];
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(1);
	});

	it("하위 폴더가 없는 파일은 uncategorized로 분류한다", () => {
		const files = makeFiles(["til/standalone.md"]);
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(1);
		expect(stats.categories[0]!.name).toBe("(uncategorized)");
	});

	it("커스텀 tilPath를 지원한다", () => {
		const files = makeFiles([
			"learning/typescript/generics.md",
			"til/should-be-ignored.md",
		]);
		const stats = computeStats(files, "learning");

		expect(stats.totalTils).toBe(1);
		expect(stats.categories[0]!.name).toBe("typescript");
	});
});
