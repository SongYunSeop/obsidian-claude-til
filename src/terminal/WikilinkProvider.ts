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

		// 존재하는 노트만 링크로 표시 (false positive 방지)
		const links: ILink[] = matches
			.filter((m) => {
				const resolved = this.app.metadataCache.getFirstLinkpathDest(m.linkText, "");
				return resolved !== null;
			})
			.map((m) => ({
				range: {
					start: { x: m.startIndex + 1, y: bufferLineNumber },
					end: { x: m.endIndex, y: bufferLineNumber },
				},
				text: m.fullMatch,
				decorations: LINK_DECORATIONS,
				activate: () => {
					this.app.workspace.openLinkText(m.linkText, "", false);
				},
			}));

		callback(links.length > 0 ? links : undefined);
	}
}
