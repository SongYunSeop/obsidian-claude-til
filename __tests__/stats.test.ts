import { describe, it, expect } from "vitest";
import { computeStats } from "../src/core/stats";
import {
	computeStreak,
	computeWeeklyCount,
	computeHeatmapData,
	computeEnhancedCategories,
	computeDashboardBacklog,
	computeWeeklyTrend,
	computeCategoryDistribution,
	computeTreemapLayout,
	computeEnhancedStats,
	formatDashboardText,
	selectRecentTils,
	extractSummary,
	extractDateOnly,
	pickRandomReviewItems,
} from "../src/core/stats";
import type { StatsFileEntry, EnhancedStatsFileEntry, BacklogProgressEntry } from "../src/core/stats";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeFiles(paths: string[]): StatsFileEntry[] {
	return paths.map((p) => ({
		path: p,
		extension: p.split(".").pop() ?? "",
	}));
}

function makeEnhancedFiles(
	entries: Array<{ path: string; mtime?: number; createdDate?: string; tags?: string[] }>,
	baseTime?: number,
): EnhancedStatsFileEntry[] {
	const now = baseTime ?? Date.now();
	return entries.map((e) => ({
		path: e.path,
		extension: e.path.split(".").pop() ?? "",
		mtime: e.mtime ?? now,
		ctime: e.mtime ?? now,
		createdDate: e.createdDate,
		tags: e.tags ?? ["til"],
	}));
}

describe("computeStats", () => {
	it("returns stats from an empty array", () => {
		const stats = computeStats([], "til");

		expect(stats.totalTils).toBe(0);
		expect(stats.categories).toEqual([]);
	});

	it("accurately counts the number of TIL files", () => {
		const files = makeFiles([
			"til/typescript/generics.md",
			"til/typescript/mapped-types.md",
			"til/react/hooks.md",
		]);
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(3);
	});

	it("classifies files by category", () => {
		const files = makeFiles([
			"til/typescript/generics.md",
			"til/typescript/mapped-types.md",
			"til/react/hooks.md",
			"til/react/context.md",
			"til/react/suspense.md",
		]);
		const stats = computeStats(files, "til");

		expect(stats.categories).toHaveLength(2);
		// react has the most (3), so it comes first
		expect(stats.categories[0]).toEqual({ name: "react", count: 3 });
		expect(stats.categories[1]).toEqual({ name: "typescript", count: 2 });
	});

	it("ignores files outside tilPath", () => {
		const files = makeFiles([
			"til/typescript/generics.md",
			"notes/random.md",
			"daily/2024-01-01.md",
		]);
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(1);
	});

	it("ignores non-.md files", () => {
		const files: StatsFileEntry[] = [
			{ path: "til/typescript/generics.md", extension: "md" },
			{ path: "til/typescript/notes.txt", extension: "txt" },
		];
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(1);
	});

	it("classifies files without a subfolder as uncategorized", () => {
		const files = makeFiles(["til/standalone.md"]);
		const stats = computeStats(files, "til");

		expect(stats.totalTils).toBe(1);
		expect(stats.categories[0]!.name).toBe("(uncategorized)");
	});

	it("supports a custom tilPath", () => {
		const files = makeFiles([
			"learning/typescript/generics.md",
			"til/should-be-ignored.md",
		]);
		const stats = computeStats(files, "learning");

		expect(stats.totalTils).toBe(1);
		expect(stats.categories[0]!.name).toBe("typescript");
	});
});

// --- Enhanced Stats Tests ---

describe("computeStreak", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns 0 from an empty array", () => {
		expect(computeStreak([], "til", now)).toBe(0);
	});

	it("streak is 1 when there is activity today", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now - 1000 },
		]);
		expect(computeStreak(files, "til", now)).toBe(1);
	});

	it("streak is 3 for 3 consecutive days of activity", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now - 1 * DAY_MS },
			{ path: "til/react/c.md", mtime: now - 2 * DAY_MS },
		]);
		expect(computeStreak(files, "til", now)).toBe(3);
	});

	it("counts streak starting from yesterday even without today's activity", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now - 1 * DAY_MS },
			{ path: "til/ts/b.md", mtime: now - 2 * DAY_MS },
		]);
		expect(computeStreak(files, "til", now)).toBe(2);
	});

	it("streak resets when there is a gap day", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			// no entry for yesterday
			{ path: "til/ts/b.md", mtime: now - 2 * DAY_MS },
		]);
		expect(computeStreak(files, "til", now)).toBe(1);
	});

	it("excludes backlog.md", () => {
			const files = makeEnhancedFiles([
			{ path: "til/ts/backlog.md", mtime: now },
		]);
		expect(computeStreak(files, "til", now)).toBe(0);
	});

	it("excludes files tagged moc", () => {
		const files: EnhancedStatsFileEntry[] = [{
			path: "til/ts/overview.md", extension: "md", mtime: now, ctime: now, tags: ["moc", "til"],
		}];
		expect(computeStreak(files, "til", now)).toBe(0);
	});

	it("excludes files that do not have the til tag", () => {
		const files: EnhancedStatsFileEntry[] = [{
			path: "til/ts/draft.md", extension: "md", mtime: now, ctime: now, tags: ["draft"],
		}];
		expect(computeStreak(files, "til", now)).toBe(0);
	});

	it("excludes files with no tags", () => {
		const files: EnhancedStatsFileEntry[] = [{
			path: "til/ts/no-tags.md", extension: "md", mtime: now, ctime: now,
		}];
		expect(computeStreak(files, "til", now)).toBe(0);
	});

	it("streak is 1 even when multiple files exist on the same day", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now - 1000 },
			{ path: "til/react/c.md", mtime: now - 2000 },
		]);
		expect(computeStreak(files, "til", now)).toBe(1);
	});

	it("ignores files outside tilPath", () => {
		const files = makeEnhancedFiles([
			{ path: "notes/random.md", mtime: now },
		]);
		expect(computeStreak(files, "til", now)).toBe(0);
	});

	it("uses frontmatter date instead of ctime when present", () => {
		// ctime is today but frontmatter date is 3 days ago
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now, createdDate: "2026-02-19" },
			{ path: "til/ts/b.md", mtime: now, createdDate: "2026-02-20" },
			{ path: "til/ts/c.md", mtime: now, createdDate: "2026-02-21" },
		]);
		expect(computeStreak(files, "til", now)).toBe(3);
	});

	it("falls back to ctime when frontmatter date is absent", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
		]);
		// no createdDate → falls back to ctime(=now) → streak 1
		expect(computeStreak(files, "til", now)).toBe(1);
	});

	it("extracts date only from datetime format for streak calculation", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now, createdDate: "2026-02-21T09:00:00" },
			{ path: "til/ts/b.md", mtime: now, createdDate: "2026-02-21T18:30:00" },
			{ path: "til/ts/c.md", mtime: now, createdDate: "2026-02-20T14:00:00" },
		]);
		// 2 entries on 2/21, 1 on 2/20 → 2 consecutive days
		expect(computeStreak(files, "til", now)).toBe(2);
	});
});

describe("computeWeeklyCount", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns 0 from an empty array", () => {
		expect(computeWeeklyCount([], "til", now)).toBe(0);
	});

	it("counts only files from the last 7 days", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now - 1 * DAY_MS },
			{ path: "til/ts/b.md", mtime: now - 3 * DAY_MS },
			{ path: "til/ts/c.md", mtime: now - 10 * DAY_MS }, // exceeds 7 days
		]);
		expect(computeWeeklyCount(files, "til", now)).toBe(2);
	});

	it("excludes backlog.md", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/backlog.md", mtime: now },
		]);
		expect(computeWeeklyCount(files, "til", now)).toBe(1);
	});

	it("counts based on frontmatter date", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now, createdDate: "2026-02-20" }, // yesterday → included
			{ path: "til/ts/b.md", mtime: now, createdDate: "2026-02-10" }, // 11 days ago → excluded
		]);
		expect(computeWeeklyCount(files, "til", now)).toBe(1);
	});
});

describe("computeHeatmapData", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns 365 cells from an empty array (all level 0)", () => {
		const result = computeHeatmapData([], "til", now);
		expect(result.cells).toHaveLength(365);
		expect(result.maxCount).toBe(0);
		expect(result.cells.every((c) => c.level === 0)).toBe(true);
	});

	it("level is non-zero for dates with activity", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
		]);
		const result = computeHeatmapData(files, "til", now);
		const todayCell = result.cells[result.cells.length - 1]!;
		expect(todayCell.count).toBe(1);
		expect(todayCell.level).toBeGreaterThan(0);
	});

	it("count accumulates when multiple files exist on the same day", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now - 1000 },
			{ path: "til/react/c.md", mtime: now - 2000 },
		]);
		const result = computeHeatmapData(files, "til", now);
		const todayCell = result.cells[result.cells.length - 1]!;
		expect(todayCell.count).toBe(3);
		expect(result.maxCount).toBe(3);
	});

	it("level distribution is correct (1-4 quartile)", () => {
		// when maxCount=4: 1->L1, 2->L2, 3->L3, 4->L4
		const files = makeEnhancedFiles([
			{ path: "til/a/a1.md", mtime: now },
			{ path: "til/a/a2.md", mtime: now - 1000 },
			{ path: "til/a/a3.md", mtime: now - 2000 },
			{ path: "til/a/a4.md", mtime: now - 3000 },
			{ path: "til/b/b1.md", mtime: now - 1 * DAY_MS },
		]);
		const result = computeHeatmapData(files, "til", now);
		// today: 4 entries -> level 4, yesterday: 1 entry -> level 1
		const todayCell = result.cells[result.cells.length - 1]!;
		const yesterdayCell = result.cells[result.cells.length - 2]!;
		expect(todayCell.level).toBe(4);
		expect(yesterdayCell.level).toBe(1);
	});

	it("data older than 365 days is not included in cells", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/old.md", mtime: now - 400 * DAY_MS },
		]);
		const result = computeHeatmapData(files, "til", now);
		expect(result.cells.every((c) => c.count === 0)).toBe(true);
	});

	it("generates heatmap based on frontmatter date", () => {
		// all ctimes are today but frontmatter dates are different
		const files = makeEnhancedFiles([
			{ path: "til/a/a1.md", mtime: now, createdDate: "2026-02-21" },
			{ path: "til/a/a2.md", mtime: now, createdDate: "2026-02-20" },
		]);
		const result = computeHeatmapData(files, "til", now);
		const todayCell = result.cells[result.cells.length - 1]!;
		const yesterdayCell = result.cells[result.cells.length - 2]!;
		expect(todayCell.count).toBe(1);
		expect(yesterdayCell.count).toBe(1);
	});
});

describe("computeEnhancedCategories", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns empty categories from an empty array", () => {
		expect(computeEnhancedCategories([], "til")).toEqual([]);
	});

	it("classifies files by category", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now - 1 * DAY_MS },
			{ path: "til/react/c.md", mtime: now },
		]);
		const result = computeEnhancedCategories(files, "til");

		expect(result).toHaveLength(2);
		expect(result[0]!.name).toBe("ts");
		expect(result[0]!.count).toBe(2);
		expect(result[1]!.name).toBe("react");
		expect(result[1]!.count).toBe(1);
	});

	it("files are sorted in reverse mtime order", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/old.md", mtime: now - 5 * DAY_MS },
			{ path: "til/ts/new.md", mtime: now },
		]);
		const result = computeEnhancedCategories(files, "til");
		expect(result[0]!.files[0]!.filename).toBe("new.md");
		expect(result[0]!.files[1]!.filename).toBe("old.md");
	});

	it("excludes backlog.md", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/backlog.md", mtime: now },
		]);
		const result = computeEnhancedCategories(files, "til");
		expect(result[0]!.count).toBe(1);
	});
});

describe("computeDashboardBacklog", () => {
	it("returns empty result from an empty array", () => {
		const result = computeDashboardBacklog([]);
		expect(result.totalDone).toBe(0);
		expect(result.totalItems).toBe(0);
		expect(result.categories).toEqual([]);
	});

	it("calculates totals correctly", () => {
		const entries: BacklogProgressEntry[] = [
			{ category: "ts", filePath: "til/ts/backlog.md", done: 5, total: 10 },
			{ category: "react", filePath: "til/react/backlog.md", done: 3, total: 8 },
		];
		const result = computeDashboardBacklog(entries);
		expect(result.totalDone).toBe(8);
		expect(result.totalItems).toBe(18);
	});

	it("sorts by progress in descending order", () => {
		const entries: BacklogProgressEntry[] = [
			{ category: "low", filePath: "til/low/backlog.md", done: 1, total: 10 }, // 10%
			{ category: "high", filePath: "til/high/backlog.md", done: 9, total: 10 }, // 90%
			{ category: "mid", filePath: "til/mid/backlog.md", done: 5, total: 10 }, // 50%
		];
		const result = computeDashboardBacklog(entries);
		expect(result.categories[0]!.category).toBe("high");
		expect(result.categories[1]!.category).toBe("mid");
		expect(result.categories[2]!.category).toBe("low");
	});
});

describe("computeWeeklyTrend", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime(); // Saturday

	it("returns 16 week entries from an empty array (all count 0)", () => {
		const result = computeWeeklyTrend([], "til", 16, now);
		expect(result).toHaveLength(16);
		expect(result.every(w => w.count === 0)).toBe(true);
	});

	it("counts this week's files in the last entry", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now, createdDate: "2026-02-21" },
			{ path: "til/ts/b.md", mtime: now, createdDate: "2026-02-20" },
		]);
		const result = computeWeeklyTrend(files, "til", 16, now);
		expect(result[result.length - 1]!.count).toBe(2);
	});

	it("can adjust weekCount", () => {
		const result = computeWeeklyTrend([], "til", 8, now);
		expect(result).toHaveLength(8);
	});

	it("ignores files outside the weekly range", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now, createdDate: "2025-01-01" },
		]);
		const result = computeWeeklyTrend(files, "til", 16, now);
		expect(result.every(w => w.count === 0)).toBe(true);
	});

	it("excludes backlog.md and moc files", () => {
		const files: EnhancedStatsFileEntry[] = [
			{ path: "til/ts/backlog.md", extension: "md", mtime: now, ctime: now, tags: ["til"], createdDate: "2026-02-21" },
			{ path: "til/ts/moc.md", extension: "md", mtime: now, ctime: now, tags: ["moc", "til"], createdDate: "2026-02-21" },
			{ path: "til/ts/real.md", extension: "md", mtime: now, ctime: now, tags: ["til"], createdDate: "2026-02-21" },
		];
		const result = computeWeeklyTrend(files, "til", 16, now);
		expect(result[result.length - 1]!.count).toBe(1);
	});

	it("weekStart label is in M/D format", () => {
		const result = computeWeeklyTrend([], "til", 4, now);
		for (const entry of result) {
			expect(entry.weekStart).toMatch(/^\d{1,2}\/\d{1,2}$/);
		}
	});

	it("counts files from different weeks in separate entries", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now, createdDate: "2026-02-21" }, // this week
			{ path: "til/ts/b.md", mtime: now, createdDate: "2026-02-14" }, // last week
		]);
		const result = computeWeeklyTrend(files, "til", 16, now);
		expect(result[result.length - 1]!.count).toBe(1);
		expect(result[result.length - 2]!.count).toBe(1);
	});
});

describe("computeCategoryDistribution", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns empty result from an empty array", () => {
		expect(computeCategoryDistribution([], "til")).toEqual([]);
	});

	it("calculates distribution by category", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now },
			{ path: "til/react/c.md", mtime: now },
		]);
		const result = computeCategoryDistribution(files, "til");
		expect(result).toHaveLength(2);
		expect(result[0]!.name).toBe("ts");
		expect(result[0]!.count).toBe(2);
		expect(result[0]!.percentage).toBe(67);
		expect(result[1]!.name).toBe("react");
		expect(result[1]!.count).toBe(1);
		expect(result[1]!.percentage).toBe(33);
	});

	it("sorts by count in descending order", () => {
		const files = makeEnhancedFiles([
			{ path: "til/react/a.md", mtime: now },
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now },
			{ path: "til/ts/c.md", mtime: now },
		]);
		const result = computeCategoryDistribution(files, "til");
		expect(result[0]!.name).toBe("ts");
		expect(result[1]!.name).toBe("react");
	});

	it("excludes backlog.md", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/backlog.md", mtime: now },
		]);
		const result = computeCategoryDistribution(files, "til");
		expect(result).toHaveLength(1);
		expect(result[0]!.count).toBe(1);
		expect(result[0]!.percentage).toBe(100);
	});

	it("ignores files outside tilPath", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "notes/random.md", mtime: now },
		]);
		const result = computeCategoryDistribution(files, "til");
		expect(result).toHaveLength(1);
	});
});

describe("computeTreemapLayout", () => {
	it("returns an empty array from empty data", () => {
		expect(computeTreemapLayout([], 400, 160)).toEqual([]);
	});

	it("a single item occupies the full area", () => {
		const data = [{ name: "ts", count: 10, percentage: 100 }];
		const result = computeTreemapLayout(data, 400, 160);
		expect(result).toHaveLength(1);
		expect(result[0]!.x).toBe(0);
		expect(result[0]!.y).toBe(0);
		expect(result[0]!.width).toBe(400);
		expect(result[0]!.height).toBe(160);
		expect(result[0]!.name).toBe("ts");
		expect(result[0]!.colorIndex).toBe(0);
	});

	it("splits multiple items proportionally by area", () => {
		const data = [
			{ name: "ts", count: 50, percentage: 50 },
			{ name: "react", count: 50, percentage: 50 },
		];
		const result = computeTreemapLayout(data, 400, 160);
		expect(result).toHaveLength(2);
		// total area should equal original area
		const totalArea = result.reduce((s, r) => s + r.width * r.height, 0);
		expect(totalArea).toBeCloseTo(400 * 160, 0);
	});

	it("groups items exceeding maxSegments into Others", () => {
		const data = Array.from({ length: 10 }, (_, i) => ({
			name: `cat${i}`,
			count: 10 - i,
			percentage: 10,
		}));
		const result = computeTreemapLayout(data, 400, 160, 7);
		// 7 + 1(Others) = 8
		expect(result).toHaveLength(8);
		expect(result[result.length - 1]!.name).toBe("Others");
	});

	it("returns an empty array when width or height is 0", () => {
		const data = [{ name: "ts", count: 10, percentage: 100 }];
		expect(computeTreemapLayout(data, 0, 160)).toEqual([]);
		expect(computeTreemapLayout(data, 400, 0)).toEqual([]);
	});

	it("colorIndex is assigned in order for each rect", () => {
		const data = [
			{ name: "a", count: 30, percentage: 50 },
			{ name: "b", count: 20, percentage: 33 },
			{ name: "c", count: 10, percentage: 17 },
		];
		const result = computeTreemapLayout(data, 400, 160);
		const indices = result.map((r) => r.colorIndex).sort((a, b) => a - b);
		expect(indices).toEqual([0, 1, 2]);
	});

	it("all rects are within bounds", () => {
		const data = [
			{ name: "a", count: 25, percentage: 25 },
			{ name: "b", count: 23, percentage: 23 },
			{ name: "c", count: 22, percentage: 22 },
			{ name: "d", count: 15, percentage: 15 },
			{ name: "e", count: 15, percentage: 15 },
		];
		const W = 400;
		const H = 160;
		const result = computeTreemapLayout(data, W, H);
		for (const r of result) {
			expect(r.x).toBeGreaterThanOrEqual(0);
			expect(r.y).toBeGreaterThanOrEqual(0);
			expect(r.x + r.width).toBeLessThanOrEqual(W + 0.01);
			expect(r.y + r.height).toBeLessThanOrEqual(H + 0.01);
			expect(r.width).toBeGreaterThan(0);
			expect(r.height).toBeGreaterThan(0);
		}
	});
});

describe("computeEnhancedStats", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns default values from empty data", () => {
		const result = computeEnhancedStats([], "til", [], now);
		expect(result.summary.totalTils).toBe(0);
		expect(result.summary.categoryCount).toBe(0);
		expect(result.summary.thisWeekCount).toBe(0);
		expect(result.summary.streak).toBe(0);
		expect(result.heatmap.cells).toHaveLength(365);
		expect(result.categories).toEqual([]);
		expect(result.backlog.totalItems).toBe(0);
		expect(result.weeklyTrend).toHaveLength(16);
		expect(result.categoryDistribution).toEqual([]);
	});

	it("combines all sections correctly", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now - 1 * DAY_MS },
			{ path: "til/react/c.md", mtime: now - 2 * DAY_MS },
		]);
		const backlog: BacklogProgressEntry[] = [
			{ category: "ts", filePath: "til/ts/backlog.md", done: 5, total: 10 },
		];
		const result = computeEnhancedStats(files, "til", backlog, now);

		expect(result.summary.totalTils).toBe(3);
		expect(result.summary.categoryCount).toBe(2);
		expect(result.summary.thisWeekCount).toBe(3);
		expect(result.summary.streak).toBe(3);
		expect(result.categories).toHaveLength(2);
		expect(result.backlog.totalDone).toBe(5);
		expect(result.backlog.totalItems).toBe(10);
		expect(result.weeklyTrend).toHaveLength(16);
		expect(result.categoryDistribution).toHaveLength(2);
	});
});

describe("formatDashboardText", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("all sections are included in text output", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
		]);
		const backlog: BacklogProgressEntry[] = [
			{ category: "ts", filePath: "til/ts/backlog.md", done: 5, total: 10 },
		];
		const stats = computeEnhancedStats(files, "til", backlog, now);
		const text = formatDashboardText(stats);

		expect(text).toContain("Learning Dashboard");
		expect(text).toContain("Total TILs");
		expect(text).toContain("Categories");
		expect(text).toContain("This week");
		expect(text).toContain("Streak");
		expect(text).toContain("Activity Trend");
		expect(text).toContain("Categories");
		expect(text).toContain("Backlog Progress");
	});

	it("displays the basic summary even with empty data", () => {
		const stats = computeEnhancedStats([], "til", [], now);
		const text = formatDashboardText(stats);

		expect(text).toContain("Total TILs | 0");
		expect(text).toContain("Streak | 0");
		// no backlog section when backlog is empty
		expect(text).not.toContain("Backlog Progress");
	});
});

describe("selectRecentTils", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns empty result from an empty array", () => {
		expect(selectRecentTils([], "til", 5)).toEqual([]);
	});

	it("returns the most recent N items in reverse frontmatter date order", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/old.md", mtime: now, createdDate: "2026-02-10" },
			{ path: "til/ts/mid.md", mtime: now, createdDate: "2026-02-15" },
			{ path: "til/ts/new.md", mtime: now, createdDate: "2026-02-21" },
		]);
		const result = selectRecentTils(files, "til", 2);
		expect(result).toHaveLength(2);
		expect(result[0]!.path).toBe("til/ts/new.md");
		expect(result[1]!.path).toBe("til/ts/mid.md");
	});

	it("returns all files when there are fewer than count", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
		]);
		const result = selectRecentTils(files, "til", 5);
		expect(result).toHaveLength(1);
	});

	it("excludes backlog.md", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/backlog.md", mtime: now },
		]);
		const result = selectRecentTils(files, "til", 5);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("til/ts/a.md");
	});

	it("excludes files tagged moc", () => {
		const files: EnhancedStatsFileEntry[] = [
			{ path: "til/ts/a.md", extension: "md", mtime: now, ctime: now, tags: ["til"] },
			{ path: "til/TIL MOC.md", extension: "md", mtime: now, ctime: now, tags: ["moc", "til"] },
		];
		const result = selectRecentTils(files, "til", 5);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("til/ts/a.md");
	});

	it("ignores files outside tilPath", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "notes/random.md", mtime: now },
		]);
		const result = selectRecentTils(files, "til", 5);
		expect(result).toHaveLength(1);
	});

	it("sorts files on the same day correctly using datetime format", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/morning.md", mtime: now, createdDate: "2026-02-21T09:00:00" },
			{ path: "til/ts/evening.md", mtime: now, createdDate: "2026-02-21T18:30:00" },
			{ path: "til/ts/afternoon.md", mtime: now, createdDate: "2026-02-21T14:00:00" },
		]);
		const result = selectRecentTils(files, "til", 3);
		expect(result[0]!.path).toBe("til/ts/evening.md");
		expect(result[1]!.path).toBe("til/ts/afternoon.md");
		expect(result[2]!.path).toBe("til/ts/morning.md");
	});

	it("sorts correctly when date-only and datetime formats are mixed", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/old.md", mtime: now, createdDate: "2026-02-20" },
			{ path: "til/ts/new-time.md", mtime: now, createdDate: "2026-02-21T14:00:00" },
			{ path: "til/ts/new-date.md", mtime: now, createdDate: "2026-02-21" },
		]);
		const result = selectRecentTils(files, "til", 3);
		// datetime sorts after date-only (T > empty string), so datetime comes first
		expect(result[0]!.path).toBe("til/ts/new-time.md");
		expect(result[1]!.path).toBe("til/ts/new-date.md");
		expect(result[2]!.path).toBe("til/ts/old.md");
	});
});

describe("extractDateOnly", () => {
	it("returns YYYY-MM-DD as-is", () => {
		expect(extractDateOnly("2026-02-21")).toBe("2026-02-21");
	});

	it("extracts date only from YYYY-MM-DDTHH:mm:ss", () => {
		expect(extractDateOnly("2026-02-21T14:30:00")).toBe("2026-02-21");
	});
});

describe("pickRandomReviewItems", () => {
	const now = new Date("2026-02-21T12:00:00Z").getTime();

	it("returns empty result from empty data", () => {
		const result = pickRandomReviewItems([], "til", [], () => 0);
		expect(result.til).toBeUndefined();
		expect(result.backlog).toBeUndefined();
	});

	it("randomly selects 1 item from TIL files", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/ts/b.md", mtime: now },
			{ path: "til/react/c.md", mtime: now },
		]);
		// when randomFn returns 0.0, the first item is selected
		const result = pickRandomReviewItems(files, "til", [], () => 0);
		expect(result.til).toBeDefined();
		expect(result.til!.path).toBe("til/ts/a.md");
		expect(result.til!.filename).toBe("a.md");
		expect(result.til!.category).toBe("ts");
	});

	it("selects a different item based on the randomFn value", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
			{ path: "til/react/b.md", mtime: now },
		]);
		// 0.99 → index 1
		const result = pickRandomReviewItems(files, "til", [], () => 0.99);
		expect(result.til!.path).toBe("til/react/b.md");
		expect(result.til!.category).toBe("react");
	});

	it("randomly selects 1 item from incomplete backlog items", () => {
		const backlogItems = [
			{ displayName: "Generics", path: "til/ts/generics.md", category: "ts" },
			{ displayName: "Hooks", path: "til/react/hooks.md", category: "react" },
		];
		const result = pickRandomReviewItems([], "til", backlogItems, () => 0.5);
		expect(result.backlog).toBeDefined();
		expect(result.backlog!.displayName).toBe("Hooks");
		expect(result.backlog!.category).toBe("react");
	});

	it("selects both TIL and backlog simultaneously", () => {
		const files = makeEnhancedFiles([
			{ path: "til/ts/a.md", mtime: now },
		]);
		const backlogItems = [
			{ displayName: "Hooks", path: "til/react/hooks.md", category: "react" },
		];
		const result = pickRandomReviewItems(files, "til", backlogItems, () => 0);
		expect(result.til).toBeDefined();
		expect(result.backlog).toBeDefined();
	});

	it("excludes backlog.md and moc-tagged files from TIL selection", () => {
		const files: EnhancedStatsFileEntry[] = [
			{ path: "til/ts/backlog.md", extension: "md", mtime: now, ctime: now, tags: ["til"] },
			{ path: "til/ts/moc.md", extension: "md", mtime: now, ctime: now, tags: ["moc", "til"] },
			{ path: "til/ts/real.md", extension: "md", mtime: now, ctime: now, tags: ["til"] },
		];
		const result = pickRandomReviewItems(files, "til", [], () => 0);
		expect(result.til!.path).toBe("til/ts/real.md");
	});

	it("ignores files outside tilPath", () => {
		const files = makeEnhancedFiles([
			{ path: "notes/random.md", mtime: now },
		]);
		const result = pickRandomReviewItems(files, "til", [], () => 0);
		expect(result.til).toBeUndefined();
	});
});

describe("extractSummary", () => {
	it("extracts the first paragraph after frontmatter", () => {
		const content = `---
date: 2026-02-21
---

# TypeScript Generics

제네릭은 타입을 매개변수화하는 기법이다.

더 자세한 내용은 아래를 참고.`;
		const result = extractSummary(content);
		expect(result).toBe("제네릭은 타입을 매개변수화하는 기법이다.");
	});

	it("works even without frontmatter", () => {
		const content = `# React Hooks

Hooks를 사용하면 함수형 컴포넌트에서 상태를 관리할 수 있다.`;
		const result = extractSummary(content);
		expect(result).toBe("Hooks를 사용하면 함수형 컴포넌트에서 상태를 관리할 수 있다.");
	});

	it("truncates when maxLength is exceeded", () => {
		const content = "이것은 매우 긴 문장입니다. ".repeat(10);
		const result = extractSummary(content, 30);
		expect(result.length).toBe(30);
		expect(result.endsWith("\u2026")).toBe(true);
	});

	it("skips code block content", () => {
		const content = `---
date: 2026-02-21
---

# Example

\`\`\`typescript
const x = 1;
\`\`\`

실제 본문 텍스트입니다.`;
		const result = extractSummary(content);
		expect(result).toBe("실제 본문 텍스트입니다.");
	});

	it("returns an empty string from empty content", () => {
		expect(extractSummary("")).toBe("");
		expect(extractSummary("---\ndate: 2026-02-21\n---")).toBe("");
	});

	it("combines a multi-line paragraph into one", () => {
		const content = `---
date: 2026-02-21
---

# Title

첫 번째 줄입니다.
두 번째 줄입니다.

다음 문단은 무시.`;
		const result = extractSummary(content);
		expect(result).toBe("첫 번째 줄입니다. 두 번째 줄입니다.");
	});

	it("skips ~~~ code blocks", () => {
		const content = `# Example

~~~python
print("hello")
~~~

실제 본문입니다.`;
		const result = extractSummary(content);
		expect(result).toBe("실제 본문입니다.");
	});

	it("skips the callout start line (> [!type] title) entirely", () => {
		const content = `# Title

> [!tldr] 한줄 요약
> 실제 내용입니다.`;
		const result = extractSummary(content);
		expect(result).toBe("실제 내용입니다.");
	});

	it("returns an empty string when there is only a callout and no body", () => {
		const content = `# Title

> [!tldr] 한줄 요약`;
		const result = extractSummary(content);
		expect(result).toBe("");
	});

	it("removes the blockquote (>) prefix", () => {
		const content = `# Title

> 인용문 내용입니다.`;
		const result = extractSummary(content);
		expect(result).toBe("인용문 내용입니다.");
	});

	it("skips empty blockquote lines", () => {
		const content = `# Title

>
> 실제 내용입니다.`;
		const result = extractSummary(content);
		expect(result).toBe("실제 내용입니다.");
	});
});
