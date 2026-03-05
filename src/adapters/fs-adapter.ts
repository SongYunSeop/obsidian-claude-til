import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type { FileStorage, FileEntry } from "../ports/storage";
import type { MetadataProvider, FileMetadata } from "../ports/metadata";

/** Path traversal guard: only allows paths inside basePath */
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

/** Cached scanLinks result to avoid duplicate scans within the same MCP request */
interface LinkScanCache {
	resolved: Record<string, Record<string, number>>;
	unresolved: Record<string, Record<string, number>>;
	expiresAt: number;
}

const LINK_SCAN_TTL_MS = 5_000; // 5s TTL

export class FsMetadata implements MetadataProvider {
	private readonly resolvedBase: string;
	private readonly storage: FsStorage;
	private linkScanCache: LinkScanCache | null = null;

	constructor(private basePath: string, storage?: FsStorage) {
		this.resolvedBase = path.resolve(basePath);
		this.storage = storage ?? new FsStorage(basePath);
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
		const cached = await this.getCachedLinks();
		return cached.resolved;
	}

	async getUnresolvedLinks(): Promise<Record<string, Record<string, number>>> {
		const cached = await this.getCachedLinks();
		return cached.unresolved;
	}

	private async getCachedLinks(): Promise<LinkScanCache> {
		if (this.linkScanCache && Date.now() < this.linkScanCache.expiresAt) {
			return this.linkScanCache;
		}
		const result = await this.scanLinks();
		this.linkScanCache = { ...result, expiresAt: Date.now() + LINK_SCAN_TTL_MS };
		return this.linkScanCache;
	}

	async getActiveFilePath(): Promise<string | null> {
		return null; // No editor context in standalone mode
	}

	/**
	 * Scan all md files to build resolved/unresolved link maps.
	 * resolved: source → { target → count } (target file exists)
	 * unresolved: source → { linkName → count } (target file does not exist)
	 */
	private async scanLinks(): Promise<{
		resolved: Record<string, Record<string, number>>;
		unresolved: Record<string, Record<string, number>>;
	}> {
		const files = await this.storage.listFiles();
		const mdFiles = files.filter((f) => f.extension === "md");
		const existingPaths = new Set(files.map((f) => f.path));
		// Also register paths without .md extension for matching
		const existingPathsNoExt = new Set<string>();
		for (const f of files) {
			if (f.extension === "md") {
				existingPathsNoExt.add(f.path.replace(/\.md$/, ""));
			}
		}

		const resolved: Record<string, Record<string, number>> = {};
		const unresolved: Record<string, Record<string, number>> = {};

		for (const file of mdFiles) {
			const content = await this.storage.readFile(file.path);
			if (content === null) continue;

			const links = this.extractLinks(content);
			if (links.length === 0) continue;

			const sourceDir = file.path.substring(0, file.path.lastIndexOf("/"));

			for (const link of links) {
				// Skip external URLs
				if (link.startsWith("http://") || link.startsWith("https://")) continue;

				// Resolve link: relative path → absolute path
				const targetCandidates = this.resolveLinkTarget(link, sourceDir);
				let resolvedTarget: string | null = null;

				for (const candidate of targetCandidates) {
					if (existingPaths.has(candidate)) {
						resolvedTarget = candidate;
						break;
					}
				}

				if (resolvedTarget) {
					if (!resolved[file.path]) resolved[file.path] = {};
					resolved[file.path]![resolvedTarget] = (resolved[file.path]![resolvedTarget] ?? 0) + 1;
				} else {
					// Use wikilink name or link path as key
					const linkName = link.replace(/\.md$/, "").split("/").pop()!;
					if (!unresolved[file.path]) unresolved[file.path] = {};
					unresolved[file.path]![linkName] = (unresolved[file.path]![linkName] ?? 0) + 1;
				}
			}
		}

		return { resolved, unresolved };
	}

	/**
	 * Generate file path candidates from a link string.
	 */
	private resolveLinkTarget(link: string, sourceDir: string): string[] {
		const candidates: string[] = [];

		// Strip anchor fragment
		const cleanLink = link.split("#")[0]!;
		if (!cleanLink) return candidates;

		if (cleanLink.startsWith("/")) {
			// Absolute path
			const abs = cleanLink.slice(1);
			candidates.push(abs);
			if (!abs.endsWith(".md")) candidates.push(abs + ".md");
		} else if (cleanLink.includes("/")) {
			// Relative path (contains slash)
			const resolved = sourceDir ? `${sourceDir}/${cleanLink}` : cleanLink;
			// Simple normalization (equivalent to path.normalize)
			const normalized = resolved.split("/").reduce<string[]>((acc, seg) => {
				if (seg === "..") acc.pop();
				else if (seg !== ".") acc.push(seg);
				return acc;
			}, []).join("/");
			candidates.push(normalized);
			if (!normalized.endsWith(".md")) candidates.push(normalized + ".md");
			// Also try from root
			candidates.push(cleanLink);
			if (!cleanLink.endsWith(".md")) candidates.push(cleanLink + ".md");
		} else {
			// Wikilink or plain name: same directory → root
			if (sourceDir) {
				candidates.push(`${sourceDir}/${cleanLink}`);
				if (!cleanLink.endsWith(".md")) candidates.push(`${sourceDir}/${cleanLink}.md`);
			}
			candidates.push(cleanLink);
			if (!cleanLink.endsWith(".md")) candidates.push(cleanLink + ".md");
		}

		return candidates;
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
