import { describe, it, expect } from "vitest";
import {
	createDefaultSrsMetadata,
	computeNextReview,
	isDueForReview,
	computeOverdueDays,
	parseSrsMetadata,
	updateFrontmatterSrs,
	removeFrontmatterSrs,
	filterDueCards,
	computeReviewStats,
	computeReviewStreak,
	simpleGradeToSm2,
	formatReviewList,
	formatReviewStats,
	type SrsMetadata,
	type SrsFileEntry,
	type ReviewGrade,
} from "../src/core/srs";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-02-21T12:00:00Z").getTime();

function makeDefaultSrs(overrides?: Partial<SrsMetadata>): SrsMetadata {
	return {
		next_review: "2026-02-22",
		interval: 1,
		ease_factor: 2.5,
		repetitions: 0,
		last_review: "2026-02-21",
		...overrides,
	};
}

function makeSrsFiles(
	entries: Array<{ path: string; title?: string; frontmatter?: Record<string, unknown> }>,
): SrsFileEntry[] {
	return entries.map((e) => ({
		path: e.path,
		extension: e.path.split(".").pop() ?? "",
		title: e.title ?? e.path.split("/").pop()?.replace(/\.md$/, "") ?? "",
		frontmatter: e.frontmatter ?? {},
	}));
}

// --- createDefaultSrsMetadata ---

describe("createDefaultSrsMetadata", () => {
	it("기본값을 올바르게 생성한다", () => {
		const result = createDefaultSrsMetadata(NOW);
		expect(result.interval).toBe(1);
		expect(result.ease_factor).toBe(2.5);
		expect(result.repetitions).toBe(0);
		expect(result.last_review).toBe("2026-02-21");
		expect(result.next_review).toBe("2026-02-22");
	});

	it("now를 생략하면 현재 시각 기반으로 생성한다", () => {
		const result = createDefaultSrsMetadata();
		expect(result.interval).toBe(1);
		expect(result.ease_factor).toBe(2.5);
		expect(result.repetitions).toBe(0);
	});
});

// --- computeNextReview (SM-2 알고리즘) ---

describe("computeNextReview", () => {
	it("grade 5 (완벽): rep 0→1, interval 1", () => {
		const current = makeDefaultSrs({ repetitions: 0, interval: 1 });
		const result = computeNextReview(current, 5, NOW);
		expect(result.repetitions).toBe(1);
		expect(result.interval).toBe(1);
		expect(result.ease_factor).toBeGreaterThanOrEqual(2.5);
	});

	it("grade 5: rep 1→2, interval 6", () => {
		const current = makeDefaultSrs({ repetitions: 1, interval: 1, ease_factor: 2.5 });
		const result = computeNextReview(current, 5, NOW);
		expect(result.repetitions).toBe(2);
		expect(result.interval).toBe(6);
	});

	it("grade 5: rep 2→3, interval = round(6 * EF)", () => {
		const current = makeDefaultSrs({ repetitions: 2, interval: 6, ease_factor: 2.6 });
		const result = computeNextReview(current, 5, NOW);
		expect(result.repetitions).toBe(3);
		expect(result.interval).toBe(Math.round(6 * 2.6));
	});

	it("grade 4 (기억남): ease_factor 유지", () => {
		const current = makeDefaultSrs({ repetitions: 0, ease_factor: 2.5 });
		const result = computeNextReview(current, 4, NOW);
		expect(result.repetitions).toBe(1);
		// EF += 0.1 - (5-4)*(0.08 + (5-4)*0.02) = 0.1 - 0.1 = 0
		expect(result.ease_factor).toBe(2.5);
	});

	it("grade 3 (어렵게 정답): ease_factor 감소", () => {
		const current = makeDefaultSrs({ repetitions: 0, ease_factor: 2.5 });
		const result = computeNextReview(current, 3, NOW);
		expect(result.repetitions).toBe(1);
		// EF += 0.1 - (5-3)*(0.08 + (5-3)*0.02) = 0.1 - 0.24 = -0.14
		expect(result.ease_factor).toBe(2.36);
	});

	it("grade 2 (실패): repetitions 리셋, interval 1", () => {
		const current = makeDefaultSrs({ repetitions: 5, interval: 30, ease_factor: 2.5 });
		const result = computeNextReview(current, 2, NOW);
		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
	});

	it("grade 1 (모름): repetitions 리셋", () => {
		const current = makeDefaultSrs({ repetitions: 3, interval: 15, ease_factor: 2.5 });
		const result = computeNextReview(current, 1, NOW);
		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
	});

	it("grade 0 (완전 모름): repetitions 리셋", () => {
		const current = makeDefaultSrs({ repetitions: 3, interval: 15, ease_factor: 2.5 });
		const result = computeNextReview(current, 0, NOW);
		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
	});

	it("ease_factor가 1.3 미만으로 내려가지 않는다", () => {
		const current = makeDefaultSrs({ ease_factor: 1.3 });
		const result = computeNextReview(current, 0, NOW);
		expect(result.ease_factor).toBe(1.3);
	});

	it("ease_factor floor: grade 0에서 반복해도 1.3 유지", () => {
		let srs = makeDefaultSrs({ ease_factor: 1.5 });
		for (let i = 0; i < 10; i++) {
			srs = computeNextReview(srs, 0, NOW);
		}
		expect(srs.ease_factor).toBe(1.3);
	});

	it("interval 진행: 1 → 6 → EF 배수", () => {
		let srs = makeDefaultSrs({ repetitions: 0, interval: 1, ease_factor: 2.5 });
		srs = computeNextReview(srs, 4, NOW); // rep 0→1, interval=1
		expect(srs.interval).toBe(1);
		srs = computeNextReview(srs, 4, NOW); // rep 1→2, interval=6
		expect(srs.interval).toBe(6);
		srs = computeNextReview(srs, 4, NOW); // rep 2→3, interval=round(6*2.5)=15
		expect(srs.interval).toBe(15);
		srs = computeNextReview(srs, 4, NOW); // rep 3→4, interval=round(15*2.5)=38
		expect(srs.interval).toBe(38);
	});

	it("next_review가 interval일 후로 설정된다", () => {
		const current = makeDefaultSrs({ repetitions: 1, interval: 1, ease_factor: 2.5 });
		const result = computeNextReview(current, 5, NOW);
		// interval=6, next_review = 2026-02-21 + 6일 = 2026-02-27
		expect(result.next_review).toBe("2026-02-27");
	});

	it("last_review가 오늘로 설정된다", () => {
		const current = makeDefaultSrs({ last_review: "2026-02-10" });
		const result = computeNextReview(current, 4, NOW);
		expect(result.last_review).toBe("2026-02-21");
	});

	it("모든 grade (0~5)에서 유효한 결과를 반환한다", () => {
		for (let g = 0; g <= 5; g++) {
			const result = computeNextReview(makeDefaultSrs(), g as ReviewGrade, NOW);
			expect(result.ease_factor).toBeGreaterThanOrEqual(1.3);
			expect(result.interval).toBeGreaterThanOrEqual(1);
			expect(result.next_review).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});
});

// --- isDueForReview ---

describe("isDueForReview", () => {
	it("오늘이 복습일이면 true", () => {
		expect(isDueForReview("2026-02-21", NOW)).toBe(true);
	});

	it("연체(과거 날짜)이면 true", () => {
		expect(isDueForReview("2026-02-19", NOW)).toBe(true);
	});

	it("미래 날짜이면 false", () => {
		expect(isDueForReview("2026-02-25", NOW)).toBe(false);
	});

	it("내일이면 false", () => {
		expect(isDueForReview("2026-02-22", NOW)).toBe(false);
	});
});

// --- computeOverdueDays ---

describe("computeOverdueDays", () => {
	it("오늘이면 0", () => {
		expect(computeOverdueDays("2026-02-21", NOW)).toBe(0);
	});

	it("3일 연체이면 3", () => {
		expect(computeOverdueDays("2026-02-18", NOW)).toBe(3);
	});

	it("미래 3일이면 -3", () => {
		expect(computeOverdueDays("2026-02-24", NOW)).toBe(-3);
	});
});

// --- parseSrsMetadata ---

describe("parseSrsMetadata", () => {
	it("완전한 frontmatter에서 SrsMetadata를 파싱한다", () => {
		const fm = {
			next_review: "2026-02-22",
			interval: 6,
			ease_factor: 2.5,
			repetitions: 2,
			last_review: "2026-02-16",
		};
		const result = parseSrsMetadata(fm);
		expect(result).toEqual(fm);
	});

	it("SRS 필드가 없으면 null", () => {
		expect(parseSrsMetadata({ date: "2026-02-21", tags: ["til"] })).toBeNull();
	});

	it("부분적 SRS 필드만 있으면 null", () => {
		expect(parseSrsMetadata({ next_review: "2026-02-22", interval: 6 })).toBeNull();
	});

	it("잘못된 타입이면 null", () => {
		expect(parseSrsMetadata({
			next_review: 12345,
			interval: "6",
			ease_factor: 2.5,
			repetitions: 2,
			last_review: "2026-02-16",
		})).toBeNull();
	});
});

// --- updateFrontmatterSrs ---

describe("updateFrontmatterSrs", () => {
	const srs = makeDefaultSrs();

	it("frontmatter가 없는 파일에 SRS 필드를 삽입한다", () => {
		const result = updateFrontmatterSrs("# Hello\n\nContent", srs);
		expect(result).toContain("---\n");
		expect(result).toContain('next_review: "2026-02-22"');
		expect(result).toContain("interval: 1");
		expect(result).toContain("ease_factor: 2.5");
		expect(result).toContain("repetitions: 0");
		expect(result).toContain('last_review: "2026-02-21"');
		expect(result).toContain("# Hello");
	});

	it("기존 frontmatter에 SRS 필드를 추가한다", () => {
		const content = `---\ndate: 2026-02-21\ntags: [til]\n---\n\n# Hello`;
		const result = updateFrontmatterSrs(content, srs);
		expect(result).toContain("date: 2026-02-21");
		expect(result).toContain("tags: [til]");
		expect(result).toContain('next_review: "2026-02-22"');
		expect(result).toContain("\n# Hello");
	});

	it("기존 SRS 필드를 업데이트한다", () => {
		const content = `---\ndate: 2026-02-21\nnext_review: "2026-02-20"\ninterval: 1\nease_factor: 2.5\nrepetitions: 0\nlast_review: "2026-02-19"\n---\n\n# Hello`;
		const newSrs = makeDefaultSrs({ next_review: "2026-02-28", interval: 6, repetitions: 2 });
		const result = updateFrontmatterSrs(content, newSrs);
		expect(result).toContain('next_review: "2026-02-28"');
		expect(result).toContain("interval: 6");
		expect(result).toContain("repetitions: 2");
		// 기존 date 필드 보존
		expect(result).toContain("date: 2026-02-21");
		// 이전 값이 남아있지 않아야 함
		expect(result).not.toContain('"2026-02-20"');
	});

	it("다른 frontmatter 필드를 보존한다", () => {
		const content = `---\ndate: 2026-02-21\ncategory: typescript\ntags: [til, ts]\n---\n\n# Hello`;
		const result = updateFrontmatterSrs(content, srs);
		expect(result).toContain("category: typescript");
		expect(result).toContain("tags: [til, ts]");
	});
});

// --- removeFrontmatterSrs ---

describe("removeFrontmatterSrs", () => {
	it("SRS 필드 5개를 제거한다", () => {
		const content = `---\ndate: 2026-02-21\nnext_review: "2026-02-22"\ninterval: 1\nease_factor: 2.5\nrepetitions: 0\nlast_review: "2026-02-21"\n---\n\n# Hello`;
		const result = removeFrontmatterSrs(content);
		expect(result).toContain("date: 2026-02-21");
		expect(result).not.toContain("next_review");
		expect(result).not.toContain("interval");
		expect(result).not.toContain("ease_factor");
		expect(result).not.toContain("repetitions");
		expect(result).not.toContain("last_review");
		expect(result).toContain("# Hello");
	});

	it("SRS 필드만 있는 frontmatter는 제거된다", () => {
		const content = `---\nnext_review: "2026-02-22"\ninterval: 1\nease_factor: 2.5\nrepetitions: 0\nlast_review: "2026-02-21"\n---\n\n# Hello`;
		const result = removeFrontmatterSrs(content);
		expect(result).not.toContain("---");
		expect(result).toContain("# Hello");
	});

	it("frontmatter가 없는 파일은 그대로 반환한다", () => {
		const content = "# Hello\n\nContent";
		expect(removeFrontmatterSrs(content)).toBe(content);
	});

	it("SRS 필드가 없는 frontmatter는 그대로 보존한다", () => {
		const content = `---\ndate: 2026-02-21\ntags: [til]\n---\n\n# Hello`;
		const result = removeFrontmatterSrs(content);
		expect(result).toContain("date: 2026-02-21");
		expect(result).toContain("tags: [til]");
	});
});

// --- filterDueCards ---

describe("filterDueCards", () => {
	it("빈 배열에서 빈 결과를 반환한다", () => {
		expect(filterDueCards([], "til", NOW)).toEqual([]);
	});

	it("오늘 복습 대상인 카드만 필터링한다", () => {
		const files = makeSrsFiles([
			{
				path: "til/ts/a.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-20" },
			},
			{
				path: "til/ts/b.md",
				frontmatter: { next_review: "2026-02-25", interval: 6, ease_factor: 2.5, repetitions: 2, last_review: "2026-02-19" },
			},
		]);
		const result = filterDueCards(files, "til", NOW);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("til/ts/a.md");
	});

	it("연체일 내림차순으로 정렬한다", () => {
		const files = makeSrsFiles([
			{
				path: "til/ts/recent.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-20" },
			},
			{
				path: "til/ts/old.md",
				frontmatter: { next_review: "2026-02-15", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-14" },
			},
		]);
		const result = filterDueCards(files, "til", NOW);
		expect(result[0]!.path).toBe("til/ts/old.md");
		expect(result[0]!.overdueDays).toBe(6);
		expect(result[1]!.path).toBe("til/ts/recent.md");
		expect(result[1]!.overdueDays).toBe(0);
	});

	it("SRS 메타데이터가 없는 파일은 제외한다", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/no-srs.md", frontmatter: { date: "2026-02-21", tags: ["til"] } },
		]);
		expect(filterDueCards(files, "til", NOW)).toEqual([]);
	});

	it("backlog.md를 제외한다", () => {
		const files = makeSrsFiles([
			{
				path: "til/ts/backlog.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-20" },
			},
		]);
		expect(filterDueCards(files, "til", NOW)).toEqual([]);
	});

	it("tilPath 외부 파일은 무시한다", () => {
		const files = makeSrsFiles([
			{
				path: "notes/random.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-20" },
			},
		]);
		expect(filterDueCards(files, "til", NOW)).toEqual([]);
	});

	it("limit으로 상한을 적용한다", () => {
		const files = makeSrsFiles(
			Array.from({ length: 30 }, (_, i) => ({
				path: `til/ts/card-${i}.md`,
				frontmatter: { next_review: "2026-02-20", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-19" },
			})),
		);
		expect(filterDueCards(files, "til", NOW, 10)).toHaveLength(10);
		expect(filterDueCards(files, "til", NOW)).toHaveLength(20); // 기본 limit=20
	});

	it("카테고리를 올바르게 추출한다", () => {
		const files = makeSrsFiles([
			{
				path: "til/react/hooks.md",
				title: "React Hooks",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-20" },
			},
		]);
		const result = filterDueCards(files, "til", NOW);
		expect(result[0]!.category).toBe("react");
		expect(result[0]!.title).toBe("React Hooks");
	});
});

// --- computeReviewStats ---

describe("computeReviewStats", () => {
	it("빈 배열에서 기본 통계를 반환한다", () => {
		const stats = computeReviewStats([], "til", NOW);
		expect(stats.dueToday).toBe(0);
		expect(stats.overdueCount).toBe(0);
		expect(stats.totalReviewed).toBe(0);
		expect(stats.totalScheduled).toBe(0);
		expect(stats.averageEase).toBe(0);
		expect(stats.reviewStreak).toBe(0);
	});

	it("통계를 올바르게 집계한다", () => {
		const files = makeSrsFiles([
			{
				path: "til/ts/a.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-21" },
			},
			{
				path: "til/ts/b.md",
				frontmatter: { next_review: "2026-02-18", interval: 6, ease_factor: 2.3, repetitions: 2, last_review: "2026-02-20" },
			},
			{
				path: "til/ts/c.md",
				frontmatter: { next_review: "2026-02-25", interval: 10, ease_factor: 2.7, repetitions: 3, last_review: "2026-02-15" },
			},
		]);
		const stats = computeReviewStats(files, "til", NOW);
		expect(stats.dueToday).toBe(2); // a (오늘) + b (연체)
		expect(stats.overdueCount).toBe(1); // b만 연체
		expect(stats.totalReviewed).toBe(1); // a만 오늘 복습
		expect(stats.totalScheduled).toBe(3);
		expect(stats.averageEase).toBe(2.5); // (2.5+2.3+2.7)/3 = 2.5
	});
});

// --- computeReviewStreak ---

describe("computeReviewStreak", () => {
	it("빈 배열에서 0을 반환한다", () => {
		expect(computeReviewStreak([], "til", NOW)).toBe(0);
	});

	it("연속 복습일을 계산한다", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/a.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-21" } },
			{ path: "til/ts/b.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-20" } },
			{ path: "til/ts/c.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-19" } },
		]);
		expect(computeReviewStreak(files, "til", NOW)).toBe(3);
	});

	it("오늘 복습 안 해도 어제부터 연속이면 streak 유지", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/a.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-20" } },
			{ path: "til/ts/b.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-19" } },
		]);
		expect(computeReviewStreak(files, "til", NOW)).toBe(2);
	});

	it("중간에 빈 날이 있으면 streak 끊김", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/a.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-21" } },
			// 2/20 없음
			{ path: "til/ts/b.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-19" } },
		]);
		expect(computeReviewStreak(files, "til", NOW)).toBe(1);
	});
});

// --- simpleGradeToSm2 ---

describe("simpleGradeToSm2", () => {
	it("기억남 → grade 4", () => {
		expect(simpleGradeToSm2(true)).toBe(4);
	});

	it("모름 → grade 1", () => {
		expect(simpleGradeToSm2(false)).toBe(1);
	});
});

// --- formatReviewList ---

describe("formatReviewList", () => {
	it("빈 배열에서 안내 메시지를 반환한다", () => {
		expect(formatReviewList([])).toBe("복습할 카드가 없습니다.");
	});

	it("카드 목록을 테이블로 포매팅한다", () => {
		const cards = [{
			path: "til/ts/generics.md",
			category: "ts",
			title: "Generics",
			dueDate: "2026-02-21",
			overdueDays: 0,
			interval: 1,
			repetitions: 1,
			ease_factor: 2.5,
		}];
		const result = formatReviewList(cards);
		expect(result).toContain("복습 대상 (1개)");
		expect(result).toContain("Generics");
		expect(result).toContain("ts");
		expect(result).toContain("오늘");
	});

	it("연체 카드의 일수를 표시한다", () => {
		const cards = [{
			path: "til/ts/a.md",
			category: "ts",
			title: "A",
			dueDate: "2026-02-18",
			overdueDays: 3,
			interval: 1,
			repetitions: 0,
			ease_factor: 2.5,
		}];
		const result = formatReviewList(cards);
		expect(result).toContain("+3일");
	});
});

// --- formatReviewStats ---

describe("formatReviewStats", () => {
	it("통계를 테이블로 포매팅한다", () => {
		const stats = {
			dueToday: 5,
			overdueCount: 2,
			totalReviewed: 3,
			totalScheduled: 20,
			averageEase: 2.45,
			reviewStreak: 7,
		};
		const result = formatReviewStats(stats);
		expect(result).toContain("복습 통계");
		expect(result).toContain("5개");
		expect(result).toContain("2개");
		expect(result).toContain("3개");
		expect(result).toContain("20개");
		expect(result).toContain("2.45");
		expect(result).toContain("7일");
	});
});
