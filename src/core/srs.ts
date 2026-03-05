import { extractCategory } from "./context";

// --- Types ---

export interface SrsMetadata {
	next_review: string;    // YYYY-MM-DD
	interval: number;       // days until next review
	ease_factor: number;    // SM-2 ease factor (minimum 1.3, default 2.5)
	repetitions: number;    // consecutive correct answer count
	last_review: string;    // YYYY-MM-DD
}

export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewCard {
	path: string;
	category: string;
	title: string;
	dueDate: string;
	overdueDays: number;
	interval: number;
	repetitions: number;
	ease_factor: number;
}

export interface ReviewStats {
	dueToday: number;
	overdueCount: number;
	totalReviewed: number;
	totalScheduled: number;
	averageEase: number;
	reviewStreak: number;
}

export interface SrsFileEntry {
	path: string;
	extension: string;
	title: string;
	frontmatter: Record<string, unknown>;
}

// --- Utilities (date utils shared with stats.ts; designed around local timezone) ---

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ts: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Converts a YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss string to a timestamp */
function parseDateStr(dateStr: string): number {
	if (dateStr.includes("T")) {
		return new Date(dateStr).getTime();
	}
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y!, m! - 1, d!).getTime();
}

// --- Core functions ---

/**
 * Creates default SRS metadata for a new card.
 * interval=1, ease=2.5, next_review=tomorrow.
 */
export function createDefaultSrsMetadata(now?: number): SrsMetadata {
	const currentTime = now ?? Date.now();
	const today = formatDate(currentTime);
	const tomorrow = formatDate(currentTime + DAY_MS);
	return {
		next_review: tomorrow,
		interval: 1,
		ease_factor: 2.5,
		repetitions: 0,
		last_review: today,
	};
}

/**
 * Runs the SM-2 algorithm to compute the next review schedule.
 */
export function computeNextReview(current: SrsMetadata, grade: ReviewGrade, now?: number): SrsMetadata {
	const currentTime = now ?? Date.now();
	const today = formatDate(currentTime);

	let { interval, ease_factor, repetitions } = current;

	if (grade < 3) {
		// Failure: reset
		repetitions = 0;
		interval = 1;
	} else {
		// Success
		if (repetitions === 0) {
			interval = 1;
		} else if (repetitions === 1) {
			interval = 6;
		} else {
			interval = Math.round(interval * ease_factor);
		}
		repetitions += 1;
	}

	// Update ease factor
	ease_factor += 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
	ease_factor = Math.max(ease_factor, 1.3);

	const next_review = formatDate(currentTime + interval * DAY_MS);

	return {
		next_review,
		interval,
		ease_factor: Math.round(ease_factor * 100) / 100,
		repetitions,
		last_review: today,
	};
}

/**
 * Determines whether the card is due for review today.
 */
export function isDueForReview(nextReview: string, now?: number): boolean {
	const currentTime = now ?? Date.now();
	const todayStart = startOfDay(currentTime);
	const dueStart = startOfDay(parseDateStr(nextReview));
	return dueStart <= todayStart;
}

/**
 * Computes the number of overdue days. Positive=overdue, 0=today, negative=future.
 */
export function computeOverdueDays(nextReview: string, now?: number): number {
	const currentTime = now ?? Date.now();
	const todayStart = startOfDay(currentTime);
	const dueStart = startOfDay(parseDateStr(nextReview));
	return Math.round((todayStart - dueStart) / DAY_MS);
}

/**
 * Parses SRS fields from frontmatter.
 * All 5 fields must be present to return a valid SrsMetadata.
 */
export function parseSrsMetadata(frontmatter: Record<string, unknown>): SrsMetadata | null {
	const nextReview = frontmatter.next_review;
	const interval = frontmatter.interval;
	const easeFactor = frontmatter.ease_factor;
	const repetitions = frontmatter.repetitions;
	const lastReview = frontmatter.last_review;

	if (
		typeof nextReview !== "string" ||
		typeof interval !== "number" ||
		typeof easeFactor !== "number" ||
		typeof repetitions !== "number" ||
		typeof lastReview !== "string"
	) {
		return null;
	}

	return {
		next_review: nextReview,
		interval,
		ease_factor: easeFactor,
		repetitions,
		last_review: lastReview,
	};
}

/**
 * Updates/inserts SRS fields in the frontmatter of file content.
 */
export function updateFrontmatterSrs(fileContent: string, srs: SrsMetadata): string {
	const srsFields = [
		`next_review: "${srs.next_review}"`,
		`interval: ${srs.interval}`,
		`ease_factor: ${srs.ease_factor}`,
		`repetitions: ${srs.repetitions}`,
		`last_review: "${srs.last_review}"`,
	];

	const SRS_KEYS = ["next_review", "interval", "ease_factor", "repetitions", "last_review"];

	if (!fileContent.startsWith("---")) {
		// No frontmatter → create new one
		return `---\n${srsFields.join("\n")}\n---\n${fileContent}`;
	}

	const endIdx = fileContent.indexOf("---", 3);
	if (endIdx === -1) {
		return fileContent;
	}

	const fmContent = fileContent.slice(4, endIdx);
	const afterFm = fileContent.slice(endIdx + 3);

	// Remove existing SRS fields
	const existingLines = fmContent.split("\n").filter((line) => {
		const key = line.split(":")[0]?.trim();
		return !SRS_KEYS.includes(key ?? "");
	});

	// Clean blank lines then append SRS fields
	const cleanedLines = existingLines.filter((l) => l.trim() !== "");
	const newFmLines = [...cleanedLines, ...srsFields];
	return `---\n${newFmLines.join("\n")}\n---${afterFm}`;
}

/**
 * Removes the 5 SRS fields from frontmatter. TIL content is preserved.
 */
export function removeFrontmatterSrs(fileContent: string): string {
	const SRS_KEYS = ["next_review", "interval", "ease_factor", "repetitions", "last_review"];

	if (!fileContent.startsWith("---")) {
		return fileContent;
	}

	const endIdx = fileContent.indexOf("---", 3);
	if (endIdx === -1) {
		return fileContent;
	}

	const fmContent = fileContent.slice(4, endIdx);
	const afterFm = fileContent.slice(endIdx + 3);

	const filteredLines = fmContent.split("\n").filter((line) => {
		const key = line.split(":")[0]?.trim();
		return !SRS_KEYS.includes(key ?? "");
	});

	const cleanedLines = filteredLines.filter((l) => l.trim() !== "");
	if (cleanedLines.length === 0) {
		// frontmatter becomes empty
		return afterFm.replace(/^\n/, "");
	}
	return `---\n${cleanedLines.join("\n")}\n---${afterFm}`;
}

/**
 * Filters, sorts, and caps review-due cards.
 * Sorted by overdue days descending (most urgent first).
 */
export function filterDueCards(
	files: SrsFileEntry[],
	tilPath: string,
	now?: number,
	limit = 20,
): ReviewCard[] {
	const currentTime = now ?? Date.now();
	const cards: ReviewCard[] = [];

	for (const file of files) {
		if (!file.path.startsWith(tilPath + "/")) continue;
		if (file.extension !== "md") continue;
		if (file.path.split("/").pop() === "backlog.md") continue;

		const srs = parseSrsMetadata(file.frontmatter);
		if (!srs) continue;
		if (!isDueForReview(srs.next_review, currentTime)) continue;

		cards.push({
			path: file.path,
			category: extractCategory(file.path, tilPath),
			title: file.title,
			dueDate: srs.next_review,
			overdueDays: computeOverdueDays(srs.next_review, currentTime),
			interval: srs.interval,
			repetitions: srs.repetitions,
			ease_factor: srs.ease_factor,
		});
	}

	// Sort by overdue days descending (most urgent first)
	cards.sort((a, b) => b.overdueDays - a.overdueDays);
	return cards.slice(0, limit);
}

/**
 * Aggregates review statistics.
 */
export function computeReviewStats(
	files: SrsFileEntry[],
	tilPath: string,
	now?: number,
): ReviewStats {
	const currentTime = now ?? Date.now();
	const today = formatDate(currentTime);
	let dueToday = 0;
	let overdueCount = 0;
	let totalScheduled = 0;
	let totalReviewed = 0;
	let easeSum = 0;

	for (const file of files) {
		if (!file.path.startsWith(tilPath + "/")) continue;
		if (file.extension !== "md") continue;
		if (file.path.split("/").pop() === "backlog.md") continue;

		const srs = parseSrsMetadata(file.frontmatter);
		if (!srs) continue;

		totalScheduled++;
		easeSum += srs.ease_factor;

		if (srs.last_review === today) {
			totalReviewed++;
		}

		const overdue = computeOverdueDays(srs.next_review, currentTime);
		if (overdue > 0) {
			overdueCount++;
			dueToday++;
		} else if (overdue === 0) {
			dueToday++;
		}
	}

	return {
		dueToday,
		overdueCount,
		totalReviewed,
		totalScheduled,
		averageEase: totalScheduled > 0 ? Math.round((easeSum / totalScheduled) * 100) / 100 : 0,
		reviewStreak: computeReviewStreak(files, tilPath, currentTime),
	};
}

/**
 * Computes the consecutive review streak.
 * Checks whether a review was done every day based on the last_review field.
 */
export function computeReviewStreak(
	files: SrsFileEntry[],
	tilPath: string,
	now?: number,
): number {
	const currentTime = now ?? Date.now();

	// Build a set of dates that had reviews
	const reviewDays = new Set<string>();
	for (const file of files) {
		if (!file.path.startsWith(tilPath + "/")) continue;
		if (file.extension !== "md") continue;
		if (file.path.split("/").pop() === "backlog.md") continue;

		const srs = parseSrsMetadata(file.frontmatter);
		if (!srs) continue;
		reviewDays.add(srs.last_review);
	}

	if (reviewDays.size === 0) return 0;

	const todayStart = startOfDay(currentTime);
	const cursor = new Date(todayStart);
	let streak = 0;

	for (let i = 0; i < 365; i++) {
		const dayStr = formatDate(cursor.getTime());
		if (reviewDays.has(dayStr)) {
			streak++;
		} else {
			// Maintain streak even if today's review isn't done yet, as long as consecutive through yesterday (grace period)
			if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
			break;
		}
		cursor.setDate(cursor.getDate() - 1);
	}

	return streak;
}

/**
 * Converts a two-level rating to an SM-2 grade.
 * Remembered=4, Forgot=1.
 */
export function simpleGradeToSm2(remembered: boolean): ReviewGrade {
	return remembered ? 4 : 1;
}

// --- Formatting ---

/**
 * Formats the review card list as text.
 */
export function formatReviewList(cards: ReviewCard[]): string {
	if (cards.length === 0) return "No cards to review.";

	const lines: string[] = [];
	lines.push(`## Cards Due for Review (${cards.length})\n`);
	lines.push(`| # | Title | Category | Overdue | Repetitions | EF |`);
	lines.push(`|---|------|---------|------|------|-----|`);

	for (let i = 0; i < cards.length; i++) {
		const c = cards[i]!;
		const overdueStr = c.overdueDays > 0 ? `+${c.overdueDays}d` : c.overdueDays === 0 ? "today" : `${c.overdueDays}d`;
		lines.push(`| ${i + 1} | ${c.title} | ${c.category} | ${overdueStr} | ${c.repetitions} | ${c.ease_factor} |`);
	}

	return lines.join("\n");
}

/**
 * Formats review statistics as text.
 */
export function formatReviewStats(stats: ReviewStats): string {
	const lines: string[] = [];
	lines.push(`## Review Statistics\n`);
	lines.push(`| Metric | Value |`);
	lines.push(`|------|-----|`);
	lines.push(`| Due today | ${stats.dueToday} |`);
	lines.push(`| Overdue | ${stats.overdueCount} |`);
	lines.push(`| Reviewed today | ${stats.totalReviewed} |`);
	lines.push(`| Total scheduled | ${stats.totalScheduled} |`);
	lines.push(`| Average EF | ${stats.averageEase} |`);
	lines.push(`| Review streak | ${stats.reviewStreak}d |`);
	return lines.join("\n");
}
