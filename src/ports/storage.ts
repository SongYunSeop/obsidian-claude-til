/**
 * Platform-independent file storage interface.
 * Can be implemented with Obsidian Vault, node:fs, or other backends.
 */

export interface FileEntry {
	path: string;
	/** Extension without dot (e.g. "md") */
	extension: string;
	/** Filename with extension (e.g. "generics.md") */
	name: string;
	/** Last modified time (ms timestamp) */
	mtime: number;
	/** Creation time (ms timestamp) */
	ctime: number;
}

export interface FileStorage {
	/** Reads file content. Returns null if file does not exist. */
	readFile(path: string): Promise<string | null>;

	/** Returns a list of all files. */
	listFiles(): Promise<FileEntry[]>;

	/** Checks whether a file exists. */
	exists(path: string): Promise<boolean>;

	/** Writes a file. Creates parent directories automatically if needed. */
	writeFile(path: string, content: string): Promise<void>;

	/** Creates a directory. */
	mkdir(path: string): Promise<void>;

	/** Deletes a file. */
	remove(path: string): Promise<void>;

	/** Returns the base path (vault root). */
	getBasePath(): string;
}
