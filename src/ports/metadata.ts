/**
 * 파일 메타데이터 제공 인터페이스.
 * Obsidian의 metadataCache를 추상화한다.
 * Standalone에서는 YAML/정규식 기반으로 구현된다.
 */

export interface FileMetadata {
	headings: string[];
	outgoingLinks: string[];
	tags: string[];
	frontmatter: Record<string, unknown>;
}

export interface MetadataProvider {
	/** 파일의 메타데이터를 반환한다. 파일이 없으면 null. */
	getFileMetadata(path: string): Promise<FileMetadata | null>;

	/** resolvedLinks: source → { target → count } */
	getResolvedLinks(): Promise<Record<string, Record<string, number>>>;

	/** unresolvedLinks: source → { linkName → count } */
	getUnresolvedLinks(): Promise<Record<string, Record<string, number>>>;

	/** 현재 에디터에서 열린 파일 경로. standalone에서는 null 반환. */
	getActiveFilePath(): Promise<string | null>;
}
