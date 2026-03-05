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
	it("creates default values correctly", () => {
		const result = createDefaultSrsMetadata(NOW);
		expect(result.interval).toBe(1);
		expect(result.ease_factor).toBe(2.5);
		expect(result.repetitions).toBe(0);
		expect(result.last_review).toBe("2026-02-21");
		expect(result.next_review).toBe("2026-02-22");
	});

	it("creates based on current time when now is omitted", () => {
		const result = createDefaultSrsMetadata();
		expect(result.interval).toBe(1);
		expect(result.ease_factor).toBe(2.5);
		expect(result.repetitions).toBe(0);
	});
});

// --- computeNextReview (SM-2 algorithm) ---

describe("computeNextReview", () => {
	it("grade 5 (perfect): rep 0→1, interval 1", () => {
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

	it("grade 4 (remembered): ease_factor stays the same", () => {
		const current = makeDefaultSrs({ repetitions: 0, ease_factor: 2.5 });
		const result = computeNextReview(current, 4, NOW);
		expect(result.repetitions).toBe(1);
		// EF += 0.1 - (5-4)*(0.08 + (5-4)*0.02) = 0.1 - 0.1 = 0
		expect(result.ease_factor).toBe(2.5);
	});

	it("grade 3 (hard recall): ease_factor decreases", () => {
		const current = makeDefaultSrs({ repetitions: 0, ease_factor: 2.5 });
		const result = computeNextReview(current, 3, NOW);
		expect(result.repetitions).toBe(1);
		// EF += 0.1 - (5-3)*(0.08 + (5-3)*0.02) = 0.1 - 0.24 = -0.14
		expect(result.ease_factor).toBe(2.36);
	});

	it("grade 2 (fail): repetitions reset, interval 1", () => {
		const current = makeDefaultSrs({ repetitions: 5, interval: 30, ease_factor: 2.5 });
		const result = computeNextReview(current, 2, NOW);
		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
	});

	it("grade 1 (unknown): repetitions reset", () => {
		const current = makeDefaultSrs({ repetitions: 3, interval: 15, ease_factor: 2.5 });
		const result = computeNextReview(current, 1, NOW);
		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
	});

	it("grade 0 (completely unknown): repetitions reset", () => {
		const current = makeDefaultSrs({ repetitions: 3, interval: 15, ease_factor: 2.5 });
		const result = computeNextReview(current, 0, NOW);
		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
	});

	it("ease_factor does not drop below 1.3", () => {
		const current = makeDefaultSrs({ ease_factor: 1.3 });
		const result = computeNextReview(current, 0, NOW);
		expect(result.ease_factor).toBe(1.3);
	});

	it("ease_factor floor: stays at 1.3 even after repeated grade 0", () => {
		let srs = makeDefaultSrs({ ease_factor: 1.5 });
		for (let i = 0; i < 10; i++) {
			srs = computeNextReview(srs, 0, NOW);
		}
		expect(srs.ease_factor).toBe(1.3);
	});

	it("interval progression: 1 → 6 → EF multiple", () => {
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

	it("next_review is set to interval days from now", () => {
		const current = makeDefaultSrs({ repetitions: 1, interval: 1, ease_factor: 2.5 });
		const result = computeNextReview(current, 5, NOW);
		// interval=6, next_review = 2026-02-21 + 6 days = 2026-02-27
		expect(result.next_review).toBe("2026-02-27");
	});

	it("last_review is set to today", () => {
		const current = makeDefaultSrs({ last_review: "2026-02-10" });
		const result = computeNextReview(current, 4, NOW);
		expect(result.last_review).toBe("2026-02-21");
	});

	it("returns valid results for all grades (0~5)", () => {
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
	it("returns true when today is the review date", () => {
		expect(isDueForReview("2026-02-21", NOW)).toBe(true);
	});

	it("returns true when overdue (past date)", () => {
		expect(isDueForReview("2026-02-19", NOW)).toBe(true);
	});

	it("returns false for a future date", () => {
		expect(isDueForReview("2026-02-25", NOW)).toBe(false);
	});

	it("returns false for tomorrow", () => {
		expect(isDueForReview("2026-02-22", NOW)).toBe(false);
	});
});

// --- computeOverdueDays ---

describe("computeOverdueDays", () => {
	it("returns 0 for today", () => {
		expect(computeOverdueDays("2026-02-21", NOW)).toBe(0);
	});

	it("returns 3 when 3 days overdue", () => {
		expect(computeOverdueDays("2026-02-18", NOW)).toBe(3);
	});

	it("returns -3 when 3 days in the future", () => {
		expect(computeOverdueDays("2026-02-24", NOW)).toBe(-3);
	});
});

// --- parseSrsMetadata ---

describe("parseSrsMetadata", () => {
	it("parses SrsMetadata from complete frontmatter", () => {
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

	it("returns null when SRS fields are absent", () => {
		expect(parseSrsMetadata({ date: "2026-02-21", tags: ["til"] })).toBeNull();
	});

	it("returns null when only partial SRS fields are present", () => {
		expect(parseSrsMetadata({ next_review: "2026-02-22", interval: 6 })).toBeNull();
	});

	it("returns null when types are invalid", () => {
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

	it("inserts SRS fields into a file without frontmatter", () => {
		const result = updateFrontmatterSrs("# Hello\n\nContent", srs);
		expect(result).toContain("---\n");
		expect(result).toContain('next_review: "2026-02-22"');
		expect(result).toContain("interval: 1");
		expect(result).toContain("ease_factor: 2.5");
		expect(result).toContain("repetitions: 0");
		expect(result).toContain('last_review: "2026-02-21"');
		expect(result).toContain("# Hello");
	});

	it("adds SRS fields to existing frontmatter", () => {
		const content = `---\ndate: 2026-02-21\ntags: [til]\n---\n\n# Hello`;
		const result = updateFrontmatterSrs(content, srs);
		expect(result).toContain("date: 2026-02-21");
		expect(result).toContain("tags: [til]");
		expect(result).toContain('next_review: "2026-02-22"');
		expect(result).toContain("\n# Hello");
	});

	it("updates existing SRS fields", () => {
		const content = `---\ndate: 2026-02-21\nnext_review: "2026-02-20"\ninterval: 1\nease_factor: 2.5\nrepetitions: 0\nlast_review: "2026-02-19"\n---\n\n# Hello`;
		const newSrs = makeDefaultSrs({ next_review: "2026-02-28", interval: 6, repetitions: 2 });
		const result = updateFrontmatterSrs(content, newSrs);
		expect(result).toContain('next_review: "2026-02-28"');
		expect(result).toContain("interval: 6");
		expect(result).toContain("repetitions: 2");
		// preserve existing date field
		expect(result).toContain("date: 2026-02-21");
		// old value should not remain
		expect(result).not.toContain('"2026-02-20"');
	});

	it("preserves other frontmatter fields", () => {
		const content = `---\ndate: 2026-02-21\ncategory: typescript\ntags: [til, ts]\n---\n\n# Hello`;
		const result = updateFrontmatterSrs(content, srs);
		expect(result).toContain("category: typescript");
		expect(result).toContain("tags: [til, ts]");
	});
});

// --- removeFrontmatterSrs ---

describe("removeFrontmatterSrs", () => {
	it("removes all 5 SRS fields", () => {
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

	it("removes frontmatter that contains only SRS fields", () => {
		const content = `---\nnext_review: "2026-02-22"\ninterval: 1\nease_factor: 2.5\nrepetitions: 0\nlast_review: "2026-02-21"\n---\n\n# Hello`;
		const result = removeFrontmatterSrs(content);
		expect(result).not.toContain("---");
		expect(result).toContain("# Hello");
	});

	it("returns files without frontmatter unchanged", () => {
		const content = "# Hello\n\nContent";
		expect(removeFrontmatterSrs(content)).toBe(content);
	});

	it("preserves frontmatter without SRS fields as-is", () => {
		const content = `---\ndate: 2026-02-21\ntags: [til]\n---\n\n# Hello`;
		const result = removeFrontmatterSrs(content);
		expect(result).toContain("date: 2026-02-21");
		expect(result).toContain("tags: [til]");
	});
});

// --- filterDueCards ---

describe("filterDueCards", () => {
	it("returns empty result from an empty array", () => {
		expect(filterDueCards([], "til", NOW)).toEqual([]);
	});

	it("filters only cards due for review today", () => {
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

	it("sorts by overdue days in descending order", () => {
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

	it("excludes files without SRS metadata", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/no-srs.md", frontmatter: { date: "2026-02-21", tags: ["til"] } },
		]);
		expect(filterDueCards(files, "til", NOW)).toEqual([]);
	});

	it("excludes backlog.md", () => {
		const files = makeSrsFiles([
			{
				path: "til/ts/backlog.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-20" },
			},
		]);
		expect(filterDueCards(files, "til", NOW)).toEqual([]);
	});

	it("ignores files outside tilPath", () => {
		const files = makeSrsFiles([
			{
				path: "notes/random.md",
				frontmatter: { next_review: "2026-02-21", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-20" },
			},
		]);
		expect(filterDueCards(files, "til", NOW)).toEqual([]);
	});

	it("applies an upper bound with limit", () => {
		const files = makeSrsFiles(
			Array.from({ length: 30 }, (_, i) => ({
				path: `til/ts/card-${i}.md`,
				frontmatter: { next_review: "2026-02-20", interval: 1, ease_factor: 2.5, repetitions: 0, last_review: "2026-02-19" },
			})),
		);
		expect(filterDueCards(files, "til", NOW, 10)).toHaveLength(10);
		expect(filterDueCards(files, "til", NOW)).toHaveLength(20); // default limit=20
	});

	it("extracts category correctly", () => {
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
	it("returns default stats from an empty array", () => {
		const stats = computeReviewStats([], "til", NOW);
		expect(stats.dueToday).toBe(0);
		expect(stats.overdueCount).toBe(0);
		expect(stats.totalReviewed).toBe(0);
		expect(stats.totalScheduled).toBe(0);
		expect(stats.averageEase).toBe(0);
		expect(stats.reviewStreak).toBe(0);
	});

	it("aggregates stats correctly", () => {
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
		expect(stats.dueToday).toBe(2); // a (today) + b (overdue)
		expect(stats.overdueCount).toBe(1); // only b is overdue
		expect(stats.totalReviewed).toBe(1); // only a reviewed today
		expect(stats.totalScheduled).toBe(3);
		expect(stats.averageEase).toBe(2.5); // (2.5+2.3+2.7)/3 = 2.5
	});
});

// --- computeReviewStreak ---

describe("computeReviewStreak", () => {
	it("returns 0 from an empty array", () => {
		expect(computeReviewStreak([], "til", NOW)).toBe(0);
	});

	it("calculates consecutive review days", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/a.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-21" } },
			{ path: "til/ts/b.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-20" } },
			{ path: "til/ts/c.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-19" } },
		]);
		expect(computeReviewStreak(files, "til", NOW)).toBe(3);
	});

	it("maintains streak if consecutive from yesterday even without today's review", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/a.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-20" } },
			{ path: "til/ts/b.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-19" } },
		]);
		expect(computeReviewStreak(files, "til", NOW)).toBe(2);
	});

	it("streak resets when there is a gap day", () => {
		const files = makeSrsFiles([
			{ path: "til/ts/a.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-21" } },
			// no entry for 2/20
			{ path: "til/ts/b.md", frontmatter: { next_review: "2026-02-22", interval: 1, ease_factor: 2.5, repetitions: 1, last_review: "2026-02-19" } },
		]);
		expect(computeReviewStreak(files, "til", NOW)).toBe(1);
	});
});

// --- simpleGradeToSm2 ---

describe("simpleGradeToSm2", () => {
	it("remembered → grade 4", () => {
		expect(simpleGradeToSm2(true)).toBe(4);
	});

	it("unknown → grade 1", () => {
		expect(simpleGradeToSm2(false)).toBe(1);
	});
});

// --- formatReviewList ---

describe("formatReviewList", () => {
	it("returns a guidance message from an empty array", () => {
		expect(formatReviewList([])).toBe("No cards to review.");
	});

	it("formats the card list as a table", () => {
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
		expect(result).toContain("Cards Due for Review (1)");
		expect(result).toContain("Generics");
		expect(result).toContain("ts");
		expect(result).toContain("today");
	});

	it("displays the overdue days for overdue cards", () => {
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
		expect(result).toContain("+3d");
	});
});

// --- formatReviewStats ---

describe("formatReviewStats", () => {
	it("formats stats as a table", () => {
		const stats = {
			dueToday: 5,
			overdueCount: 2,
			totalReviewed: 3,
			totalScheduled: 20,
			averageEase: 2.45,
			reviewStreak: 7,
		};
		const result = formatReviewStats(stats);
		expect(result).toContain("Review Statistics");
		expect(result).toContain("| Due today | 5 |");
		expect(result).toContain("| Overdue | 2 |");
		expect(result).toContain("| Reviewed today | 3 |");
		expect(result).toContain("| Total scheduled | 20 |");
		expect(result).toContain("2.45");
		expect(result).toContain("7d");
	});
});
