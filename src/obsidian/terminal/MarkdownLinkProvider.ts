import { type App, FileSystemAdapter } from "obsidian";
import type {
	ILinkProvider,
	ILink,
	IBufferLine,
	ILinkDecorations,
	IDisposable,
	IMarker,
	Terminal,
} from "@xterm/xterm";

export interface MarkdownLinkMatch {
	/** Full match text (e.g. "[text](path.md)") */
	fullMatch: string;
	/** Link path (e.g. "til/typescript/generics.md") — inside () */
	linkText: string;
	/** Display text (e.g. "Generics Summary") — inside [] */
	displayText: string;
	/** Match start index (0-based) */
	startIndex: number;
	/** Match end index (exclusive, 0-based) */
	endIndex: number;
}

/**
 * Finds and returns standard markdown links `[text](path)` in the given text.
 * Excludes image syntax `![alt](img)`.
 * Pure function — no side effects, unit-testable.
 */
export function findMarkdownLinks(text: string): MarkdownLinkMatch[] {
	const regex = /(?<!!)\[([^\[\]]*)\]\(([^()]+)\)/g;
	const results: MarkdownLinkMatch[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		const displayText = match[1]! || match[2]!;
		const linkText = match[2]!;

		results.push({
			fullMatch: match[0],
			linkText,
			displayText,
			startIndex: match.index,
			endIndex: match.index + match[0].length,
		});
	}

	return results;
}

/**
 * Checks if a character is CJK/fullwidth (occupies 2 cells in terminal).
 */
export function isFullWidth(code: number): boolean {
	return (
		(code >= 0x1100 && code <= 0x115F) ||  // Hangul Jamo
		(code >= 0x2E80 && code <= 0x303E) ||  // CJK Radicals, Kangxi, Symbols
		(code >= 0x3040 && code <= 0x33BF) ||  // Hiragana, Katakana, Bopomofo
		(code >= 0x3400 && code <= 0x4DBF) ||  // CJK Extension A
		(code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
		(code >= 0xAC00 && code <= 0xD7AF) ||  // Hangul Syllables
		(code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compatibility Ideographs
		(code >= 0xFE10 && code <= 0xFE19) ||  // Vertical Forms
		(code >= 0xFE30 && code <= 0xFE6F) ||  // CJK Compatibility Forms
		(code >= 0xFF01 && code <= 0xFF60) ||  // Fullwidth Forms
		(code >= 0xFFE0 && code <= 0xFFE6) ||  // Fullwidth Signs
		(code >= 0x20000 && code <= 0x2FFFD) || // CJK Extension B-F
		(code >= 0x30000 && code <= 0x3FFFD)    // CJK Extension G
	);
}

/**
 * Calculates the terminal cell width up to charIndex in the string.
 * CJK/fullwidth characters count as 2 cells, ASCII as 1.
 */
export function cellWidth(text: string, charIndex: number): number {
	let width = 0;
	for (let i = 0; i < charIndex; i++) {
		const code = text.codePointAt(i)!;
		width += isFullWidth(code) ? 2 : 1;
		if (code > 0xFFFF) i++; // surrogate pair
	}
	return width;
}

export interface FilepathMatch {
	/** Full match text (e.g. "til/datadog/backlog.md") */
	fullMatch: string;
	/** File path — same as fullMatch */
	filePath: string;
	/** Match start index (0-based) */
	startIndex: number;
	/** Match end index (exclusive, 0-based) */
	endIndex: number;
}

/**
 * Finds TIL file path patterns `til/category/slug.md` in text.
 * Excludes paths inside markdown link parentheses (handled by MarkdownLinkProvider).
 * Pure function — no side effects, unit-testable.
 */
export function findTilFilePaths(text: string): FilepathMatch[] {
	const regex = /(?<!\()til\/[\w가-힣-]+(?:\/[\w가-힣-]+)*\.md/g;
	const results: FilepathMatch[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		results.push({
			fullMatch: match[0],
			filePath: match[0],
			startIndex: match.index,
			endIndex: match.index + match[0].length,
		});
	}

	return results;
}

/**
 * Extracts a vault-relative path from an OSC 8 hyperlink URI.
 * file:///absolute/path/to/vault/til/topic/file.md → til/topic/file.md
 * Pure function — no side effects, unit-testable.
 */
export function parseOsc8Uri(uri: string, vaultPath: string): string | null {
	let filePath: string;

	if (uri.startsWith("file://")) {
		filePath = decodeURIComponent(uri.replace(/^file:\/\//, ""));
	} else if (uri.startsWith("/")) {
		filePath = uri;
	} else {
		// Relative path (til/xxx/yyy.md etc.)
		return uri;
	}

	const normalizedVault = vaultPath.endsWith("/") ? vaultPath : vaultPath + "/";
	if (filePath.startsWith(normalizedVault)) {
		return filePath.slice(normalizedVault.length);
	}

	return null;
}

const LINK_DECORATIONS: ILinkDecorations = {
	pointerCursor: true,
	underline: true,
};

/**
 * xterm.js ILinkProvider implementation.
 * Detects `til/category/slug.md` file paths in the terminal buffer
 * and turns them into clickable links (creates file on click if missing).
 */
export class FilepathLinkProvider implements ILinkProvider {
	private terminal: Terminal;

	constructor(private app: App, terminal: Terminal) {
		this.terminal = terminal;
	}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const buffer = this.terminal.buffer.active;
		const line: IBufferLine | undefined = buffer.getLine(bufferLineNumber - 1);
		if (!line) {
			callback(undefined);
			return;
		}

		const text = line.translateToString();
		const matches = findTilFilePaths(text);

		if (matches.length === 0) {
			callback(undefined);
			return;
		}

		// Create links regardless of file existence (missing files created on click)
		const links: ILink[] = matches
			.map((m) => ({
				range: {
					start: { x: cellWidth(text, m.startIndex) + 1, y: bufferLineNumber },
					end: { x: cellWidth(text, m.endIndex), y: bufferLineNumber },
				},
				text: m.fullMatch,
				decorations: LINK_DECORATIONS,
				activate: () => {
					const pathWithoutExt = m.filePath.replace(/\.md$/, "");
					const resolved = this.app.metadataCache.getFirstLinkpathDest(pathWithoutExt, "");
					const linkPath = resolved ? resolved.path : pathWithoutExt;
					this.app.workspace.openLinkText(linkPath, "", false);
				},
			}));

		callback(links.length > 0 ? links : undefined);
	}
}

/**
 * xterm.js ILinkProvider implementation.
 * Detects `[text](path)` markdown links in the terminal buffer
 * and opens the corresponding note in Obsidian on click.
 */
export class MarkdownLinkProvider implements ILinkProvider {
	private terminal: Terminal;

	constructor(private app: App, terminal: Terminal) {
		this.terminal = terminal;
	}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		// Get the text of the line from the terminal buffer
		const buffer = this.terminal.buffer.active;
		const line: IBufferLine | undefined = buffer.getLine(bufferLineNumber - 1);
		if (!line) {
			callback(undefined);
			return;
		}

		const text = line.translateToString();
		const matches = findMarkdownLinks(text);

		if (matches.length === 0) {
			callback(undefined);
			return;
		}

		const links: ILink[] = matches.map((m) => ({
			range: {
				start: { x: cellWidth(text, m.startIndex) + 1, y: bufferLineNumber },
				end: { x: cellWidth(text, m.endIndex), y: bufferLineNumber },
			},
			text: m.fullMatch,
			decorations: LINK_DECORATIONS,
			activate: () => {
				// Strip .md extension before passing to Obsidian
				const pathWithoutExt = m.linkText.replace(/\.md$/, "");
				const resolved = this.app.metadataCache.getFirstLinkpathDest(pathWithoutExt, "");
				const linkPath = resolved ? resolved.path : pathWithoutExt;
				this.app.workspace.openLinkText(linkPath, "", false);
			},
		}));

		callback(links.length > 0 ? links : undefined);
	}
}

interface Osc8MarkerEntry {
	marker: IMarker;
	/** Start column (0-based) */
	startCol: number;
	/** End column (0-based, exclusive) */
	endCol: number;
	/** OSC 8 URI */
	url: string;
}

/**
 * xterm.js ILinkProvider implementation.
 * Tracks OSC 8 sequences via terminal.parser.registerOscHandler(8, ...),
 * using IMarker-based position tracking for accurate coordinates across buffer scroll/trimming.
 *
 * Works around the issue where xterm.js built-in OSC 8 linkHandler
 * does not call activate in Electron environments.
 */
export class Osc8LinkProvider implements ILinkProvider {
	private terminal: Terminal;
	private app: App;
	private entries: Osc8MarkerEntry[] = [];
	private currentUrl: string | null = null;
	private currentStartCol = -1;
	private openLine = -1;
	private disposables: IDisposable[] = [];

	constructor(app: App, terminal: Terminal) {
		this.app = app;
		this.terminal = terminal;

		this.disposables.push(terminal.parser.registerOscHandler(8, (data: string) => {
			const semicolonIndex = data.indexOf(";");
			const url = semicolonIndex >= 0 ? data.slice(semicolonIndex + 1) : "";

			if (url) {
				// OSC 8 open: record link start position
				this.currentUrl = url;
				const buffer = terminal.buffer.active;
				this.currentStartCol = buffer.cursorX;
				this.openLine = buffer.baseY + buffer.cursorY;
			} else {
				// OSC 8 close: create marker + save entry
				if (this.currentUrl) {
					const buffer = terminal.buffer.active;
					const closeLine = buffer.baseY + buffer.cursorY;
					const endCol = buffer.cursorX;

					// Only single-line links supported
					if (closeLine === this.openLine) {
						const marker = terminal.registerMarker(0);
						if (marker) {
							const entry: Osc8MarkerEntry = {
								marker,
								startCol: this.currentStartCol,
								endCol,
								url: this.currentUrl,
							};
							this.entries.push(entry);

							// Clean up entry when marker is disposed by buffer trimming
							marker.onDispose(() => {
								const idx = this.entries.indexOf(entry);
								if (idx !== -1) this.entries.splice(idx, 1);
							});
						}
					}

					this.currentUrl = null;
				}
			}

			return false; // Keep xterm.js default handling
		}));
	}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const targetLine = bufferLineNumber - 1;
		const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();

		const links: ILink[] = [];
		for (const entry of this.entries) {
			if (entry.marker.line !== targetLine) continue;

			const relativePath = parseOsc8Uri(entry.url, vaultPath);
			if (!relativePath) continue;

			links.push({
				range: {
					start: { x: entry.startCol + 1, y: bufferLineNumber },
					end: { x: entry.endCol, y: bufferLineNumber },
				},
				text: entry.url,
				decorations: LINK_DECORATIONS,
				activate: () => {
					const pathWithoutExt = relativePath.replace(/\.md$/, "");
					const resolved = this.app.metadataCache.getFirstLinkpathDest(pathWithoutExt, "");
					const linkPath = resolved ? resolved.path : pathWithoutExt;
					this.app.workspace.openLinkText(linkPath, "", false);
				},
			});
		}

		callback(links.length > 0 ? links : undefined);
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
		const toDispose = [...this.entries];
		this.entries = [];
		for (const entry of toDispose) {
			entry.marker.dispose();
		}
	}
}
