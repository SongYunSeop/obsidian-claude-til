import { describe, it, expect } from "vitest";
import {
	generateTilPageHtml,
	generateCategoryIndexHtml,
	generateProfileHtml,
	renderAllTilsHtml,
	getProfileCss,
	renderSummaryCardsHtml,
	renderRecentTilsHtml,
} from "../src/core/profile";
import type { ProfileConfig, TilPageData, CategoryPageData, CategoryTilGroup, RecentTilEntry } from "../src/core/profile";

const config: ProfileConfig = {
	title: "My TIL",
	description: "Today I Learned",
	githubUrl: "https://github.com/test",
};

describe("getProfileCss", () => {
	it("returns a CSS string", () => {
		const css = getProfileCss();
		expect(css).toContain("--bg-primary");
		expect(css).toContain("--accent");
		expect(css).toContain(".til-content");
	});
});

describe("generateTilPageHtml", () => {
	const data: TilPageData = {
		title: "Async Await Patterns",
		category: "typescript",
		createdDate: "2025-01-15",
		contentHtml: "<h2>Introduction</h2><p>Hello world</p>",
	};

	it("returns a complete HTML document", () => {
		const html = generateTilPageHtml(data, config);
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	it("includes the title", () => {
		const html = generateTilPageHtml(data, config);
		expect(html).toContain("Async Await Patterns");
		expect(html).toContain("<title>Async Await Patterns — My TIL</title>");
	});

	it("includes category badge", () => {
		const html = generateTilPageHtml(data, config);
		expect(html).toContain('class="badge"');
		expect(html).toContain("typescript");
	});

	it("includes the date", () => {
		const html = generateTilPageHtml(data, config);
		expect(html).toContain("2025-01-15");
	});

	it("includes body HTML", () => {
		const html = generateTilPageHtml(data, config);
		expect(html).toContain("<h2>Introduction</h2>");
		expect(html).toContain("<p>Hello world</p>");
	});

	it("includes breadcrumb navigation", () => {
		const html = generateTilPageHtml(data, config);
		expect(html).toContain('class="breadcrumb"');
		// TIL pages are located at {category}/{slug}.html, so home is ../index.html and category is index.html
		expect(html).toContain('href="../index.html"');
		expect(html).toContain('href="index.html"');
	});

	it("XSS를 방지한다", () => {
		const xssData: TilPageData = {
			title: '<script>alert("xss")</script>',
			category: "test",
			createdDate: "2025-01-01",
			contentHtml: "<p>safe</p>",
		};
		const html = generateTilPageHtml(xssData, config);
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("generateCategoryIndexHtml", () => {
	const data: CategoryPageData = {
		category: "typescript",
		tils: [
			{ title: "Async Patterns", slug: "async-patterns", createdDate: "2025-01-15", summary: "Learn async/await" },
			{ title: "Generics", slug: "generics", createdDate: "2025-01-10", summary: "" },
		],
	};

	it("includes category name", () => {
		const html = generateCategoryIndexHtml(data, config);
		expect(html).toContain("typescript");
		expect(html).toContain("2 TILs");
	});

	it("includes TIL list links", () => {
		const html = generateCategoryIndexHtml(data, config);
		expect(html).toContain("async-patterns.html");
		expect(html).toContain("Async Patterns");
		expect(html).toContain("generics.html");
		expect(html).toContain("Generics");
	});

	it("includes summary", () => {
		const html = generateCategoryIndexHtml(data, config);
		expect(html).toContain("Learn async/await");
	});

	it("includes dates", () => {
		const html = generateCategoryIndexHtml(data, config);
		expect(html).toContain("2025-01-15");
		expect(html).toContain("2025-01-10");
	});

	it("includes breadcrumb", () => {
		const html = generateCategoryIndexHtml(data, config);
		expect(html).toContain("../index.html");
	});
});

describe("renderAllTilsHtml", () => {
	const categories: CategoryTilGroup[] = [
		{
			name: "typescript",
			tils: [
				{ title: "Async", slug: "async", createdDate: "2025-01-15" },
				{ title: "Generics", slug: "generics", createdDate: "2025-01-10" },
			],
		},
		{
			name: "rust",
			tils: [
				{ title: "Ownership", slug: "ownership", createdDate: "2025-01-12" },
			],
		},
	];

	it("generates collapsible groups per category", () => {
		const html = renderAllTilsHtml(categories);
		expect(html).toContain("<details");
		expect(html).toContain("<summary>");
		expect(html).toContain("typescript");
		expect(html).toContain("rust");
	});

	it("displays TIL count per category", () => {
		const html = renderAllTilsHtml(categories);
		expect(html).toContain("(2)");
		expect(html).toContain("(1)");
	});

	it("displays total TIL count", () => {
		const html = renderAllTilsHtml(categories);
		expect(html).toContain("All TILs (3)");
	});

	it("generates correct links for each TIL", () => {
		const html = renderAllTilsHtml(categories);
		expect(html).toContain("typescript/async.html");
		expect(html).toContain("typescript/generics.html");
		expect(html).toContain("rust/ownership.html");
	});

	it("returns empty string for empty category array", () => {
		expect(renderAllTilsHtml([])).toBe("");
	});
});

describe("renderSummaryCardsHtml", () => {
	it("renders 4 cards", () => {
		const html = renderSummaryCardsHtml(42, 5, 3, 7);
		expect(html).toContain("summary-cards");
		expect(html).toContain("42");
		expect(html).toContain("5");
		expect(html).toContain("3");
		expect(html).toContain("7");
	});

	it("includes card labels", () => {
		const html = renderSummaryCardsHtml(0, 0, 0, 0);
		expect(html).toContain("Total TILs");
		expect(html).toContain("Categories");
		expect(html).toContain("This Week");
		expect(html).toContain("Streak");
	});

	it("correctly displays 0 values", () => {
		const html = renderSummaryCardsHtml(0, 0, 0, 0);
		expect(html).toContain("card-value");
	});
});

describe("renderRecentTilsHtml", () => {
	const recent: RecentTilEntry[] = [
		{ title: "Async Patterns", slug: "async-patterns", category: "typescript", createdDate: "2025-01-15", summary: "Learn async/await" },
		{ title: "Ownership", slug: "ownership", category: "rust", createdDate: "2025-01-12", summary: "" },
	];

	it("renders recent TIL cards", () => {
		const html = renderRecentTilsHtml(recent);
		expect(html).toContain("recent-tils-section");
		expect(html).toContain("Recent TILs");
		expect(html).toContain("Async Patterns");
		expect(html).toContain("Ownership");
	});

	it("includes category badges", () => {
		const html = renderRecentTilsHtml(recent);
		expect(html).toContain('class="badge"');
		expect(html).toContain("typescript");
		expect(html).toContain("rust");
	});

	it("generates correct links", () => {
		const html = renderRecentTilsHtml(recent);
		expect(html).toContain("typescript/async-patterns.html");
		expect(html).toContain("rust/ownership.html");
	});

	it("displays summary when present", () => {
		const html = renderRecentTilsHtml(recent);
		expect(html).toContain("Learn async/await");
	});

	it("omits recent-til-summary when no summary", () => {
		const noSummary: RecentTilEntry[] = [
			{ title: "Ownership", slug: "ownership", category: "rust", createdDate: "2025-01-12", summary: "" },
		];
		const html = renderRecentTilsHtml(noSummary);
		expect(html).not.toContain("recent-til-summary");
	});

	it("returns empty string for empty array", () => {
		expect(renderRecentTilsHtml([])).toBe("");
	});
});

describe("generateProfileHtml", () => {
	it("generates a profile page", () => {
		const html = generateProfileHtml(config, "<div>cards</div>", "<div>heatmap</div>", "<div>recent</div>", "<div>tils</div>");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("My TIL");
		expect(html).toContain("Today I Learned");
		expect(html).toContain("<div>cards</div>");
		expect(html).toContain("<div>heatmap</div>");
		expect(html).toContain("<div>recent</div>");
		expect(html).toContain("<div>tils</div>");
	});

	it("includes GitHub link", () => {
		const html = generateProfileHtml(config, "", "", "", "");
		expect(html).toContain("https://github.com/test");
	});

	it("omits link when no GitHub URL", () => {
		const noGithub: ProfileConfig = { title: "TIL", description: "desc" };
		const html = generateProfileHtml(noGithub, "", "", "", "");
		expect(html).not.toContain("GitHub</a>");
	});

	it("includes oh-my-til link", () => {
		const html = generateProfileHtml(config, "", "", "", "");
		expect(html).toContain("oh-my-til");
	});
});
