import type { App } from "obsidian";
import type {
	ILinkProvider,
	ILink,
	IBufferLine,
	ILinkDecorations,
	Terminal,
} from "@xterm/xterm";

export interface WikilinkMatch {
	/** 전체 매치 텍스트 (예: "[[note|alias]]") */
	fullMatch: string;
	/** 링크 대상 (예: "note") — pipe 앞 부분 */
	linkText: string;
	/** 표시 텍스트 (예: "alias") — pipe 뒤 부분, 없으면 linkText와 동일 */
	displayText: string;
	/** 매치 시작 인덱스 (0-based) */
	startIndex: number;
	/** 매치 끝 인덱스 (exclusive, 0-based) */
	endIndex: number;
}

/**
 * 텍스트에서 Obsidian 위키링크 `[[...]]`를 찾아 반환한다.
 * 순수 함수 — 부수효과 없음, 단위 테스트 가능.
 */
export function findWikilinks(text: string): WikilinkMatch[] {
	const regex = /\[\[([^\][\]]+)\]\]/g;
	const results: WikilinkMatch[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		const inner = match[1]!;
		const pipeIndex = inner.indexOf("|");
		const linkText = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner;
		const displayText = pipeIndex >= 0 ? inner.slice(pipeIndex + 1) : inner;

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

const LINK_DECORATIONS: ILinkDecorations = {
	pointerCursor: true,
	underline: true,
};

/**
 * xterm.js ILinkProvider 구현.
 * 터미널 버퍼에서 `[[위키링크]]`를 감지하고,
 * 클릭 시 Obsidian에서 해당 노트를 연다.
 */
export class WikilinkProvider implements ILinkProvider {
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
		const matches = findWikilinks(text);

		if (matches.length === 0) {
			callback(undefined);
			return;
		}

		// bash [[ condition ]] 등 false positive 방지:
		// 앞뒤 공백이 있는 매치는 노트 이름이 아니므로 제외
		const links: ILink[] = matches
			.filter((m) => m.linkText === m.linkText.trim())
			.map((m) => ({
				range: {
					start: { x: cellWidth(text, m.startIndex) + 1, y: bufferLineNumber },
					end: { x: cellWidth(text, m.endIndex), y: bufferLineNumber },
				},
				text: m.fullMatch,
				decorations: LINK_DECORATIONS,
				activate: () => {
					// basename만으로도 vault 내 노트를 찾을 수 있도록 먼저 검색
					const resolved = this.app.metadataCache.getFirstLinkpathDest(m.linkText, "");
					const linkPath = resolved ? resolved.path : m.linkText;
					this.app.workspace.openLinkText(linkPath, "", false);
				},
			}));

		callback(links.length > 0 ? links : undefined);
	}
}
