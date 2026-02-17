import { App } from "obsidian";

export interface TILStats {
	totalTils: number;
	categories: { name: string; count: number }[];
}

/**
 * vault에서 TIL 통계를 계산한다.
 * tilPath/ 하위의 .md 파일을 수집하고 폴더명으로 카테고리를 분류한다.
 */
export async function computeStats(app: App, tilPath: string): Promise<TILStats> {
	const files = app.vault.getFiles().filter((f) => {
		return f.path.startsWith(tilPath + "/") && f.extension === "md";
	});

	const categoryMap: Record<string, number> = {};
	for (const file of files) {
		const relative = file.path.replace(tilPath + "/", "");
		const parts = relative.split("/");
		const cat = parts.length >= 2 ? parts[0]! : "(uncategorized)";
		categoryMap[cat] = (categoryMap[cat] ?? 0) + 1;
	}

	const categories = Object.entries(categoryMap)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	return {
		totalTils: files.length,
		categories,
	};
}
