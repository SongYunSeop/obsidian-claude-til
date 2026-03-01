import { extractCategory } from "./context";

// --- 타입 ---

export interface SrsMetadata {
	next_review: string;    // YYYY-MM-DD
	interval: number;       // 다음 복습까지 일수
	ease_factor: number;    // SM-2 ease factor (최소 1.3, 기본 2.5)
	repetitions: number;    // 연속 정답 횟수
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

// --- 유틸 (stats.ts와 공유하는 날짜 유틸. 로컬 타임존 기반 설계.) ---

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ts: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm:ss 문자열을 타임스탬프로 변환 */
function parseDateStr(dateStr: string): number {
	if (dateStr.includes("T")) {
		return new Date(dateStr).getTime();
	}
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y!, m! - 1, d!).getTime();
}

// --- 핵심 함수 ---

/**
 * 새 카드의 기본 SRS 메타데이터를 생성한다.
 * interval=1, ease=2.5, next_review=내일.
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
 * SM-2 알고리즘을 실행하여 다음 복습 일정을 계산한다.
 */
export function computeNextReview(current: SrsMetadata, grade: ReviewGrade, now?: number): SrsMetadata {
	const currentTime = now ?? Date.now();
	const today = formatDate(currentTime);

	let { interval, ease_factor, repetitions } = current;

	if (grade < 3) {
		// 실패: 리셋
		repetitions = 0;
		interval = 1;
	} else {
		// 성공
		if (repetitions === 0) {
			interval = 1;
		} else if (repetitions === 1) {
			interval = 6;
		} else {
			interval = Math.round(interval * ease_factor);
		}
		repetitions += 1;
	}

	// ease factor 업데이트
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
 * 오늘 복습 대상인지 판별한다.
 */
export function isDueForReview(nextReview: string, now?: number): boolean {
	const currentTime = now ?? Date.now();
	const todayStart = startOfDay(currentTime);
	const dueStart = startOfDay(parseDateStr(nextReview));
	return dueStart <= todayStart;
}

/**
 * 연체 일수를 계산한다. 양수=연체, 0=오늘, 음수=미래.
 */
export function computeOverdueDays(nextReview: string, now?: number): number {
	const currentTime = now ?? Date.now();
	const todayStart = startOfDay(currentTime);
	const dueStart = startOfDay(parseDateStr(nextReview));
	return Math.round((todayStart - dueStart) / DAY_MS);
}

/**
 * frontmatter에서 SRS 필드를 파싱한다.
 * 5개 필드가 모두 있어야 유효한 SrsMetadata를 반환한다.
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
 * 파일 내용의 frontmatter에 SRS 필드를 업데이트/삽입한다.
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
		// frontmatter 없음 → 새로 생성
		return `---\n${srsFields.join("\n")}\n---\n${fileContent}`;
	}

	const endIdx = fileContent.indexOf("---", 3);
	if (endIdx === -1) {
		return fileContent;
	}

	const fmContent = fileContent.slice(4, endIdx);
	const afterFm = fileContent.slice(endIdx + 3);

	// 기존 SRS 필드 제거
	const existingLines = fmContent.split("\n").filter((line) => {
		const key = line.split(":")[0]?.trim();
		return !SRS_KEYS.includes(key ?? "");
	});

	// 빈 줄 정리 후 SRS 필드 추가
	const cleanedLines = existingLines.filter((l) => l.trim() !== "");
	const newFmLines = [...cleanedLines, ...srsFields];
	return `---\n${newFmLines.join("\n")}\n---${afterFm}`;
}

/**
 * frontmatter에서 SRS 필드 5개를 제거한다. TIL 내용은 유지.
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
		// frontmatter가 비어짐
		return afterFm.replace(/^\n/, "");
	}
	return `---\n${cleanedLines.join("\n")}\n---${afterFm}`;
}

/**
 * 복습 대상 카드를 필터링+정렬+상한 적용한다.
 * 연체일 내림차순 (가장 급한 것 먼저).
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

	// 연체일 내림차순 (가장 급한 것 먼저)
	cards.sort((a, b) => b.overdueDays - a.overdueDays);
	return cards.slice(0, limit);
}

/**
 * 복습 통계를 집계한다.
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
 * 연속 복습일을 계산한다.
 * last_review 필드를 기반으로 매일 복습했는지 확인.
 */
export function computeReviewStreak(
	files: SrsFileEntry[],
	tilPath: string,
	now?: number,
): number {
	const currentTime = now ?? Date.now();

	// 복습이 있었던 날짜 집합 구성
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
			// 오늘 복습 아직 안 했어도 어제까지 연속이면 streak 유지 (grace period)
			if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
			break;
		}
		cursor.setDate(cursor.getDate() - 1);
	}

	return streak;
}

/**
 * 2단계 평가를 SM-2 grade로 변환한다.
 * 기억남=4, 모름=1.
 */
export function simpleGradeToSm2(remembered: boolean): ReviewGrade {
	return remembered ? 4 : 1;
}

// --- 포매팅 ---

/**
 * 복습 카드 목록을 텍스트로 포매팅한다.
 */
export function formatReviewList(cards: ReviewCard[]): string {
	if (cards.length === 0) return "복습할 카드가 없습니다.";

	const lines: string[] = [];
	lines.push(`## 복습 대상 (${cards.length}개)\n`);
	lines.push(`| # | 제목 | 카테고리 | 연체 | 반복 | EF |`);
	lines.push(`|---|------|---------|------|------|-----|`);

	for (let i = 0; i < cards.length; i++) {
		const c = cards[i]!;
		const overdueStr = c.overdueDays > 0 ? `+${c.overdueDays}일` : c.overdueDays === 0 ? "오늘" : `${c.overdueDays}일`;
		lines.push(`| ${i + 1} | ${c.title} | ${c.category} | ${overdueStr} | ${c.repetitions} | ${c.ease_factor} |`);
	}

	return lines.join("\n");
}

/**
 * 복습 통계를 텍스트로 포매팅한다.
 */
export function formatReviewStats(stats: ReviewStats): string {
	const lines: string[] = [];
	lines.push(`## 복습 통계\n`);
	lines.push(`| 지표 | 값 |`);
	lines.push(`|------|-----|`);
	lines.push(`| 오늘 복습 대상 | ${stats.dueToday}개 |`);
	lines.push(`| 연체 | ${stats.overdueCount}개 |`);
	lines.push(`| 오늘 복습 완료 | ${stats.totalReviewed}개 |`);
	lines.push(`| 전체 등록 | ${stats.totalScheduled}개 |`);
	lines.push(`| 평균 EF | ${stats.averageEase} |`);
	lines.push(`| 연속 복습 | ${stats.reviewStreak}일 |`);
	return lines.join("\n");
}
