import { extractCategory } from "./context";
import { formatProgressBar } from "./backlog";

// --- 기존 타입 (하위 호환) ---

export interface TILStats {
	totalTils: number;
	categories: { name: string; count: number }[];
}

export interface StatsFileEntry {
	path: string;
	extension: string;
}

// --- 새 타입 ---

export interface EnhancedStatsFileEntry {
	path: string;
	extension: string;
	mtime: number;
	ctime: number;
	/** frontmatter date (YYYY-MM-DD). 없으면 ctime 기반으로 자동 생성. */
	createdDate?: string;
	/** frontmatter tags. MOC 등 특수 파일 필터링용. */
	tags?: string[];
}

export interface SummaryCards {
	totalTils: number;
	categoryCount: number;
	thisWeekCount: number;
	streak: number;
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

// --- 기존 함수 (하위 호환) ---

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

// --- 새 함수 ---

const DAY_MS = 24 * 60 * 60 * 1000;

/** tilPath 하위 .md 파일만 필터링 (tags:til 필수, backlog.md·tags:moc 제외) */
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

/** 날짜를 YYYY-MM-DD로 포맷 */
function formatDate(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 파일의 생성 날짜를 반환. frontmatter date 우선, 없으면 ctime 폴백. */
function getCreatedDate(f: EnhancedStatsFileEntry): string {
	return f.createdDate ?? formatDate(f.ctime);
}

/** datetime 문자열에서 날짜 부분(YYYY-MM-DD)만 추출. 이미 YYYY-MM-DD면 그대로 반환. */
export function extractDateOnly(dateStr: string): string {
	return dateStr.slice(0, 10);
}

/** YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm:ss 문자열을 타임스탬프로 변환 */
function parseDateStr(dateStr: string): number {
	// T가 포함된 datetime이면 Date 생성자에 직접 전달
	if (dateStr.includes("T")) {
		return new Date(dateStr).getTime();
	}
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y!, m! - 1, d!).getTime();
}

/** 날짜 문자열의 00:00:00 타임스탬프를 반환 */
function startOfDay(ts: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * ctime(생성일) 기반 연속 활동일(streak)을 계산한다.
 * 오늘부터 역산하여 연속으로 TIL을 작성한 일수를 반환한다.
 * mtime이 아닌 ctime을 사용하여 동기화/인덱싱에 의한 오염을 방지한다.
 */
export function computeStreak(files: EnhancedStatsFileEntry[], tilPath: string, now?: number): number {
	const currentTime = now ?? Date.now();
	const tilFiles = filterTilFiles(files, tilPath);

	if (tilFiles.length === 0) return 0;

	// 활동이 있었던 날짜 집합 구성 (datetime에서 날짜만 추출)
	const activeDays = new Set<string>();
	for (const f of tilFiles) {
		activeDays.add(extractDateOnly(getCreatedDate(f)));
	}

	// 오늘부터 역산
	let streak = 0;
	const todayStart = startOfDay(currentTime);

	const cursor = new Date(todayStart);
	for (let i = 0; i < 365; i++) {
		const dayStr = formatDate(cursor.getTime());
		if (activeDays.has(dayStr)) {
			streak++;
		} else {
			// 오늘 활동이 없어도 어제부터 연속이면 streak 유지
			if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
			break;
		}
		cursor.setDate(cursor.getDate() - 1);
	}

	return streak;
}

/**
 * 최근 7일간 작성된 TIL 파일 수를 계산한다 (frontmatter date 기준).
 */
export function computeWeeklyCount(files: EnhancedStatsFileEntry[], tilPath: string, now?: number): number {
	const currentTime = now ?? Date.now();
	const cutoff = startOfDay(currentTime) - 6 * DAY_MS; // 오늘 포함 7일
	const tilFiles = filterTilFiles(files, tilPath);
	return tilFiles.filter((f) => parseDateStr(getCreatedDate(f)) >= cutoff).length;
}

/**
 * 365일간의 활동 히트맵 데이터를 생성한다 (ctime 기준).
 * level 0-4는 maxCount 기준으로 분배한다.
 */
export function computeHeatmapData(files: EnhancedStatsFileEntry[], tilPath: string, now?: number): HeatmapData {
	const currentTime = now ?? Date.now();
	const tilFiles = filterTilFiles(files, tilPath);
	const todayStart = startOfDay(currentTime);

	// 365일간의 날짜별 카운트 (datetime에서 날짜만 추출)
	const countMap = new Map<string, number>();
	for (const f of tilFiles) {
		const dayStr = extractDateOnly(getCreatedDate(f));
		countMap.set(dayStr, (countMap.get(dayStr) ?? 0) + 1);
	}

	const cells: HeatmapCell[] = [];
	let maxCount = 0;

	// 364일 전부터 오늘까지 (365일)
	for (let i = 364; i >= 0; i--) {
		const dayTs = todayStart - i * DAY_MS;
		const date = formatDate(dayTs);
		const count = countMap.get(date) ?? 0;
		if (count > maxCount) maxCount = count;
		cells.push({ date, count, level: 0 }); // level은 아래에서 재계산
	}

	// level 할당 (0: 없음, 1-4: 4분위)
	for (const cell of cells) {
		cell.level = computeLevel(cell.count, maxCount);
	}

	return { cells, maxCount };
}

/** count를 level 0-4로 변환 */
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
 * 카테고리별 파일 목록을 포함한 분류를 반환한다.
 */
export function computeEnhancedCategories(files: EnhancedStatsFileEntry[], tilPath: string): EnhancedCategory[] {
	const tilFiles = filterTilFiles(files, tilPath);
	const categoryMap = new Map<string, EnhancedCategoryFile[]>();

	for (const f of tilFiles) {
		const cat = extractCategory(f.path, tilPath);
		if (!categoryMap.has(cat)) categoryMap.set(cat, []);
		const filename = f.path.split("/").pop() ?? f.path;
		categoryMap.get(cat)!.push({ path: f.path, filename, mtime: f.mtime });
	}

	// 카테고리 내 파일은 mtime 역순 정렬
	return Array.from(categoryMap.entries())
		.map(([name, catFiles]) => ({
			name,
			count: catFiles.length,
			files: catFiles.sort((a, b) => b.mtime - a.mtime),
		}))
		.sort((a, b) => b.count - a.count);
}

/**
 * frontmatter date 기준으로 최근 N개의 TIL 파일을 선택한다.
 */
export function selectRecentTils(files: EnhancedStatsFileEntry[], tilPath: string, count: number): EnhancedStatsFileEntry[] {
	const tilFiles = filterTilFiles(files, tilPath);
	return [...tilFiles]
		.sort((a, b) => {
			const dateA = getCreatedDate(a);
			const dateB = getCreatedDate(b);
			const cmp = dateB.localeCompare(dateA);
			if (cmp !== 0) return cmp;
			// 같은 날짜면 ctime 역순 (최신 먼저)
			return b.ctime - a.ctime;
		})
		.slice(0, count);
}

/**
 * 마크다운 파일 내용에서 frontmatter 이후 첫 번째 문단을 요약으로 추출한다.
 * 헤딩(#), 빈 줄, 코드 블록 등을 건너뛰고 본문 텍스트만 가져온다.
 */
export function extractSummary(content: string, maxLength = 120): string {
	// frontmatter 제거
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
		// 헤딩, 빈 줄, 구분선 건너뛰기
		if (trimmed.startsWith("#") || trimmed === "" || trimmed === "---") {
			if (paragraphLines.length > 0) break; // 첫 문단 완료
			continue;
		}

		// blockquote / callout 처리
		let cleaned = trimmed;
		if (cleaned.startsWith(">")) {
			cleaned = cleaned.replace(/^>\s*/, "").trim();
			// callout 시작 줄 (> [!type] ...) 은 제목이므로 전체 스킵
			if (cleaned.startsWith("[!")) continue;
			if (!cleaned) continue;
		}

		paragraphLines.push(cleaned);
	}

	const text = paragraphLines.join(" ");
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "\u2026";
}

/**
 * 백로그 진행률을 대시보드용으로 집계한다.
 */
export function computeDashboardBacklog(entries: BacklogProgressEntry[]): DashboardBacklogProgress {
	const totalDone = entries.reduce((sum, e) => sum + e.done, 0);
	const totalItems = entries.reduce((sum, e) => sum + e.total, 0);
	// 진행률 내림차순 정렬
	const categories = [...entries].sort((a, b) => {
		const pctA = a.total > 0 ? a.done / a.total : 0;
		const pctB = b.total > 0 ? b.done / b.total : 0;
		return pctB - pctA;
	});
	return { categories, totalDone, totalItems };
}

/**
 * 최근 N주간의 주별 TIL 작성 추이를 계산한다.
 */
export function computeWeeklyTrend(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
	weekCount = 16,
	now?: number,
): WeeklyTrendEntry[] {
	const currentTime = now ?? Date.now();
	const tilFiles = filterTilFiles(files, tilPath);
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
 * 카테고리별 TIL 분포를 계산한다.
 */
export function computeCategoryDistribution(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
): CategoryDistribution[] {
	const tilFiles = filterTilFiles(files, tilPath);
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
 * 트리맵 레이아웃을 계산한다 (재귀 이분할 방식).
 * data는 count 내림차순 정렬된 CategoryDistribution 배열이어야 한다.
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

	// 균형 잡힌 분할점 찾기
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
 * 모든 대시보드 통계를 한 번에 계산하는 오케스트레이터.
 */
export function computeEnhancedStats(
	files: EnhancedStatsFileEntry[],
	tilPath: string,
	backlogEntries: BacklogProgressEntry[],
	now?: number,
): EnhancedTILStats {
	const tilFiles = filterTilFiles(files, tilPath);
	const categories = computeEnhancedCategories(files, tilPath);

	const summary: SummaryCards = {
		totalTils: tilFiles.length,
		categoryCount: categories.length,
		thisWeekCount: computeWeeklyCount(files, tilPath, now),
		streak: computeStreak(files, tilPath, now),
	};

	return {
		summary,
		heatmap: computeHeatmapData(files, tilPath, now),
		categories,
		backlog: computeDashboardBacklog(backlogEntries),
		weeklyTrend: computeWeeklyTrend(files, tilPath, 16, now),
		categoryDistribution: computeCategoryDistribution(files, tilPath),
	};
}

export interface RandomReviewPick {
	til?: { path: string; filename: string; category: string };
	backlog?: { displayName: string; path: string; category: string };
}

/**
 * 대시보드 "오늘의 복습" 카드용 랜덤 아이템을 선택한다.
 * 완료된 TIL 1개 + 미완료 백로그 1개를 랜덤으로 뽑는다.
 * randomFn을 주입하면 테스트에서 결정적 결과를 얻을 수 있다.
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
 * MCP 텍스트 출력용 포맷터.
 */
export function formatDashboardText(stats: EnhancedTILStats): string {
	const lines: string[] = [];

	// Summary
	const s = stats.summary;
	lines.push("## 학습 대시보드\n");
	lines.push(`| 지표 | 값 |`);
	lines.push(`|------|-----|`);
	lines.push(`| 총 TIL | ${s.totalTils}개 |`);
	lines.push(`| 카테고리 | ${s.categoryCount}개 |`);
	lines.push(`| 이번 주 | ${s.thisWeekCount}개 |`);
	lines.push(`| 연속 학습 | ${s.streak}일 |`);

	// Heatmap sparkline (주단위)
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
		lines.push(`\n### 활동 추이 (${stats.heatmap.cells.length}일)\n`);
		lines.push(sparkline);
	}

	// Categories
	if (stats.categories.length > 0) {
		lines.push(`\n### 카테고리별 현황\n`);
		lines.push(`| 카테고리 | 수 | 최근 수정 |`);
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
		lines.push(`\n### 백로그 진행률\n`);
		lines.push(`전체: ${b.totalDone}/${b.totalItems} (${pct}%) ${formatProgressBar(b.totalDone, b.totalItems)}\n`);
		lines.push(`| 카테고리 | 진행률 | 완료 | 진행바 |`);
		lines.push(`|---------|--------|------|--------|`);
		for (const c of b.categories) {
			const catPct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
			lines.push(`| ${c.category} | ${catPct}% | ${c.done}/${c.total} | ${formatProgressBar(c.done, c.total)} |`);
		}
	}

	return lines.join("\n");
}
