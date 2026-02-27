/**
 * 프로필 페이지, TIL 개별 페이지, 카테고리 인덱스 페이지 HTML 생성 순수 함수.
 * docs/style.css와 동일한 다크 테마 디자인 시스템을 사용한다.
 */

import { escapeHtml } from "./markdown";
import type { HeatmapCell } from "./stats";

export interface ProfileConfig {
	title: string;
	description: string;
	githubUrl?: string;
	baseUrl?: string; // 상대 경로 기본값: ""
	subtitle?: string; // 프로필 페이지 소개 문구
}

export interface TilEntry {
	title: string;
	slug: string;
	createdDate: string;
}

export interface CategoryTilGroup {
	name: string;
	tils: TilEntry[];
}

export interface TilPageData {
	title: string;
	category: string;
	createdDate: string;
	contentHtml: string;
	relatedTils?: Array<{ title: string; slug: string }>;
}

export interface CategoryPageData {
	category: string;
	tils: Array<{ title: string; slug: string; createdDate: string; summary: string }>;
}

export interface RecentTilEntry {
	title: string;
	slug: string;
	category: string;
	createdDate: string;
	summary: string;
}

/** 공통 CSS (다크 테마, docs/style.css 기반) */
export function getProfileCss(): string {
	return `
:root {
  --bg-primary: #0f0f17;
  --bg-secondary: #161625;
  --bg-card: #1c1c2e;
  --bg-card-hover: #222238;
  --bg-code: #12121e;
  --text-primary: #e4e4ef;
  --text-secondary: #9d9db5;
  --text-muted: #6b6b85;
  --accent: #7C3AED;
  --accent-light: #9b6cf7;
  --accent-glow: rgba(124, 58, 237, 0.15);
  --border: #2a2a42;
  --radius: 12px;
  --radius-lg: 16px;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace;
  --max-width: 800px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-font-smoothing: antialiased; }
body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.7;
}
.container {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 24px;
}
a { color: var(--accent-light); text-decoration: none; transition: color 0.2s; }
a:hover { color: #b794f6; }
code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--bg-code);
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid var(--border);
  color: var(--accent-light);
}
h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.3; letter-spacing: -0.03em; }

/* Breadcrumb */
.breadcrumb {
  padding: 20px 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.breadcrumb a { color: var(--text-secondary); }
.breadcrumb a:hover { color: var(--accent-light); }
.breadcrumb span { margin: 0 8px; }

/* Header */
.page-header {
  padding: 40px 0 32px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
}
.page-header h1 {
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  margin-bottom: 12px;
}
.page-header .meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.profile-subtitle {
  font-size: 1rem;
  color: var(--text-secondary);
  margin: 8px 0 4px;
  line-height: 1.5;
}
.badge {
  display: inline-block;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-light);
  background: var(--accent-glow);
  border: 1px solid var(--accent);
  border-radius: 999px;
}

/* TIL content */
.til-content { padding-bottom: 60px; }
.til-content h1 { font-size: 1.8rem; margin: 32px 0 16px; }
.til-content h2 { font-size: 1.4rem; margin: 28px 0 14px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.til-content h3 { font-size: 1.15rem; margin: 24px 0 12px; }
.til-content h4, .til-content h5, .til-content h6 { font-size: 1rem; margin: 20px 0 10px; }
.til-content p { margin: 0 0 16px; color: var(--text-secondary); }
.til-content pre {
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  overflow-x: auto;
  margin: 0 0 16px;
}
.til-content pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.85rem;
  color: var(--text-primary);
}
.til-content blockquote {
  border-left: 3px solid var(--accent);
  background: var(--bg-secondary);
  padding: 12px 20px;
  margin: 0 0 16px;
  border-radius: 0 var(--radius) var(--radius) 0;
}
.til-content blockquote p { color: var(--text-secondary); margin-bottom: 0; }
.til-content ul, .til-content ol {
  margin: 0 0 16px;
  padding-left: 24px;
  color: var(--text-secondary);
}
.til-content li { margin-bottom: 4px; }
.til-content a { color: var(--accent-light); }
.til-content a.missing-link { color: var(--text-secondary); text-decoration: underline dotted; cursor: default; }
.til-content hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}
.til-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
  font-size: 0.9rem;
}
.til-content th, .til-content td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
  color: var(--text-secondary);
}
.til-content th {
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-weight: 600;
}
.til-content tr:hover td {
  background: var(--bg-secondary);
}

/* Card list (category index, all TILs) */
.til-list { list-style: none; padding: 0; }
.til-list li {
  border-bottom: 1px solid var(--border);
}
.til-list li:last-child { border-bottom: none; }
.til-list a {
  display: block;
  padding: 16px 0;
  transition: background 0.15s;
}
.til-list a:hover { background: var(--bg-secondary); padding-left: 8px; }
.til-list .til-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-primary);
  display: block;
}
.til-list .til-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 4px;
}
.til-list .til-summary {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* Category groups (profile page) */
.category-group {
  margin-bottom: 8px;
}
.category-group summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  padding: 12px 0;
  color: var(--text-primary);
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.category-group summary::before {
  content: '\\25B6';
  font-size: 0.65rem;
  color: var(--text-muted);
  transition: transform 0.2s;
}
.category-group[open] summary::before {
  transform: rotate(90deg);
}
.category-group summary .count {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-muted);
}

/* Section */
.section {
  padding: 32px 0;
}
.section h2 {
  font-size: 1.3rem;
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

/* Footer */
.page-footer {
  padding: 24px 0;
  border-top: 1px solid var(--border);
  margin-top: 40px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 24px 0;
}
.summary-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  text-align: center;
}
.summary-card .card-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--accent-light);
  line-height: 1.2;
}
.summary-card .card-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Heatmap */
.heatmap-section { padding: 24px 0; }
.heatmap-section h2 {
  font-size: 1.3rem;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.heatmap-month-row {
  display: flex;
  gap: 4px;
  margin-bottom: 2px;
}
.heatmap-month-spacer {
  width: 28px;
  flex-shrink: 0;
}
.heatmap-month-labels {
  position: relative;
  font-size: 0.65rem;
  color: var(--text-muted);
  height: 16px;
}
.heatmap-month-label {
  position: absolute;
  top: 0;
  line-height: 16px;
  white-space: nowrap;
}
.heatmap-body {
  display: flex;
  gap: 4px;
}
.heatmap-day-labels {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 2px;
  font-size: 0.65rem;
  color: var(--text-muted);
  flex-shrink: 0;
  width: 28px;
}
.heatmap-day-labels > div {
  display: flex;
  align-items: center;
}
.heatmap-grid-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  justify-content: flex-end;
  padding: 32px 60px 0;
  margin: -32px -60px 0;
}
.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column;
  grid-auto-columns: 12px;
  gap: 2px;
  width: fit-content;
}
.heatmap-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--bg-card);
  position: relative;
  cursor: default;
}
.heatmap-cell[data-level="1"] { background: rgba(124, 58, 237, 0.3); }
.heatmap-cell[data-level="2"] { background: rgba(124, 58, 237, 0.5); }
.heatmap-cell[data-level="3"] { background: rgba(124, 58, 237, 0.7); }
.heatmap-cell[data-level="4"] { background: #7C3AED; }
/* Shield.io style tooltip: [date | count] */
.heatmap-cell[data-date]:hover::before,
.heatmap-cell[data-count]:hover::after {
  position: absolute;
  bottom: calc(100% + 6px);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  z-index: 100;
  pointer-events: none;
  color: #fff;
  padding: 4px 6px;
}
.heatmap-cell[data-date]:hover::before {
  content: attr(data-date);
  right: 50%;
  background: #555;
  border-radius: 4px 0 0 4px;
}
.heatmap-cell[data-count]:hover::after {
  content: attr(data-count);
  left: 50%;
  background: var(--accent);
  border-radius: 0 4px 4px 0;
}
.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--text-muted);
}
.heatmap-legend .heatmap-cell { display: inline-block; }

/* Recent TILs */
.recent-tils-section { padding: 24px 0; }
.recent-tils-section h2 {
  font-size: 1.3rem;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.recent-til-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
  transition: background 0.15s, border-color 0.15s;
}
.recent-til-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent);
}
.recent-til-card a {
  display: block;
  color: inherit;
}
.recent-til-card a:hover { color: inherit; }
.recent-til-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.recent-til-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
  flex: 1;
}
.recent-til-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.recent-til-summary {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* Share Button */
.share-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--accent-glow);
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent-light);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.share-btn:hover {
  background: var(--accent);
  color: #fff;
}
.share-btn.copied {
  background: var(--accent);
  color: #fff;
}

/* Related TILs */
.related-section {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}
.related-section h2 {
  font-size: 1.1rem;
  margin-bottom: 12px;
  color: var(--text-muted);
}

/* Tablet */
@media (max-width: 768px) {
  :root { --max-width: 100%; }
  .summary-cards { grid-template-columns: repeat(2, 1fr); }
  .heatmap-grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; justify-content: flex-start; }
  .recent-til-header { flex-wrap: wrap; }
  .recent-til-header .badge { order: 1; }
  .til-content table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
}

/* Mobile */
@media (max-width: 480px) {
  .container { padding: 0 12px; }
  .page-header { padding: 24px 0 20px; }
  .page-header h1 { font-size: 1.3rem; }
  .page-header .meta { font-size: 0.8rem; }
  .summary-cards { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .summary-card { padding: 12px 8px; }
  .summary-card .card-value { font-size: 1.3rem; }
  .summary-card .card-label { font-size: 0.7rem; }
  .heatmap-section { padding: 16px 0; }
  .heatmap-grid { grid-auto-columns: 8px; gap: 1px; grid-template-rows: repeat(7, 8px); }
  .heatmap-cell { width: 8px; height: 8px; }
  .heatmap-day-labels { font-size: 0.55rem; grid-template-rows: repeat(7, 8px); gap: 1px; width: 20px; }
  .heatmap-month-row { display: none; }
  .heatmap-body { gap: 2px; }
  .heatmap-grid-wrap {
    overflow: hidden;
    display: flex;
    justify-content: flex-end;
    padding: 28px 50px 0;
    margin: -28px -50px 0;
  }
  .heatmap-legend { font-size: 0.6rem; }
  .heatmap-cell[data-date]:hover::before,
  .heatmap-cell[data-count]:hover::after { font-size: 9px; padding: 3px 4px; }
  .recent-tils-section { padding: 16px 0; }
  .recent-til-card { padding: 12px; }
  .recent-til-title { font-size: 0.85rem; }
  .recent-til-summary { font-size: 0.78rem; }
  .badge { font-size: 0.65rem; padding: 2px 6px; }
  .breadcrumb { font-size: 0.78rem; padding: 12px 0; }
  .breadcrumb span { margin: 0 4px; }
  .til-content h1 { font-size: 1.4rem; margin: 24px 0 12px; }
  .til-content h2 { font-size: 1.2rem; margin: 20px 0 10px; }
  .til-content h3 { font-size: 1rem; }
  .til-content pre { padding: 10px 12px; }
  .til-content pre code { font-size: 0.75rem; }
  .til-content p { font-size: 0.9rem; }
  .til-content ul, .til-content ol { padding-left: 18px; font-size: 0.9rem; }
  .til-content table { font-size: 0.8rem; }
  .til-content th, .til-content td { padding: 6px 8px; }
  .til-list a { padding: 12px 0; }
  .til-list .til-title { font-size: 0.9rem; }
  .til-list .til-meta { font-size: 0.72rem; }
  .til-list .til-summary { font-size: 0.78rem; }
  .category-group summary { font-size: 0.9rem; padding: 10px 0; }
  .section h2 { font-size: 1.1rem; }
  .page-footer { font-size: 0.72rem; padding: 16px 0; margin-top: 24px; }
}
`;
}

function baseUrl(config: ProfileConfig): string {
	return config.baseUrl ?? "";
}

interface OgMeta {
	title: string;
	description: string;
	type?: string;
}

function htmlShell(title: string, css: string, body: string, config: ProfileConfig, og?: OgMeta): string {
	const base = baseUrl(config);
	const ogTitle = og?.title ?? title;
	const ogDesc = og?.description ?? config.description;
	const ogType = og?.type ?? "website";
	return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(ogDesc)}">
<meta property="og:type" content="${ogType}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(ogDesc)}">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
${base ? `<base href="${escapeHtml(base)}">` : ""}
</head>
<body>
${body}
</body>
</html>`;
}

/** 개별 TIL 페이지 HTML을 생성한다. */
export function generateTilPageHtml(data: TilPageData, config: ProfileConfig): string {
	// TIL 페이지는 {category}/{slug}.html에 위치하므로
	// 홈: ../index.html, 카테고리: index.html (같은 디렉토리)
	const body = `
<div class="container">
  <nav class="breadcrumb">
    <a href="../index.html">${escapeHtml(config.title)}</a>
    <span>/</span>
    <a href="index.html">${escapeHtml(data.category)}</a>
    <span>/</span>
    ${escapeHtml(data.title)}
  </nav>
  <header class="page-header">
    <h1>${escapeHtml(data.title)}</h1>
    <div class="meta">
      <span class="badge">${escapeHtml(data.category)}</span>
      <span>${escapeHtml(data.createdDate)}</span>
      <button class="share-btn" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.classList.add('copied');this.innerHTML='Copied!';setTimeout(()=>{this.classList.remove('copied');this.innerHTML='<svg width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\\'/><path d=\\'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\\'/></svg> Share'},1500)})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Share</button>
    </div>
  </header>
  <article class="til-content">
    ${data.contentHtml}
  </article>
  ${data.relatedTils && data.relatedTils.length > 0 ? `<div class="related-section">
    <h2>${escapeHtml(data.category)}의 다른 TIL</h2>
    <ul class="til-list">
      ${data.relatedTils.map((t) => `<li><a href="${escapeHtml(t.slug)}.html"><span class="til-title">${escapeHtml(t.title)}</span></a></li>`).join("\n")}
    </ul>
  </div>` : ""}
  <footer class="page-footer">
    <a href="../index.html">${escapeHtml(config.title)}</a>
  </footer>
</div>`;
	const ogDesc = data.contentHtml.replace(/<[^>]*>/g, "").slice(0, 150).trim();
	return htmlShell(`${data.title} — ${config.title}`, getProfileCss(), body, config, {
		title: `${data.title} — ${config.title}`,
		description: ogDesc,
		type: "article",
	});
}

/** 카테고리 인덱스 페이지 HTML을 생성한다. */
export function generateCategoryIndexHtml(data: CategoryPageData, config: ProfileConfig): string {
	const tilItems = data.tils
		.map((t) => {
			const summaryHtml = t.summary ? `<span class="til-summary">${escapeHtml(t.summary)}</span>` : "";
			return `<li>
  <a href="${escapeHtml(t.slug)}.html">
    <span class="til-title">${escapeHtml(t.title)}</span>
    <span class="til-meta">${escapeHtml(t.createdDate)}</span>
    ${summaryHtml}
  </a>
</li>`;
		})
		.join("\n");

	const body = `
<div class="container">
  <nav class="breadcrumb">
    <a href="../index.html">${escapeHtml(config.title)}</a>
    <span>/</span>
    ${escapeHtml(data.category)}
  </nav>
  <header class="page-header">
    <h1>${escapeHtml(data.category)}</h1>
    <div class="meta">
      <span>${data.tils.length} TILs</span>
    </div>
  </header>
  <div class="section">
    <ul class="til-list">
      ${tilItems}
    </ul>
  </div>
  <footer class="page-footer">
    <a href="../index.html">${escapeHtml(config.title)}</a>
  </footer>
</div>`;
	return htmlShell(`${data.category} — ${config.title}`, getProfileCss(), body, config, {
		title: `${data.category} — ${config.title}`,
		description: `${data.tils.length} TILs about ${data.category}`,
	});
}

/** 프로필 페이지에 삽입할 전체 TIL 목록 HTML을 생성한다 (카테고리별 접이식). */
export function renderAllTilsHtml(categories: CategoryTilGroup[]): string {
	if (categories.length === 0) return "";

	const totalCount = categories.reduce((sum, c) => sum + c.tils.length, 0);
	const groups = categories
		.map((cat, idx) => {
			const items = cat.tils
				.map(
					(t) =>
						`<li><a href="${escapeHtml(cat.name)}/${escapeHtml(t.slug)}.html"><span class="til-title">${escapeHtml(t.title)}</span><span class="til-meta">${escapeHtml(t.createdDate)}</span></a></li>`,
				)
				.join("\n");
			const openAttr = idx === 0 ? " open" : "";
			return `<details class="category-group"${openAttr}>
<summary>${escapeHtml(cat.name)} <span class="count">(${cat.tils.length})</span></summary>
<ul class="til-list">
${items}
</ul>
</details>`;
		})
		.join("\n");

	return `<div class="section">
<h2>All TILs (${totalCount})</h2>
${groups}
</div>`;
}

/** Summary Cards (4개 통계 카드 한 행) HTML을 생성한다. */
export function renderSummaryCardsHtml(
	totalTils: number,
	categoryCount: number,
	thisWeekCount: number,
	streak: number,
): string {
	return `<div class="summary-cards">
  <div class="summary-card">
    <div class="card-value">${totalTils}</div>
    <div class="card-label">Total TILs</div>
  </div>
  <div class="summary-card">
    <div class="card-value">${categoryCount}</div>
    <div class="card-label">Categories</div>
  </div>
  <div class="summary-card">
    <div class="card-value">${thisWeekCount}</div>
    <div class="card-label">This Week</div>
  </div>
  <div class="summary-card">
    <div class="card-value">${streak}</div>
    <div class="card-label">Streak</div>
  </div>
</div>`;
}

/** 최근 TIL 목록 (최대 5개) HTML을 생성한다. */
export function renderRecentTilsHtml(recent: RecentTilEntry[]): string {
	if (recent.length === 0) return "";

	const cards = recent
		.map((t) => {
			const summaryHtml = t.summary
				? `<div class="recent-til-summary">${escapeHtml(t.summary)}</div>`
				: "";
			return `<div class="recent-til-card">
  <a href="${escapeHtml(t.category)}/${escapeHtml(t.slug)}.html">
    <div class="recent-til-header">
      <span class="recent-til-title">${escapeHtml(t.title)}</span>
      <span class="badge">${escapeHtml(t.category)}</span>
    </div>
    <div class="recent-til-meta">${escapeHtml(t.createdDate)}</div>
    ${summaryHtml}
  </a>
</div>`;
		})
		.join("\n");

	return `<div class="recent-tils-section">
<h2>Recent TILs</h2>
${cards}
</div>`;
}

/** 히트맵 셀 배열을 HTML로 렌더링한다. 요일 레이블(Mon/Wed/Fri), 월 레이블, hover 툴팁 포함. */
export function renderHeatmapHtml(cells: HeatmapCell[], streak: number, totalTils: number): string {
	if (cells.length === 0) return "";

	// 첫 셀의 요일에 맞춰 빈 셀 추가 (월요일=0 기준)
	const firstDate = new Date(cells[0]!.date);
	const dow = firstDate.getDay(); // 0=Sun
	// 월요일 시작: Sun→6 empty, Mon→0, Tue→1, ..., Sat→5
	const emptyCount = dow === 0 ? 6 : dow - 1;

	// 빈 셀 HTML
	const emptyCells = Array.from(
		{ length: emptyCount },
		() => '<div class="heatmap-cell" data-level="0"></div>',
	).join("\n");

	// 실제 셀 HTML (shield.io 스타일 tooltip: data-date + data-count)
	const cellsHtml = cells
		.map((c) => {
			const countLabel = `${c.count} TIL${c.count !== 1 ? "s" : ""}`;
			return `<div class="heatmap-cell" data-level="${c.level}" data-date="${c.date}" data-count="${countLabel}"></div>`;
		})
		.join("\n");

	// 월 레이블 계산: 각 열(주)의 첫 번째 셀 날짜를 기준으로 월이 바뀌는 지점을 찾는다
	// 총 열 수 = ceil((emptyCount + cells.length) / 7)
	const totalCells = emptyCount + cells.length;
	const totalCols = Math.ceil(totalCells / 7);
	// 각 열 인덱스에 해당하는 날짜: emptyCount개 빈 셀 이후 cells 배열 시작
	// 열 col의 첫 번째 실제 셀 인덱스 = col * 7 - emptyCount (0-based in cells array)
	const monthLabels: { col: number; label: string }[] = [];
	let lastMonth = -1;
	for (let col = 0; col < totalCols; col++) {
		const cellIdx = col * 7 - emptyCount;
		if (cellIdx >= 0 && cellIdx < cells.length) {
			const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
			const monthIdx = parseInt(cells[cellIdx]!.date.split("-")[1]!, 10) - 1;
			if (monthIdx !== lastMonth) {
				const label = monthNames[monthIdx]!;
				monthLabels.push({ col, label });
				lastMonth = monthIdx;
			}
		}
	}

	// 월 레이블 HTML: 각 레이블을 열의 정확한 x 위치에 absolute로 배치
	const colWidth = 14; // 12px cell + 2px gap
	const monthLabelHtmlParts = monthLabels.map(({ col, label }) => {
		const left = col * colWidth;
		return `<span class="heatmap-month-label" style="left:${left}px">${escapeHtml(label)}</span>`;
	});
	const monthLabelsHtml = monthLabelHtmlParts.join("");

	// 요일 레이블: Mon, Wed, Fri のみ表示
	// 행 순서: row0=Mon, row1=Tue, row2=Wed, row3=Thu, row4=Fri, row5=Sat, row6=Sun
	const dayLabelRows = ["Mon", "", "Wed", "", "Fri", "", ""];
	const dayLabelsHtml = dayLabelRows
		.map((d) => (d ? `<div>${d}</div>` : "<div>&nbsp;</div>"))
		.join("\n");

	return `<div class="heatmap-section">
<h2>Activity</h2>
<div class="heatmap-month-row">
  <div class="heatmap-month-spacer"></div>
  <div class="heatmap-month-labels">${monthLabelsHtml}</div>
</div>
<div class="heatmap-body">
  <div class="heatmap-day-labels">
${dayLabelsHtml}
  </div>
  <div class="heatmap-grid-wrap">
    <div class="heatmap-grid">
${emptyCells}
${cellsHtml}
    </div>
  </div>
</div>
<div class="heatmap-legend">
Less
<div class="heatmap-cell" data-level="0"></div>
<div class="heatmap-cell" data-level="1"></div>
<div class="heatmap-cell" data-level="2"></div>
<div class="heatmap-cell" data-level="3"></div>
<div class="heatmap-cell" data-level="4"></div>
More
</div>
</div>`;
}

/** 프로필 페이지 HTML을 생성한다. */
export function generateProfileHtml(
	config: ProfileConfig,
	summaryCardsHtml: string,
	heatmapHtml: string,
	recentTilsHtml: string,
	allTilsHtml: string,
): string {
	const githubLink = config.githubUrl
		? `<p><a href="${escapeHtml(config.githubUrl)}" target="_blank" rel="noopener">GitHub</a></p>`
		: "";

	const subtitleHtml = config.subtitle
		? `<p class="profile-subtitle">${escapeHtml(config.subtitle)}</p>`
		: "";

	const body = `
<div class="container">
  <header class="page-header">
    <h1>${escapeHtml(config.title)}</h1>
    ${subtitleHtml}
    <div class="meta">
      <span>${escapeHtml(config.description)}</span>
    </div>
    ${githubLink}
  </header>
  ${summaryCardsHtml}
  ${heatmapHtml}
  ${recentTilsHtml}
  ${allTilsHtml}
  <footer class="page-footer">
    Built with <a href="https://github.com/SongYunSeop/oh-my-til" target="_blank" rel="noopener">oh-my-til</a> &mdash; Start your own TIL
  </footer>
</div>`;
	return htmlShell(config.title, getProfileCss(), body, config, {
		title: config.title,
		description: config.description,
	});
}
