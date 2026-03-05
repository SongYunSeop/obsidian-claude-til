import { extractCategory } from "./context";
import { formatProgressBar } from "./backlog";

// --- Existing types (backward compatible) ---

export interface TILStats {
	totalTils: number;
	categories: { name: string; count: number }[];
}

export interface StatsFileEntry {
	path: string;
	extension: string;
}

// --- New types ---

export interface EnhancedStatsFileEntry {
	path: string;
	extension: string;
	mtime: number;
	ctime: number;
	/** frontmatter date (YYYY-MM-DD). Auto-generated from ctime if absent. */
	createdDate?: string;
	/** frontmatter tags. Used for filtering special files like MOC. */
	tags?: string[];
}

export interface SummaryCards {
	totalTils: number;
	categoryCount: number;
	thisWeekCount: number;
	streak: number;
	reviewDueCount?: number;
}

export interface HeatmapCell {
	date: string; // YYYY-MM-DD
	count: number;
	level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapData {
	cells: HeatmapCell[];
	maxCount: number;
}

export interface EnhancedCategoryFile {
	path: string;
	filename: string;
	mtime: number;
}

export interface EnhancedCategory {
	name: string;
	count: number;
	files: EnhancedCategoryFile[];
}

export interface BacklogProgressEntry {
	category: string;
	filePath: string;
	done: number;
	total: number;
}

export interface DashboardBacklogProgress {
	categories: BacklogProgressEntry[];
	totalDone: number;
	totalItems: number;
}

export interface WeeklyTrendEntry {
	weekStart: string; // MM/DD
	count: number;
}

export interface CategoryDistribution {
	name: string;
	count: number;
	percentage: number;
}

export interface TreemapRect {
	x: number;
	y: number;
	width: number;
	height: number;
	name: string;
	count: number;
	percentage: number;
	colorIndex: number;
}

export interface EnhancedTILStats {
	summary: SummaryCards;
	heatmap: HeatmapData;
	categories: EnhancedCategory[];
	backlog: DashboardBacklogProgress;
	weeklyTrend: WeeklyTrendEntry[];
	categoryDistribution: CategoryDistribution[];
}

// --- Existing functions (backward compatible) ---

/**
 * Computes TIL statistics.
 * Collects .md files under tilPath/ and classifies categories by folder name.
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

// --- New functions ---

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filters only .md files under tilPath (tags:til required, excludes backlog.md and tags:moc) */
function filterTilFiles(files: EnhancedStatsFileEntry[], tilPath: string): EnhancedStatsFileEntry[] {
	return files.filter((f) => {
		if (!f.path.startsWith(tilPath + "/")) return false;
		if (f.extension !== "md") return false;
		if (f.path.split("/").pop() === "backlog.md") return false;
		if (!f.tags?.includes("til")) return false;
		if (f.tags.includes("moc")) return false;
		return true;
	});
}

/** Formats a date as YYYY-MM-DD */
function formatDate(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Returns the file's creation date. frontmatter date takes priority, falls back to ctime. */
function getCreatedDate(f: EnhancedStatsFileEntry): string {
	return f.createdDate ?? formatDate(f.ctime);
}

/** Extracts only the date part (YYYY-MM-DD) from a datetime string. Returns as-is if already YYYY-MM-DD. */
export function extractDateOnly(dateStr: string): string {
	return dateStr.slice(0, 10);
}

/** Converts a YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss string to a timestamp */
function parseDateStr(dateStr: string): number {
	// If it's a datetime containing T, pass directly to the Date constructor
	if (dateStr.includes("T")) {
		return new Date(dateStr).getTime();
	}
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y!, m! - 1, d!).getTime();
}

/** Returns the 00:00:00 timestamp for a date string */
function startOfDay(ts: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Computes the consecutive activity streak based on ctime (creation date).
 * Returns the number of days TILs were written consecutively, counting back from today.
 * Uses ctime rather than mtime to prevent contamination from sync/indexing.
 */
export function computeStreak(files: EnhancedStatsFileEntry[], tilPath: string, now?: number, _prefilteredFiles?: EnhancedStatsFileEntry[]): number {
	const currentTime = now ?? Date.now();
	const tilFiles = _prefilteredFiles ?? filterTilFiles(files, tilPath);

	if (tilFiles.length === 0) return 0;

	// Build a set of dates that had activity (extract date only from datetime)
	const activeDays = new Set<string>();
	for (const f of tilFiles) {
		activeDays.add(extractDateOnly(getCreatedDate(f)));
	}

	// Count back from today
	let streak = 0;
	const todayStart = startOfDay(currentTime);

	const cursor = new Date(todayStart);
	for (let i = 0; i < 365; i++) {
		const dayStr = formatDate(cursor.getTime());
		if (activeDays.has(dayStr)) {
			streak++;
		} else {
			// If no activity today, maintain streak if consecutive from yesterday
			if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
			break;
		}
		cursor.setDate(cursor.getDate() - 1);
	}

	return streak;
}

/**
 * Counts the number of TIL files written in the last 7 days (based on frontmatter date).
 */
export function computeWeeklyCount(files: EnhancedStatsFileEntry[], tilPath: string, now?: number, _prefilteredFiles?: EnhancedStatsFileEntry[]): number {
	const currentTime = now ?? Date.now();
	const cutoff = startOfDay(currentTime) - 6 * DAY_MS; // 7 days including today
	const tilFiles = _prefilteredFiles ?? filterTilFiles(files, tilPath);
	return tilFiles.filter((f) => parseDateStr(getCreatedDate(f)) >= cutoff).length;
}

/**
 * Generates activity heatmap data for the past 365 days (based on ctime).
 * Levels 0-4 are distributed relative to maxCount.
 */
export function computeHeatmapData(files: EnhancedStatsFileEntry[], tilPath: string, now?: number, _prefilteredFiles?: EnhancedStatsFileEntry[]): HeatmapData {
	const currentTime = now ?? Date.now();
	const tilFiles = _prefilteredFiles ?? filterTilFiles(files, tilPath);
	const todayStart = startOfDay(currentTime);

	// Per-day count for 365 days (extract date only from datetime)
	const countMap = new Map<string, number>();
	for (const f of tilFiles) {
		const dayStr = extractDateOnly(getCreatedDate(f));
		countMap.set(dayStr, (countMap.get(dayStr) ?? 0) + 1);
	}

	const cells: HeatmapCell[] = [];
	let maxCount = 0;

	// From 364 days ago to today (365 days)
	for (let i = 364; i >= 0; i--) {
		const dayTs = todayStart - i * DAY_MS;
		const date = formatDate(dayTs);
		const count = countMap.get(date) ?? 0;
		if (count > maxCount) maxCount = count;
		cells.push({ date, count, level: 0 }); // level is recalculated below
	}

	// Assign level (0: none, 1-4: quartiles)
	for (const cell of cells) {
		cell.level = computeLevel(cell.count, maxCount);
	}

	return { cells, maxCount };
}

/** Converts count to level 0-4 */
function computeLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
	if (count === 0) return 0;
	if (maxCount === 0) return 0;
	const ratio = count / maxCount;
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.5) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

/**
 * Returns categorization including the file list per category.
 */
export function computeEnhancedCategories(files: EnhancedStatsFileEntry[], tilPath: string, _prefilteredFiles?: EnhancedStatsFileEntry[]): EnhancedCategory[] {
	const tilFiles = _prefilteredFiles ?? filterTilFiles(files, tilPath);
	const categoryMap = new Map<string, EnhancedCategoryFile[]>();

	for (const f of tilFiles) {
		const cat = extractCategory(f.path, tilPath);
		if (!categoryMap.has(cat)) categoryMap.set(cat, []);
		const filename = f.path.split("/").pop() ?? f.path;
		categoryMap.get(cat)!.push({ path: f.path, filename, mtime: f.mtime });
	}

	// Files within a category sorted by mtime descending
	return Array.from(categoryMap.entries())
		.map(([name, catFiles]) => ({
			name,
			count: catFiles.length,
			files: catFiles.sort((a, b) => b.mtime - a.mtime),
		}))
		.sort((a, b) => b.count - a.count);
}

/**
 * Selects the most recent N TIL files based on frontmatter date.
 */
export function selectRecentTils(files: EnhancedStatsFileEntry[], tilPath: string, count: number): EnhancedStatsFileEntry[] {
	const tilFiles = filterTilFiles(files, tilPath);
	return [...tilFiles]
		.sort((a, b) => {
			const dateA = getCreatedDate(a);
			const dateB = getCreatedDate(b);
			const cmp = dateB.localeCompare(dateA);
			if (cmp !== 0) return cmp;
			// Same date: sort by ctime descending (newest first)
			return b.ctime - a.ctime;
		})
		.slice(0, count);
}

/**
 * Extracts the first paragraph after frontmatter from markdown file content as a summary.
 * Skips headings (#), blank lines, code blocks, etc. and retrieves only body text.
 */
export function extractSummary(content: string, maxLength = 120): string {
	// Strip frontmatter
	let body = content;
	if (body.startsWith("---")) {
		const endIdx = body.indexOf("---", 3);
		if (endIdx !== -1) {
			body = body.slice(endIdx + 3);
		}
	}

	const lines = body.split("\n");
	const paragraphLines: string[] = [];
	let inCodeBlock = false;

	for (const line of lines) {
		if (line.startsWith("```") || line.startsWith("~~~")) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		const trimmed = line.trim();
		// Skip headings, blank lines, and dividers
		if (trimmed.startsWith("#") || trimmed === "" || trimmed === "---") {
			if (paragraphLines.length > 0) break; // First paragraph complete
			continue;
		}

		// Handle blockquote / callout
		let cleaned = trimmed;
		if (cleaned.startsWith(">")) {
			cleaned = cleaned.replace(/^>\s*/, "").trim();
			// callout opening line (> [!type] ...) is a title, skip entirely
			if (cleaned.startsWith("[!")) continue;
			if (!cleaned) continue;
		}

		paragraphLines.push(cleaned);
	}

	let text = paragraphLines.join(" ");
	// Markdown links [text](url) → text, images ![alt](url) → alt
	text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
	// Wikilinks [[target|display]] → display, [[target]] → target
	text = text.replace(/\[\[([^|\]]*\|)?([^\]]*)\]\]/g, "$2");
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "\u2026";
}

/**
 * Aggregates backlog progress for the dashboard.
 */
export function computeDashboardBacklog(entries: BacklogProgressEntry[]): DashboardBacklogProgress {
	const totalDone = entries.reduce((sum, e) => sum + e.done, 0);
	const totalItems = entries.reduce((sum, e) => sum + e.total, 0);
	// Sort by progress descending
	const categories = [...entries].sort((a, b) => {
		const pctA = a.total > 0 ? a.done / a.total : 0;
		const pctB = b.total > 0 ? b.done / b.total : 0;
		return pctB - pctA;
	});
	return { categories, totalDone, totalItems };
}

/**
 * Computes the weekly TIL writing trend over the past N weeks.
 */
export function computeWeeklyTrend(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
	weekCount = 16,
	now?: number,
	_prefilteredFiles?: EnhancedStatsFileEntry[],
): WeeklyTrendEntry[] {
	const currentTime = now ?? Date.now();
	const tilFiles = _prefilteredFiles ?? filterTilFiles(files, tilPath);
	const todayStart = startOfDay(currentTime);

	// Find Monday of current week
	const today = new Date(todayStart);
	const dow = today.getDay(); // 0=Sun
	const mondayOffset = dow === 0 ? 6 : dow - 1;
	const thisMonday = todayStart - mondayOffset * DAY_MS;

	// Build week entries (oldest first)
	const entries: WeeklyTrendEntry[] = [];
	for (let i = weekCount - 1; i >= 0; i--) {
		const weekStartTs = thisMonday - i * 7 * DAY_MS;
		const d = new Date(weekStartTs);
		entries.push({
			weekStart: `${String(d.getMonth() + 1)}/${String(d.getDate())}`,
			count: 0,
		});
	}

	// Bucket each file into the appropriate week
	const oldestWeekStart = thisMonday - (weekCount - 1) * 7 * DAY_MS;
	for (const f of tilFiles) {
		const ts = startOfDay(parseDateStr(getCreatedDate(f)));
		if (ts < oldestWeekStart || ts > todayStart) continue;
		const weekIdx = Math.floor((ts - oldestWeekStart) / (7 * DAY_MS));
		if (weekIdx >= 0 && weekIdx < weekCount) {
			entries[weekIdx]!.count++;
		}
	}

	return entries;
}

/**
 * Computes the TIL distribution by category.
 */
export function computeCategoryDistribution(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
	_prefilteredFiles?: EnhancedStatsFileEntry[],
): CategoryDistribution[] {
	const tilFiles = _prefilteredFiles ?? filterTilFiles(files, tilPath);
	const total = tilFiles.length;
	if (total === 0) return [];

	const countMap = new Map<string, number>();
	for (const f of tilFiles) {
		const cat = extractCategory(f.path, tilPath);
		countMap.set(cat, (countMap.get(cat) ?? 0) + 1);
	}

	return Array.from(countMap.entries())
		.map(([name, count]) => ({
			name,
			count,
			percentage: Math.round((count / total) * 100),
		}))
		.sort((a, b) => b.count - a.count);
}

/**
 * Computes treemap layout (recursive bisection approach).
 * data must be a CategoryDistribution array sorted by count descending.
 */
export function computeTreemapLayout(
	data: CategoryDistribution[],
	width: number,
	height: number,
	maxSegments = 7,
): TreemapRect[] {
	if (data.length === 0 || width <= 0 || height <= 0) return [];

	const total = data.reduce((s, d) => s + d.count, 0);
	if (total === 0) return [];

	let displayData: CategoryDistribution[];
	if (data.length > maxSegments) {
		const top = data.slice(0, maxSegments);
		const rest = data.slice(maxSegments);
		const otherCount = rest.reduce((s, d) => s + d.count, 0);
		displayData = [
			...top,
			{ name: "Others", count: otherCount, percentage: Math.round((otherCount / total) * 100) },
		];
	} else {
		displayData = data;
	}

	const items = displayData.map((d, i) => ({ ...d, colorIndex: i }));
	return treemapBisect(items, 0, 0, width, height);
}

function treemapBisect(
	items: Array<{ name: string; count: number; percentage: number; colorIndex: number }>,
	x: number,
	y: number,
	w: number,
	h: number,
): TreemapRect[] {
	if (items.length === 0) return [];
	if (items.length === 1) {
		return [{ x, y, width: w, height: h, ...items[0]! }];
	}

	const total = items.reduce((s, i) => s + i.count, 0);
	if (total === 0) return [];

	// Find the most balanced split point
	let bestSplit = 1;
	let bestDiff = Infinity;
	let leftSum = 0;
	for (let i = 0; i < items.length - 1; i++) {
		leftSum += items[i]!.count;
		const diff = Math.abs(leftSum - (total - leftSum));
		if (diff < bestDiff) {
			bestDiff = diff;
			bestSplit = i + 1;
		}
	}

	const left = items.slice(0, bestSplit);
	const right = items.slice(bestSplit);
	const leftTotal = left.reduce((s, i) => s + i.count, 0);
	const frac = leftTotal / total;

	if (w >= h) {
		const lw = w * frac;
		return [
			...treemapBisect(left, x, y, lw, h),
			...treemapBisect(right, x + lw, y, w - lw, h),
		];
	} else {
		const lh = h * frac;
		return [
			...treemapBisect(left, x, y, w, lh),
			...treemapBisect(right, x, y + lh, w, h - lh),
		];
	}
}

/**
 * Orchestrator that computes all dashboard statistics in one pass.
 */
export function computeEnhancedStats(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
	backlogEntries: BacklogProgressEntry[],
	now?: number,
	reviewDueCount?: number,
): EnhancedTILStats {
	const tilFiles = filterTilFiles(files, tilPath);
	const categories = computeEnhancedCategories(files, tilPath, tilFiles);

	const summary: SummaryCards = {
		totalTils: tilFiles.length,
		categoryCount: categories.length,
		thisWeekCount: computeWeeklyCount(files, tilPath, now, tilFiles),
		streak: computeStreak(files, tilPath, now, tilFiles),
		...(reviewDueCount !== undefined && reviewDueCount > 0 ? { reviewDueCount } : {}),
	};

	return {
		summary,
		heatmap: computeHeatmapData(files, tilPath, now, tilFiles),
		categories,
		backlog: computeDashboardBacklog(backlogEntries),
		weeklyTrend: computeWeeklyTrend(files, tilPath, 16, now, tilFiles),
		categoryDistribution: computeCategoryDistribution(files, tilPath, tilFiles),
	};
}

export interface RandomReviewPick {
	til?: { path: string; filename: string; category: string };
	backlog?: { displayName: string; path: string; category: string };
}

/**
 * Selects random items for the dashboard "Today's Review" card.
 * Randomly picks 1 completed TIL + 1 incomplete backlog item.
 * Injecting randomFn allows deterministic results in tests.
 */
export function pickRandomReviewItems(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
	incompleteBacklogItems: Array<{ displayName: string; path: string; category: string }>,
	randomFn: () => number = Math.random,
): RandomReviewPick {
	const tilFiles = filterTilFiles(files, tilPath);
	const result: RandomReviewPick = {};

	if (tilFiles.length > 0) {
		const idx = Math.floor(randomFn() * tilFiles.length);
		const picked = tilFiles[idx]!;
		const filename = picked.path.split("/").pop() ?? picked.path;
		const category = extractCategory(picked.path, tilPath);
		result.til = { path: picked.path, filename, category };
	}

	if (incompleteBacklogItems.length > 0) {
		const idx = Math.floor(randomFn() * incompleteBacklogItems.length);
		result.backlog = incompleteBacklogItems[idx]!;
	}

	return result;
}

/**
 * Formatter for MCP text output.
 */
export function formatDashboardText(stats: EnhancedTILStats): string {
	const lines: string[] = [];

	// Summary
	const s = stats.summary;
	lines.push("## Learning Dashboard\n");
	lines.push(`| Metric | Value |`);
	lines.push(`|------|-----|`);
	lines.push(`| Total TILs | ${s.totalTils} |`);
	lines.push(`| Categories | ${s.categoryCount} |`);
	lines.push(`| This week | ${s.thisWeekCount} |`);
	lines.push(`| Streak | ${s.streak} |`);
	if (s.reviewDueCount !== undefined && s.reviewDueCount > 0) {
		lines.push(`| Reviews due | ${s.reviewDueCount} |`);
	}

	// Heatmap sparkline (weekly)
	if (stats.heatmap.cells.length > 0) {
		const sparks = ["▁", "▂", "▃", "▅", "▇"];
		const weeks: number[] = [];
		for (let i = 0; i < stats.heatmap.cells.length; i += 7) {
			const weekCells = stats.heatmap.cells.slice(i, i + 7);
			weeks.push(weekCells.reduce((sum, c) => sum + c.count, 0));
		}
		const maxWeek = Math.max(...weeks, 1);
		const sparkline = weeks.map((w) => {
			const idx = Math.min(Math.floor((w / maxWeek) * 4), 4);
			return sparks[idx];
		}).join("");
		lines.push(`\n### Activity Trend (${stats.heatmap.cells.length} days)\n`);
		lines.push(sparkline);
	}

	// Categories
	if (stats.categories.length > 0) {
		lines.push(`\n### Categories\n`);
		lines.push(`| Category | Count | Last Modified |`);
		lines.push(`|---------|-----|----------|`);
		for (const cat of stats.categories) {
			const latest = cat.files.length > 0 ? formatDate(cat.files[0]!.mtime) : "-";
			lines.push(`| ${cat.name} | ${cat.count} | ${latest} |`);
		}
	}

	// Backlog
	const b = stats.backlog;
	if (b.totalItems > 0) {
		const pct = Math.round((b.totalDone / b.totalItems) * 100);
		lines.push(`\n### Backlog Progress\n`);
		lines.push(`Total: ${b.totalDone}/${b.totalItems} (${pct}%) ${formatProgressBar(b.totalDone, b.totalItems)}\n`);
		lines.push(`| Category | Progress | Done | Bar |`);
		lines.push(`|---------|--------|------|--------|`);
		for (const c of b.categories) {
			const catPct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
			lines.push(`| ${c.category} | ${catPct}% | ${c.done}/${c.total} | ${formatProgressBar(c.done, c.total)} |`);
		}
	}

	return lines.join("\n");
}
