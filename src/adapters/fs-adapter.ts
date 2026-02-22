import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type { FileStorage, FileEntry } from "../ports/storage";
import type { MetadataProvider, FileMetadata } from "../ports/metadata";

/** basePath 내부 경로만 허용하는 path traversal 방어 유틸 */
function resolveSafe(resolvedBase: string, filePath: string): string {
	const resolved = path.resolve(resolvedBase, filePath);
	if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
		throw new Error(`Path traversal denied: ${filePath}`);
	}
	return resolved;
}

export class FsStorage implements FileStorage {
	private readonly resolvedBase: string;

	constructor(private basePath: string) {
		this.resolvedBase = path.resolve(basePath);
	}

	async readFile(filePath: string): Promise<string | null> {
		try {
			return await fs.readFile(resolveSafe(this.resolvedBase,filePath), "utf-8");
		} catch {
			return null;
		}
	}

	async listFiles(): Promise<FileEntry[]> {
		const entries: FileEntry[] = [];
		await this.walkDir("", entries);
		return entries;
	}

	private async walkDir(dir: string, entries: FileEntry[]): Promise<void> {
		const fullDir = resolveSafe(this.resolvedBase,dir || ".");
		let dirents;
		try {
			dirents = await fs.readdir(fullDir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const d of dirents) {
			const relative = dir ? `${dir}/${d.name}` : d.name;
			if (d.isDirectory()) {
				if (d.name.startsWith(".")) continue; // skip hidden
				await this.walkDir(relative, entries);
			} else if (d.isFile()) {
				const ext = d.name.includes(".") ? d.name.split(".").pop()! : "";
				try {
					const stat = await fs.stat(resolveSafe(this.resolvedBase,relative));
					entries.push({
						path: relative,
						extension: ext,
						name: d.name,
						mtime: stat.mtimeMs,
						ctime: stat.ctimeMs,
					});
				} catch {
					// skip files we can't stat
				}
			}
		}
	}

	async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(resolveSafe(this.resolvedBase,filePath));
			return true;
		} catch {
			return false;
		}
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const fullPath = resolveSafe(this.resolvedBase,filePath);
		await fs.mkdir(path.dirname(fullPath), { recursive: true });
		await fs.writeFile(fullPath, content, "utf-8");
	}

	async mkdir(dirPath: string): Promise<void> {
		await fs.mkdir(resolveSafe(this.resolvedBase,dirPath), { recursive: true });
	}

	async remove(filePath: string): Promise<void> {
		try {
			await fs.unlink(resolveSafe(this.resolvedBase,filePath));
		} catch {
			// ignore if already removed
		}
	}

	getBasePath(): string {
		return this.basePath;
	}
}

export class FsMetadata implements MetadataProvider {
	private readonly resolvedBase: string;

	constructor(private basePath: string) {
		this.resolvedBase = path.resolve(basePath);
	}

	async getFileMetadata(filePath: string): Promise<FileMetadata | null> {
		let content: string;
		try {
			content = await fs.readFile(resolveSafe(this.resolvedBase, filePath), "utf-8");
		} catch {
			return null;
		}

		return {
			headings: this.extractHeadings(content),
			outgoingLinks: this.extractLinks(content),
			tags: this.extractTags(content),
			frontmatter: this.extractFrontmatter(content),
		};
	}

	async getResolvedLinks(): Promise<Record<string, Record<string, number>>> {
		// Standalone: no link resolution cache. Return empty.
		// Full implementation would scan all files and parse links.
		return {};
	}

	async getUnresolvedLinks(): Promise<Record<string, Record<string, number>>> {
		return {};
	}

	async getActiveFilePath(): Promise<string | null> {
		return null; // No editor context in standalone mode
	}

	private extractHeadings(content: string): string[] {
		const body = this.stripFrontmatter(content);
		const headings: string[] = [];
		for (const match of body.matchAll(/^#{1,6}\s+(.+)$/gm)) {
			headings.push(match[1]!.trim());
		}
		return headings;
	}

	private extractLinks(content: string): string[] {
		const body = this.stripFrontmatter(content);
		const links: string[] = [];
		// Markdown links: [text](url)
		for (const match of body.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
			links.push(match[2]!);
		}
		// Wikilinks: [[page]] or [[page|alias]]
		for (const match of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
			links.push(match[1]!.split("|")[0]!);
		}
		return links;
	}

	private extractTags(content: string): string[] {
		const fm = this.extractFrontmatter(content);
		const tags: string[] = [];
		const fmTags = fm.tags;
		if (Array.isArray(fmTags)) {
			tags.push(...fmTags.filter((t): t is string => typeof t === "string"));
		}
		// Inline #tags from body
		const body = this.stripFrontmatter(content);
		for (const match of body.matchAll(/(?:^|\s)#([a-zA-Z][\w/-]*)/gm)) {
			tags.push("#" + match[1]!);
		}
		return tags;
	}

	private extractFrontmatter(content: string): Record<string, unknown> {
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) return {};
		try {
			const parsed = parseYaml(match[1]!);
			return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	private stripFrontmatter(content: string): string {
		if (!content.startsWith("---")) return content;
		const end = content.indexOf("---", 3);
		return end === -1 ? content : content.slice(end + 3);
	}
}
