/**
 * Pure markdown → HTML conversion functions.
 * Supports only the core elements needed for TIL documents, without external libraries.
 */

/** Escapes HTML special characters (XSS prevention). */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Removes frontmatter (--- block). */
export function stripFrontmatter(md: string): string {
	if (!md.startsWith("---")) return md;
	const end = md.indexOf("\n---", 3);
	if (end === -1) return md;
	return md.slice(end + 4).replace(/^\n+/, "");
}

/** Converts inline markdown to HTML. Should not be called inside code blocks. */
export function renderInline(text: string): string {
	let result = escapeHtml(text);

	// Inline code (backtick) — inner content is not parsed further
	result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

	// Bold+italic (***text***)
	result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

	// Bold (**text**)
	result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

	// Italic (*text*)
	result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

	// Link [text](url) — blocks javascript:, data:, vbscript: schemes (XSS prevention)
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

/** Parses markdown into block tokens. */
function tokenize(md: string): BlockToken[] {
	const lines = md.split("\n");
	const tokens: BlockToken[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;

		// Skip blank lines
		if (line.trim() === "") {
			i++;
			continue;
		}

		// Horizontal rule
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
			tokens.push({ type: "hr", content: "" });
			i++;
			continue;
		}

		// Code block (``` or ~~~)
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

		// Heading
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

		// Blockquote
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

		// Unordered list (- or *)
		if (/^[\-\*]\s+/.test(line)) {
			const listLines: string[] = [];
			while (i < lines.length && /^[\-\*]\s+/.test(lines[i]!)) {
				listLines.push(lines[i]!.replace(/^[\-\*]\s+/, ""));
				i++;
			}
			tokens.push({ type: "ul", content: listLines.join("\n") });
			continue;
		}

		// Ordered list (1. 2. ...)
		if (/^\d+\.\s+/.test(line)) {
			const listLines: string[] = [];
			while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
				listLines.push(lines[i]!.replace(/^\d+\.\s+/, ""));
				i++;
			}
			tokens.push({ type: "ol", content: listLines.join("\n") });
			continue;
		}

		// Table (| col | col | format)
		if (line.includes("|") && line.trim().startsWith("|")) {
			const tableLines: string[] = [];
			while (i < lines.length && lines[i]!.trim().startsWith("|")) {
				tableLines.push(lines[i]!);
				i++;
			}
			tokens.push({ type: "table", content: tableLines.join("\n") });
			continue;
		}

		// Paragraph (consecutive non-blank lines)
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

/** Converts block tokens to HTML. */
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

				// Detect separator row (---|---)
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
 * Converts markdown to HTML.
 * frontmatter is automatically stripped.
 */
export function renderMarkdown(md: string): string {
	const body = stripFrontmatter(md);
	const tokens = tokenize(body);
	return renderTokens(tokens);
}

/**
 * Rewrites internal links for the static site.
 * Converts `til/{category}/{slug}.md` links in HTML to `../{category}/{slug}.html`.
 * Since TIL pages live at `{category}/{slug}.html`, go up to root with `../` then re-enter.
 *
 * If `existingFiles` is provided, links to documents not in that Set are rendered as inactive.
 * Set values must be in `til/{category}/{slug}.md` format.
 */
export function rewriteTilLinks(html: string, existingFiles?: Set<string>): string {
	return html.replace(
		/<a href="til\/([^"]+\.md)">([\s\S]*?)<\/a>/g,
		(_match, tilPath: string, text: string) => {
			const fullPath = `til/${tilPath}`;
			if (existingFiles && !existingFiles.has(fullPath)) {
				return `<a class="missing-link" title="Document not yet written">${text}</a>`;
			}
			const pathWithoutExt = tilPath.replace(/\.md$/, "");
			return `<a href="../${pathWithoutExt}.html">${text}</a>`;
		},
	);
}
