/**
 * File metadata provider interface.
 * Abstracts Obsidian's metadataCache.
 * Standalone mode uses YAML/regex-based implementation.
 */

export interface FileMetadata {
	headings: string[];
	outgoingLinks: string[];
	tags: string[];
	frontmatter: Record<string, unknown>;
}

export interface MetadataProvider {
	/** Returns file metadata. Returns null if file does not exist. */
	getFileMetadata(path: string): Promise<FileMetadata | null>;

	/** resolvedLinks: source → { target → count } */
	getResolvedLinks(): Promise<Record<string, Record<string, number>>>;

	/** unresolvedLinks: source → { linkName → count } */
	getUnresolvedLinks(): Promise<Record<string, Record<string, number>>>;

	/** Path of the file currently open in the editor. Returns null in standalone mode. */
	getActiveFilePath(): Promise<string | null>;
}
