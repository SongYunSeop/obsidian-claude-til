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
	/** 전체 매치 텍스트 (예: "[text](path.md)") */
	fullMatch: string;
	/** 링크 경로 (예: "til/typescript/generics.md") — () 안 */
	linkText: string;
	/** 표시 텍스트 (예: "제네릭 정리") — [] 안 */
	displayText: string;
	/** 매치 시작 인덱스 (0-based) */
	startIndex: number;
	/** 매치 끝 인덱스 (exclusive, 0-based) */
	endIndex: number;
}

/**
 * 텍스트에서 표준 마크다운 링크 `[text](path)`를 찾아 반환한다.
 * 이미지 문법 `![alt](img)` 는 제외한다.
 * 순수 함수 — 부수효과 없음, 단위 테스트 가능.
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
 * CJK/전각 문자 여부를 판별한다. (터미널에서 2셀 너비)
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
 * 문자열의 charIndex까지의 터미널 셀 너비를 계산한다.
 * 한글 등 전각 문자는 2셀, ASCII는 1셀.
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
	/** 전체 매치 텍스트 (예: "til/datadog/backlog.md") */
	fullMatch: string;
	/** 파일 경로 — fullMatch와 동일 */
	filePath: string;
	/** 매치 시작 인덱스 (0-based) */
	startIndex: number;
	/** 매치 끝 인덱스 (exclusive, 0-based) */
	endIndex: number;
}

/**
 * 텍스트에서 TIL 파일 경로 패턴 `til/category/slug.md`를 찾아 반환한다.
 * 마크다운 링크의 () 안에 있는 경로는 제외한다 (MarkdownLinkProvider가 처리).
 * 순수 함수 — 부수효과 없음, 단위 테스트 가능.
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
 * OSC 8 하이퍼링크 URI에서 vault 상대 경로를 추출한다.
 * file:///absolute/path/to/vault/til/topic/file.md → til/topic/file.md
 * 순수 함수 — 부수효과 없음, 단위 테스트 가능.
 */
export function parseOsc8Uri(uri: string, vaultPath: string): string | null {
	let filePath: string;

	if (uri.startsWith("file://")) {
		filePath = decodeURIComponent(uri.replace(/^file:\/\//, ""));
	} else if (uri.startsWith("/")) {
		filePath = uri;
	} else {
		// 상대 경로 (til/xxx/yyy.md 등)
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
 * xterm.js ILinkProvider 구현.
 * 터미널 버퍼에서 `til/category/slug.md` 파일 경로를 감지하고,
 * vault에 실제 존재하는 파일만 클릭 가능한 링크로 만든다.
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

		// 파일 존재 여부와 무관하게 링크를 만든다 (없는 파일은 클릭 시 생성)
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
 * xterm.js ILinkProvider 구현.
 * 터미널 버퍼에서 `[text](path)` 마크다운 링크를 감지하고,
 * 클릭 시 Obsidian에서 해당 노트를 연다.
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
		// 터미널의 buffer에서 해당 줄의 텍스트를 가져온다
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
				// .md 확장자 제거 후 Obsidian에 전달
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
	/** 시작 열 (0-based) */
	startCol: number;
	/** 끝 열 (0-based, exclusive) */
	endCol: number;
	/** OSC 8 URI */
	url: string;
}

/**
 * xterm.js ILinkProvider 구현.
 * terminal.parser.registerOscHandler(8, ...)로 OSC 8 시퀀스를 직접 추적하고,
 * IMarker 기반 위치 추적으로 버퍼 스크롤/트리밍에도 정확한 좌표를 유지한다.
 *
 * xterm.js 내장 OSC 8 linkHandler가 Electron 환경에서 activate를 호출하지 않는
 * 문제를 우회한다.
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
				// OSC 8 open: 링크 시작 위치 기록
				this.currentUrl = url;
				const buffer = terminal.buffer.active;
				this.currentStartCol = buffer.cursorX;
				this.openLine = buffer.baseY + buffer.cursorY;
			} else {
				// OSC 8 close: 마커 생성 + 엔트리 저장
				if (this.currentUrl) {
					const buffer = terminal.buffer.active;
					const closeLine = buffer.baseY + buffer.cursorY;
					const endCol = buffer.cursorX;

					// 단일 행 링크만 지원
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

							// 마커가 버퍼 트리밍으로 제거되면 엔트리도 정리
							marker.onDispose(() => {
								const idx = this.entries.indexOf(entry);
								if (idx !== -1) this.entries.splice(idx, 1);
							});
						}
					}

					this.currentUrl = null;
				}
			}

			return false; // xterm.js 기본 처리도 유지
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
