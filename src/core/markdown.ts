/**
 * 마크다운 → HTML 순수 변환 함수.
 * 외부 라이브러리 없이 TIL 문서에 필요한 핵심 요소만 지원한다.
 */

/** HTML 특수문자를 이스케이프한다 (XSS 방지). */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** frontmatter(--- 블록)를 제거한다. */
export function stripFrontmatter(md: string): string {
	if (!md.startsWith("---")) return md;
	const end = md.indexOf("\n---", 3);
	if (end === -1) return md;
	return md.slice(end + 4).replace(/^\n+/, "");
}

/** 인라인 마크다운을 HTML로 변환한다. 코드 블록 내부에서는 호출하지 않는다. */
export function renderInline(text: string): string {
	let result = escapeHtml(text);

	// 인라인 코드 (backtick) — 내부는 추가 파싱하지 않음
	result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

	// 볼드+이탤릭 (***text***)
	result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

	// 볼드 (**text**)
	result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

	// 이탤릭 (*text*)
	result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

	// 링크 [text](url) — javascript:, data:, vbscript: 스킴 차단 (XSS 방지)
	result = result.replace(
		/\[([^\]]*)\]\(([^)]+)\)/g,
		(_match: string, text: string, url: string) => {
			if (/^(javascript|data|vbscript):/i.test(url.trim())) {
				return text;
			}
			return `<a href="${url}">${text}</a>`;
		},
	);

	return result;
}

interface BlockToken {
	type: "heading" | "code" | "blockquote" | "ul" | "ol" | "paragraph" | "hr" | "table";
	content: string;
	level?: number; // heading level or list depth
	lang?: string; // code block language
}

/** 마크다운을 블록 토큰으로 파싱한다. */
function tokenize(md: string): BlockToken[] {
	const lines = md.split("\n");
	const tokens: BlockToken[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;

		// 빈 줄 건너뛰기
		if (line.trim() === "") {
			i++;
			continue;
		}

		// 수평선
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
			tokens.push({ type: "hr", content: "" });
			i++;
			continue;
		}

		// 코드 블록 (``` 또는 ~~~)
		const codeFenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);
		if (codeFenceMatch) {
			const fence = codeFenceMatch[1]!;
			const lang = codeFenceMatch[2]!.trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length) {
				if (lines[i]!.startsWith(fence.charAt(0).repeat(fence.length))) {
					i++;
					break;
				}
				codeLines.push(lines[i]!);
				i++;
			}
			tokens.push({ type: "code", content: codeLines.join("\n"), lang });
			continue;
		}

		// 헤딩
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			tokens.push({
				type: "heading",
				content: headingMatch[2]!,
				level: headingMatch[1]!.length,
			});
			i++;
			continue;
		}

		// 블록쿼트
		if (line.startsWith(">")) {
			const bqLines: string[] = [];
			while (i < lines.length && (lines[i]!.startsWith(">") || (lines[i]!.trim() !== "" && bqLines.length > 0 && !lines[i]!.startsWith("#")))) {
				if (lines[i]!.startsWith(">")) {
					bqLines.push(lines[i]!.replace(/^>\s?/, ""));
				} else {
					break;
				}
				i++;
			}
			tokens.push({ type: "blockquote", content: bqLines.join("\n") });
			continue;
		}

		// 비순서 리스트 (- 또는 *)
		if (/^[\-\*]\s+/.test(line)) {
			const listLines: string[] = [];
			while (i < lines.length && /^[\-\*]\s+/.test(lines[i]!)) {
				listLines.push(lines[i]!.replace(/^[\-\*]\s+/, ""));
				i++;
			}
			tokens.push({ type: "ul", content: listLines.join("\n") });
			continue;
		}

		// 순서 리스트 (1. 2. ...)
		if (/^\d+\.\s+/.test(line)) {
			const listLines: string[] = [];
			while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
				listLines.push(lines[i]!.replace(/^\d+\.\s+/, ""));
				i++;
			}
			tokens.push({ type: "ol", content: listLines.join("\n") });
			continue;
		}

		// 테이블 (| col | col | 형식)
		if (line.includes("|") && line.trim().startsWith("|")) {
			const tableLines: string[] = [];
			while (i < lines.length && lines[i]!.trim().startsWith("|")) {
				tableLines.push(lines[i]!);
				i++;
			}
			tokens.push({ type: "table", content: tableLines.join("\n") });
			continue;
		}

		// 문단 (연속된 비빈 줄)
		const paraLines: string[] = [];
		while (i < lines.length && lines[i]!.trim() !== "" && !lines[i]!.startsWith("#") && !lines[i]!.startsWith(">") && !/^[\-\*]\s+/.test(lines[i]!) && !/^\d+\.\s+/.test(lines[i]!) && !/^(`{3,}|~{3,})/.test(lines[i]!) && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!.trim()) && !(lines[i]!.includes("|") && lines[i]!.trim().startsWith("|"))) {
			paraLines.push(lines[i]!);
			i++;
		}
		if (paraLines.length > 0) {
			tokens.push({ type: "paragraph", content: paraLines.join("\n") });
		}
	}

	return tokens;
}

/** 블록 토큰을 HTML로 변환한다. */
function renderTokens(tokens: BlockToken[]): string {
	const parts: string[] = [];

	for (const token of tokens) {
		switch (token.type) {
			case "heading": {
				const tag = `h${token.level}`;
				parts.push(`<${tag}>${renderInline(token.content)}</${tag}>`);
				break;
			}
			case "code": {
				const langAttr = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : "";
				parts.push(`<pre><code${langAttr}>${escapeHtml(token.content)}</code></pre>`);
				break;
			}
			case "blockquote": {
				const inner = renderMarkdown(token.content);
				parts.push(`<blockquote>${inner}</blockquote>`);
				break;
			}
			case "ul": {
				const items = token.content.split("\n").map((item) => `<li>${renderInline(item)}</li>`).join("\n");
				parts.push(`<ul>\n${items}\n</ul>`);
				break;
			}
			case "ol": {
				const items = token.content.split("\n").map((item) => `<li>${renderInline(item)}</li>`).join("\n");
				parts.push(`<ol>\n${items}\n</ol>`);
				break;
			}
			case "paragraph": {
				parts.push(`<p>${renderInline(token.content)}</p>`);
				break;
			}
			case "table": {
				const rows = token.content.split("\n").filter((r) => r.trim() !== "");
				if (rows.length < 2) break;

				const parseRow = (row: string): string[] =>
					row.split("|").slice(1, -1).map((cell) => cell.trim());

				// 구분선 행(---|---) 판별
				const isSeparator = (row: string): boolean =>
					parseRow(row).every((cell) => /^:?-+:?$/.test(cell));

				const headerCells = parseRow(rows[0]!);
				const hasSeparator = rows.length >= 2 && isSeparator(rows[1]!);
				const dataStart = hasSeparator ? 2 : 1;

				let html = "<table>\n<thead>\n<tr>";
				for (const cell of headerCells) {
					html += `<th>${renderInline(cell)}</th>`;
				}
				html += "</tr>\n</thead>\n<tbody>";
				for (let r = dataStart; r < rows.length; r++) {
					if (isSeparator(rows[r]!)) continue;
					const cells = parseRow(rows[r]!);
					html += "\n<tr>";
					for (const cell of cells) {
						html += `<td>${renderInline(cell)}</td>`;
					}
					html += "</tr>";
				}
				html += "\n</tbody>\n</table>";
				parts.push(html);
				break;
			}
			case "hr": {
				parts.push("<hr>");
				break;
			}
		}
	}

	return parts.join("\n");
}

/**
 * 마크다운을 HTML로 변환한다.
 * frontmatter는 자동 제거된다.
 */
export function renderMarkdown(md: string): string {
	const body = stripFrontmatter(md);
	const tokens = tokenize(body);
	return renderTokens(tokens);
}

/**
 * 정적 사이트용 내부 링크 변환.
 * HTML 내 `til/{category}/{slug}.md` 링크를 `../{category}/{slug}.html`로 변환한다.
 * TIL 페이지가 `{category}/{slug}.html`에 위치하므로 `../`로 루트까지 올라간 뒤 재진입.
 *
 * `existingFiles`가 주어지면 해당 Set에 없는 문서의 링크는 비활성 처리한다.
 * Set 값은 `til/{category}/{slug}.md` 형식이어야 한다.
 */
export function rewriteTilLinks(html: string, existingFiles?: Set<string>): string {
	return html.replace(
		/<a href="til\/([^"]+\.md)">([\s\S]*?)<\/a>/g,
		(_match, tilPath: string, text: string) => {
			const fullPath = `til/${tilPath}`;
			if (existingFiles && !existingFiles.has(fullPath)) {
				return `<a class="missing-link" title="아직 작성되지 않은 문서">${text}</a>`;
			}
			const pathWithoutExt = tilPath.replace(/\.md$/, "");
			return `<a href="../${pathWithoutExt}.html">${text}</a>`;
		},
	);
}
