import { describe, it, expect } from "vitest";
import { App, Vault } from "obsidian";
import { computeStats } from "../src/dashboard/stats";

function createVaultWithTils(files: string[]): App {
	const vault = new Vault();
	for (const path of files) {
		(vault as any)._setFile(path, `# ${path}`);
	}
	return new App(vault);
}

describe("computeStats", () => {
	it("빈 vault에서 통계를 반환한다", async () => {
		const app = createVaultWithTils([]);
		const stats = await computeStats(app, "til");

		expect(stats.totalTils).toBe(0);
		expect(stats.categories).toEqual([]);
	});

	it("TIL 파일 수를 정확히 카운트한다", async () => {
		const app = createVaultWithTils([
			"til/typescript/generics.md",
			"til/typescript/mapped-types.md",
			"til/react/hooks.md",
		]);
		const stats = await computeStats(app, "til");

		expect(stats.totalTils).toBe(3);
	});

	it("카테고리별로 분류한다", async () => {
		const app = createVaultWithTils([
			"til/typescript/generics.md",
			"til/typescript/mapped-types.md",
			"til/react/hooks.md",
			"til/react/context.md",
			"til/react/suspense.md",
		]);
		const stats = await computeStats(app, "til");

		expect(stats.categories).toHaveLength(2);
		// react가 3개로 가장 많으므로 첫 번째
		expect(stats.categories[0]).toEqual({ name: "react", count: 3 });
		expect(stats.categories[1]).toEqual({ name: "typescript", count: 2 });
	});

	it("tilPath 외부의 파일은 무시한다", async () => {
		const app = createVaultWithTils([
			"til/typescript/generics.md",
			"notes/random.md",
			"daily/2024-01-01.md",
		]);
		const stats = await computeStats(app, "til");

		expect(stats.totalTils).toBe(1);
	});

	it(".md가 아닌 파일은 무시한다", async () => {
		const vault = new Vault();
		(vault as any)._setFile("til/typescript/generics.md", "# content");
		// TFile은 확장자를 path에서 추출하므로 .txt 파일 생성
		(vault as any)._setFile("til/typescript/notes.txt", "text");
		const app = new App(vault);

		const stats = await computeStats(app, "til");

		expect(stats.totalTils).toBe(1);
	});

	it("하위 폴더가 없는 파일은 uncategorized로 분류한다", async () => {
		const app = createVaultWithTils([
			"til/standalone.md",
		]);
		const stats = await computeStats(app, "til");

		expect(stats.totalTils).toBe(1);
		expect(stats.categories[0]!.name).toBe("(uncategorized)");
	});

	it("커스텀 tilPath를 지원한다", async () => {
		const app = createVaultWithTils([
			"learning/typescript/generics.md",
			"til/should-be-ignored.md",
		]);
		const stats = await computeStats(app, "learning");

		expect(stats.totalTils).toBe(1);
		expect(stats.categories[0]!.name).toBe("typescript");
	});
});
