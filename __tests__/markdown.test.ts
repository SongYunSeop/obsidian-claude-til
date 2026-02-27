import { describe, it, expect } from "vitest";
import { renderMarkdown, escapeHtml, stripFrontmatter, renderInline, rewriteTilLinks } from "../src/core/markdown";

describe("escapeHtml", () => {
	it("HTML 특수문자를 이스케이프한다", () => {
		expect(escapeHtml('<script>alert("xss")</script>')).toBe(
			"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
		);
	});

	it("앰퍼샌드를 이스케이프한다", () => {
		expect(escapeHtml("a & b")).toBe("a &amp; b");
	});

	it("작은따옴표를 이스케이프한다", () => {
		expect(escapeHtml("it's")).toBe("it&#39;s");
	});
});

describe("stripFrontmatter", () => {
	it("frontmatter를 제거한다", () => {
		const md = `---
title: Test
date: 2025-01-01
---
# Hello`;
		expect(stripFrontmatter(md)).toBe("# Hello");
	});

	it("frontmatter가 없으면 그대로 반환한다", () => {
		expect(stripFrontmatter("# Hello")).toBe("# Hello");
	});

	it("닫는 ---가 없으면 그대로 반환한다", () => {
		const md = "---\ntitle: Test\n# Hello";
		expect(stripFrontmatter(md)).toBe(md);
	});
});

describe("renderInline", () => {
	it("볼드를 변환한다", () => {
		expect(renderInline("**bold**")).toBe("<strong>bold</strong>");
	});

	it("이탤릭을 변환한다", () => {
		expect(renderInline("*italic*")).toBe("<em>italic</em>");
	});

	it("볼드+이탤릭을 변환한다", () => {
		expect(renderInline("***both***")).toBe("<strong><em>both</em></strong>");
	});

	it("인라인 코드를 변환한다", () => {
		expect(renderInline("`code`")).toBe("<code>code</code>");
	});

	it("링크를 변환한다", () => {
		expect(renderInline("[text](https://example.com)")).toBe(
			'<a href="https://example.com">text</a>',
		);
	});

	it("javascript: URI를 차단한다", () => {
		expect(renderInline("[xss](javascript:void)")).toBe("xss");
		expect(renderInline("[xss](JAVASCRIPT:void)")).toBe("xss");
		expect(renderInline("[vbs](vbscript:msgbox)")).toBe("vbs");
		// data: URI도 차단
		expect(renderInline("[d](data:text/plain,hello)")).toBe("d");
	});

	it("javascript: URI가 href에 포함되지 않는다", () => {
		const html = renderInline("[click](javascript:alert)");
		expect(html).not.toContain("javascript:");
	});

	it("HTML을 이스케이프한 후 인라인 변환한다", () => {
		expect(renderInline("**<b>bold</b>**")).toBe(
			"<strong>&lt;b&gt;bold&lt;/b&gt;</strong>",
		);
	});
});

describe("renderMarkdown", () => {
	it("frontmatter를 제거하고 본문을 변환한다", () => {
		const md = `---
title: Test
---
# Hello

World`;
		const html = renderMarkdown(md);
		expect(html).toContain("<h1>Hello</h1>");
		expect(html).toContain("<p>World</p>");
		expect(html).not.toContain("title: Test");
	});

	it("헤딩 h1~h6을 변환한다", () => {
		const md = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
		const html = renderMarkdown(md);
		expect(html).toContain("<h1>H1</h1>");
		expect(html).toContain("<h2>H2</h2>");
		expect(html).toContain("<h3>H3</h3>");
		expect(html).toContain("<h4>H4</h4>");
		expect(html).toContain("<h5>H5</h5>");
		expect(html).toContain("<h6>H6</h6>");
	});

	it("코드 블록을 변환한다", () => {
		const md = "```typescript\nconst x = 1;\n```";
		const html = renderMarkdown(md);
		expect(html).toContain('<pre><code class="language-typescript">');
		expect(html).toContain("const x = 1;");
		expect(html).toContain("</code></pre>");
	});

	it("코드 블록 내부는 인라인 파싱하지 않는다", () => {
		const md = "```\n**bold** *italic* `code`\n```";
		const html = renderMarkdown(md);
		expect(html).not.toContain("<strong>");
		expect(html).not.toContain("<em>");
		expect(html).toContain("**bold** *italic* `code`");
	});

	it("코드 블록 내부 HTML을 이스케이프한다", () => {
		const md = '```\n<script>alert("xss")</script>\n```';
		const html = renderMarkdown(md);
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
	});

	it("비순서 리스트를 변환한다", () => {
		const md = "- item 1\n- item 2\n- item 3";
		const html = renderMarkdown(md);
		expect(html).toContain("<ul>");
		expect(html).toContain("<li>item 1</li>");
		expect(html).toContain("<li>item 2</li>");
		expect(html).toContain("<li>item 3</li>");
		expect(html).toContain("</ul>");
	});

	it("순서 리스트를 변환한다", () => {
		const md = "1. first\n2. second\n3. third";
		const html = renderMarkdown(md);
		expect(html).toContain("<ol>");
		expect(html).toContain("<li>first</li>");
		expect(html).toContain("<li>second</li>");
		expect(html).toContain("</ol>");
	});

	it("블록쿼트를 변환한다", () => {
		const md = "> This is a quote\n> with two lines";
		const html = renderMarkdown(md);
		expect(html).toContain("<blockquote>");
		expect(html).toContain("</blockquote>");
	});

	it("문단을 분리한다", () => {
		const md = "First paragraph\n\nSecond paragraph";
		const html = renderMarkdown(md);
		expect(html).toContain("<p>First paragraph</p>");
		expect(html).toContain("<p>Second paragraph</p>");
	});

	it("수평선을 변환한다", () => {
		const md = "above\n\n---\n\nbelow";
		const html = renderMarkdown(md);
		expect(html).toContain("<hr>");
	});

	it("인라인 요소가 문단 내에서 동작한다", () => {
		const md = "This has **bold** and *italic* and `code` and [link](url)";
		const html = renderMarkdown(md);
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<em>italic</em>");
		expect(html).toContain("<code>code</code>");
		expect(html).toContain('<a href="url">link</a>');
	});

	it("테이블을 변환한다", () => {
		const md = "| 헤더1 | 헤더2 |\n|------|------|\n| 셀1 | 셀2 |\n| 셀3 | 셀4 |";
		const html = renderMarkdown(md);
		expect(html).toContain("<table>");
		expect(html).toContain("<th>헤더1</th>");
		expect(html).toContain("<th>헤더2</th>");
		expect(html).toContain("<td>셀1</td>");
		expect(html).toContain("<td>셀4</td>");
		expect(html).toContain("</table>");
	});

	it("테이블 셀 내 인라인 마크다운을 처리한다", () => {
		const md = "| Name | Desc |\n|------|------|\n| **bold** | `code` |";
		const html = renderMarkdown(md);
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<code>code</code>");
	});

	it("빈 입력을 처리한다", () => {
		expect(renderMarkdown("")).toBe("");
	});

	it("언어 없는 코드 블록을 처리한다", () => {
		const md = "```\nplain code\n```";
		const html = renderMarkdown(md);
		expect(html).toContain("<pre><code>");
		expect(html).not.toContain("language-");
	});
});

describe("rewriteTilLinks", () => {
	it("til/{category}/{slug}.md 링크를 ../{category}/{slug}.html로 변환한다", () => {
		const html = '<a href="til/anki/spaced-repetition.md">Spaced Repetition</a>';
		expect(rewriteTilLinks(html)).toBe('<a href="../anki/spaced-repetition.html">Spaced Repetition</a>');
	});

	it("다른 카테고리 링크도 동일하게 변환한다", () => {
		const html = '<a href="til/javascript/closure.md">클로저</a>';
		expect(rewriteTilLinks(html)).toBe('<a href="../javascript/closure.html">클로저</a>');
	});

	it("여러 링크를 한번에 변환한다", () => {
		const html = '<a href="til/anki/cards.md">Cards</a> and <a href="til/react/hooks.md">Hooks</a>';
		const result = rewriteTilLinks(html);
		expect(result).toContain('href="../anki/cards.html"');
		expect(result).toContain('href="../react/hooks.html"');
	});

	it("외부 링크는 변환하지 않는다", () => {
		const html = '<a href="https://example.com/til/test.md">External</a>';
		expect(rewriteTilLinks(html)).toBe(html);
	});

	it("til/ 접두어가 없는 .md 링크는 변환하지 않는다", () => {
		const html = '<a href="notes/readme.md">Notes</a>';
		expect(rewriteTilLinks(html)).toBe(html);
	});

	describe("existingFiles로 missing-link 처리", () => {
		const existing = new Set(["til/anki/spaced-repetition.md", "til/react/hooks.md"]);

		it("존재하는 파일은 정상 링크로 변환한다", () => {
			const html = '<a href="til/anki/spaced-repetition.md">Spaced Repetition</a>';
			expect(rewriteTilLinks(html, existing)).toBe('<a href="../anki/spaced-repetition.html">Spaced Repetition</a>');
		});

		it("존재하지 않는 파일은 missing-link 클래스를 부여한다", () => {
			const html = '<a href="til/anki/unknown-topic.md">Unknown</a>';
			const result = rewriteTilLinks(html, existing);
			expect(result).toBe('<a class="missing-link" title="아직 작성되지 않은 문서">Unknown</a>');
			expect(result).not.toContain("href");
		});

		it("혼합 링크에서 존재하는 것만 활성 링크로 변환한다", () => {
			const html = '<a href="til/react/hooks.md">Hooks</a> and <a href="til/vue/reactivity.md">Reactivity</a>';
			const result = rewriteTilLinks(html, existing);
			expect(result).toContain('href="../react/hooks.html"');
			expect(result).toContain('class="missing-link"');
			expect(result).toContain("Reactivity");
		});

		it("existingFiles 없이 호출하면 모든 링크를 변환한다 (하위 호환)", () => {
			const html = '<a href="til/any/page.md">Page</a>';
			expect(rewriteTilLinks(html)).toBe('<a href="../any/page.html">Page</a>');
		});
	});
});
