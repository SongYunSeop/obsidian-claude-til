import { extractCategory } from "../mcp/context";

export interface TILStats {
	totalTils: number;
	categories: { name: string; count: number }[];
}

export interface StatsFileEntry {
	path: string;
	extension: string;
}

/**
 * TIL 통계를 계산한다.
 * tilPath/ 하위의 .md 파일을 수집하고 폴더명으로 카테고리를 분류한다.
 */
export function computeStats(files: StatsFileEntry[], tilPath: string): TILStats {
	const tilFiles = files.filter((f) => {
		return f.path.startsWith(tilPath + "/") && f.extension === "md";
	});

	const categoryMap: Record<string, number> = {};
	for (const file of tilFiles) {
		const cat = extractCategory(file.path, tilPath);
		categoryMap[cat] = (categoryMap[cat] ?? 0) + 1;
	}

	const categories = Object.entries(categoryMap)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	return {
		totalTils: tilFiles.length,
		categories,
	};
}
