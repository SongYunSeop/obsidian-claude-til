import { App, TFile } from "obsidian";
import type { FileStorage, FileEntry } from "../ports/storage";
import type { MetadataProvider, FileMetadata } from "../ports/metadata";

export class ObsidianStorage implements FileStorage {
	constructor(private app: App) {}

	async readFile(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		return this.app.vault.read(file);
	}

	async listFiles(): Promise<FileEntry[]> {
		return this.app.vault.getFiles().map((f) => ({
			path: f.path,
			extension: f.extension,
			name: f.name,
			mtime: f.stat.mtime,
			ctime: f.stat.ctime,
		}));
	}

	async exists(path: string): Promise<boolean> {
		return this.app.vault.adapter.exists(path);
	}

	async writeFile(path: string, content: string): Promise<void> {
		const dir = path.substring(0, path.lastIndexOf("/"));
		if (dir && !(await this.app.vault.adapter.exists(dir))) {
			await this.app.vault.adapter.mkdir(dir);
		}
		await this.app.vault.adapter.write(path, content);
	}

	async mkdir(path: string): Promise<void> {
		if (!(await this.app.vault.adapter.exists(path))) {
			await this.app.vault.adapter.mkdir(path);
		}
	}

	async remove(path: string): Promise<void> {
		await this.app.vault.adapter.remove(path);
	}

	getBasePath(): string {
		return (this.app.vault.adapter as any).basePath ?? "";
	}
}

export class ObsidianMetadata implements MetadataProvider {
	constructor(private app: App) {}

	async getFileMetadata(path: string): Promise<FileMetadata | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;

		const cache = this.app.metadataCache.getFileCache(file);
		return {
			headings: (cache?.headings ?? []).map((h) => h.heading),
			outgoingLinks: (cache?.links ?? []).map((l) => l.link),
			tags: (cache?.tags ?? []).map((t) => t.tag),
			frontmatter: (cache?.frontmatter as Record<string, unknown>) ?? {},
		};
	}

	async getResolvedLinks(): Promise<Record<string, Record<string, number>>> {
		return this.app.metadataCache.resolvedLinks;
	}

	async getUnresolvedLinks(): Promise<Record<string, Record<string, number>>> {
		return this.app.metadataCache.unresolvedLinks;
	}

	async getActiveFilePath(): Promise<string | null> {
		return this.app.workspace.getActiveFile()?.path ?? null;
	}
}
