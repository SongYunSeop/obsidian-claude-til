export interface MigrateResult {
	content: string;
	count: number;
}

/**
 * `[[...]]` 내부 문자열에서 path와 displayText를 분리한다.
 * `|` 또는 `\|` (테이블 이스케이프)를 구분자로 처리한다.
 * alias가 없으면 path를 displayText로 사용한다.
 */
export function parseWikilink(inner: string): {
	path: string;
	displayText: string;
} {
	// `\|` (escaped pipe in tables) 또는 `|` 를 구분자로 분리
	const pipeIndex = inner.search(/\\?\|/);
	if (pipeIndex === -1) {
		return { path: inner, displayText: inner };
	}

	const path = inner.slice(0, pipeIndex);
	// `\|` 면 구분자가 2글자, `|` 면 1글자
	const separatorLength = inner[pipeIndex] === "\\" ? 2 : 1;
	const displayText = inner.slice(pipeIndex + separatorLength);

	return { path, displayText };
}

/**
 * path와 displayText로 표준 마크다운 링크를 생성한다.
 * `.md` 확장자가 없으면 자동 추가, 이미 있으면 유지한다.
 */
export function toMarkdownLink(path: string, displayText: string): string {
	const mdPath = path.endsWith(".md") ? path : `${path}.md`;
	return `[${displayText}](${mdPath})`;
}

/**
 * 코드 블록과 wikilink를 매칭하는 정규식.
 * 그룹 1: fenced/inline 코드 블록 (보존 대상)
 * 그룹 2: wikilink (변환 대상)
 */
const WIKILINK_REGEX = /(```[\s\S]*?```|`[^`\n]+`)|(\[\[[^\[\]]+?\]\])/g;

/**
 * 코드 블록 내부를 제외하고 wikilink 수를 카운트한다.
 */
export function countWikilinks(content: string): number {
	let count = 0;
	const regex = new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		if (match[2]) {
			count++;
		}
	}

	return count;
}

/**
 * 코드 블록 내부를 보존하면서 wikilink를 표준 마크다운 링크로 변환한다.
 * regex alternation 패턴: 코드 블록이 먼저 매칭되어 보존, wikilink는 변환.
 */
export function migrateLinks(content: string): MigrateResult {
	let count = 0;

	const result = content.replace(
		new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags),
		(fullMatch, codeBlock: string | undefined, wikilink: string | undefined) => {
			// 코드 블록 매칭 → 원본 그대로 반환
			if (codeBlock) return fullMatch;

			// wikilink 매칭 → 변환 수행
			if (wikilink) {
				const inner = wikilink.slice(2, -2); // [[ ]] 제거
				const { path, displayText } = parseWikilink(inner);
				count++;
				return toMarkdownLink(path, displayText);
			}

			return fullMatch;
		},
	);

	return { content: result, count };
}

/**
 * 코드 블록 내부를 제외하고 잔여 wikilink가 있는지 확인한다.
 */
export function hasWikilinks(content: string): boolean {
	return countWikilinks(content) > 0;
}
