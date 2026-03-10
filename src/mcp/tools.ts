import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../ports/storage";
import type { MetadataProvider } from "../ports/metadata";
import {
	findPathMatches,
	buildFileContext,
	findUnresolvedMentions,
	formatTopicContext,
	filterRecentFiles,
	formatRecentContext,
	extractCategory,
	groupFilesByCategory,
	type TilFileContext,
	type TopicContextResult,
} from "./context";
import { computeBacklogProgress, parseBacklogSections, checkBacklogItem } from "../backlog";
import {
	computeEnhancedStats,
	type EnhancedStatsFileEntry,
	type BacklogProgressEntry,
} from "../core/stats";
import {
	filterDueCards,
	computeReviewStats,
	parseSrsMetadata,
	createDefaultSrsMetadata,
	computeNextReview,
	updateFrontmatterSrs,
	removeFrontmatterSrs,
	isDueForReview,
	type SrsFileEntry,
	type ReviewGrade,
} from "../core/srs";

/**
 * Registers MCP tools with the server.
 * All tools access the vault through the FileStorage / MetadataProvider ports.
 */
export function registerTools(server: McpServer, storage: FileStorage, metadata: MetadataProvider, tilPath: string): void {
	// til_list: TIL file list + metadata
	server.registerTool(
		"til_list",
		{
			title: "List TILs",
			description: "Returns a list of TIL files with category grouping. Use search to filter by filename/path.",
			inputSchema: z.object({
				category: z.string().optional().describe("Filter by specific category"),
				search: z.string().optional().describe("Search in file path/name (case insensitive)"),
			}),
		},
		async ({ category, search }) => {
			let filePaths = (await storage.listFiles())
				.filter((f) => f.path.startsWith(tilPath + "/") && f.extension === "md")
				.map((f) => f.path);

			if (search) {
				const lowerSearch = search.toLowerCase();
				filePaths = filePaths.filter((p) => p.toLowerCase().includes(lowerSearch));
			}

			const byCategory = groupFilesByCategory(filePaths, tilPath, category);
			const totalCount = Object.values(byCategory).reduce((sum, paths) => sum + paths.length, 0);

			const categories = Object.entries(byCategory).map(([cat, paths]) => ({
				name: cat,
				count: paths.length,
				files: paths,
			}));

			const data = { totalCount, categories };
			return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
		},
	);

	// til_backlog_status: backlog progress summary
	server.registerTool(
		"til_backlog_status",
		{
			title: "Backlog Status",
			description: "Summarizes backlog progress (queued learning topics)",
			inputSchema: z.object({
				category: z.string().optional().describe("Filter by specific category"),
			}),
		},
		async ({ category }) => {
			// Backlog files are located at til/{category}/backlog.md
			const files = (await storage.listFiles()).filter((f) => {
				if (!f.path.startsWith(tilPath + "/")) return false;
				if (f.name !== "backlog.md") return false;
				if (category) {
					const cat = extractCategory(f.path, tilPath);
					if (cat !== category) return false;
				}
				return true;
			});

			const categories: { name: string; path: string; done: number; total: number; sections?: { heading: string; items: { displayName: string; path: string; done: boolean; sourceUrls?: string[] }[] }[] }[] = [];

			for (const file of files) {
				const content = await storage.readFile(file.path);
				if (content === null) continue;
				const progress = computeBacklogProgress(content);
				const total = progress.todo + progress.done;
				if (total > 0) {
					const entry: typeof categories[number] = {
						name: extractCategory(file.path, tilPath),
						path: file.path,
						done: progress.done,
						total,
					};
					if (category) {
						entry.sections = parseBacklogSections(content);
					}
					categories.push(entry);
				}
			}

			const totalDone = categories.reduce((sum, c) => sum + c.done, 0);
			const totalItems = categories.reduce((sum, c) => sum + c.total, 0);
			const data = { totalDone, totalItems, categories };
			return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
		},
	);

	// til_get_context: existing knowledge context related to a topic
	server.registerTool(
		"til_get_context",
		{
			title: "Get Topic Context",
			description: "Finds existing learning content related to a topic (files, link relationships, unresolved links)",
			inputSchema: z.object({
				topic: z.string().describe("Learning topic (e.g., typescript, hooks, flexbox)"),
			}),
		},
		async ({ topic }) => {
			const allFiles = (await storage.listFiles()).filter((f) => f.extension === "md");
			const allPaths = allFiles.map((f) => f.path);

			// Step 1: path matching
			const pathMatches = findPathMatches(allPaths, topic, tilPath);

			// Step 2: content matching (only files not already matched by path, batched parallel I/O)
			const pathMatchSet = new Set(pathMatches);
			const contentMatches: string[] = [];
			const lowerTopic = topic.toLowerCase();
			const candidates = allFiles.filter((f) =>
				!pathMatchSet.has(f.path) && f.path.startsWith(tilPath + "/") && f.name !== "backlog.md",
			);
			const BATCH_SIZE = 20;
			for (let i = 0; i < candidates.length && pathMatches.length + contentMatches.length < 20; i += BATCH_SIZE) {
				const batch = candidates.slice(i, i + BATCH_SIZE);
				const texts = await Promise.all(batch.map((f) => storage.readFile(f.path)));
				for (let j = 0; j < batch.length; j++) {
					const text = texts[j];
					if (text != null && text.toLowerCase().includes(lowerTopic)) {
						contentMatches.push(batch[j]!.path);
					}
					if (pathMatches.length + contentMatches.length >= 20) break;
				}
			}

			// Step 3: metadata enrichment (parallel lookup)
			const allMatchedPaths = [...pathMatches, ...contentMatches];
			const [resolvedLinks, ...fileMetas] = await Promise.all([
				metadata.getResolvedLinks(),
				...allMatchedPaths.map((p) => metadata.getFileMetadata(p)),
			]);

			const matchedFiles: TilFileContext[] = [];
			for (let i = 0; i < allMatchedPaths.length; i++) {
				const filePath = allMatchedPaths[i]!;
				const fileMeta = fileMetas[i] ?? null;

				const headings = fileMeta?.headings ?? [];
				const outgoingLinks = fileMeta?.outgoingLinks ?? [];
				const tags = fileMeta?.tags ?? [];

				// backlinks: files that reference this file in resolvedLinks
				const backlinks: string[] = [];
				for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
					if (targets[filePath]) {
						backlinks.push(sourcePath);
					}
				}

				const matchType = pathMatchSet.has(filePath) ? "path" as const : "content" as const;
				matchedFiles.push(
					buildFileContext(filePath, tilPath, matchType, headings, outgoingLinks, backlinks, tags),
				);
			}

			// Step 4: search for unresolved links
			const unresolvedLinks = await metadata.getUnresolvedLinks();
			const unresolvedMentions = findUnresolvedMentions(
				unresolvedLinks,
				topic,
				tilPath,
			);

			const result: TopicContextResult = { topic, matchedFiles, unresolvedMentions };
			return { content: [{ type: "text" as const, text: formatTopicContext(result) }] };
		},
	);

	// til_recent_context: recent learning activity
	server.registerTool(
		"til_recent_context",
		{
			title: "Recent Learning Context",
			description: "Shows recent learning activity (newest first)",
			inputSchema: z.object({
				days: z.number().min(1).max(90).default(7).describe("Number of days to query (default 7)"),
			}),
		},
		async ({ days }) => {
			const allFiles = (await storage.listFiles()).filter((f) => f.extension === "md");

			const filesWithMeta = await Promise.all(allFiles.map(async (f) => {
				const fileMeta = await metadata.getFileMetadata(f.path);
				const headings = fileMeta?.headings ?? [];
				return { path: f.path, mtime: f.mtime, headings };
			}));

			const result = filterRecentFiles(filesWithMeta, days, tilPath);
			return { content: [{ type: "text" as const, text: formatRecentContext(result) }] };
		},
	);

	// til_dashboard: learning dashboard statistics
	server.registerTool(
		"til_dashboard",
		{
			title: "Dashboard Stats",
			description: "Returns learning dashboard stats (summary, heatmap, categories, backlog, reviews)",
			inputSchema: z.object({}),
		},
		async () => {
			// 1. Build EnhancedStatsFileEntry from vault files (including frontmatter date)
			const allFiles = await storage.listFiles();

			// 1. Build EnhancedStatsFileEntry from vault files + review count (parallel metadata lookup)
			let reviewDueCount = 0;
			const files: EnhancedStatsFileEntry[] = await Promise.all(
				allFiles
					.filter((f) => f.extension === "md")
					.map(async (f) => {
						const fileMeta = await metadata.getFileMetadata(f.path);
						const fmDate = fileMeta?.frontmatter?.date;
						const createdDate = typeof fmDate === "string" ? fmDate : undefined;
						const fmTags = fileMeta?.frontmatter?.tags;
						const tags = Array.isArray(fmTags) ? fmTags.filter((t: unknown) => typeof t === "string") : undefined;

						// Count review-due items (reuse already-fetched frontmatter)
						if (f.path.startsWith(tilPath + "/") && f.name !== "backlog.md") {
							const nextReview = fileMeta?.frontmatter?.next_review;
							if (typeof nextReview === "string" && isDueForReview(nextReview)) {
								reviewDueCount++;
							}
						}

						return {
							path: f.path,
							extension: f.extension,
							mtime: f.mtime,
							ctime: f.ctime,
							createdDate,
							tags,
						};
					}),
			);

			// 2. Read backlog files and build BacklogProgressEntry list
			const backlogFiles = allFiles.filter((f) => {
				if (!f.path.startsWith(tilPath + "/")) return false;
				if (f.name !== "backlog.md") return false;
				return true;
			});

			const backlogEntries: BacklogProgressEntry[] = [];
			for (const file of backlogFiles) {
				const content = await storage.readFile(file.path);
				if (content === null) continue;
				const progress = computeBacklogProgress(content);
				const total = progress.todo + progress.done;
				if (total > 0) {
					backlogEntries.push({
						category: extractCategory(file.path, tilPath),
						filePath: file.path,
						done: progress.done,
						total,
					});
				}
			}

			// 3. Call computeEnhancedStats
			const stats = computeEnhancedStats(files, tilPath, backlogEntries, undefined, reviewDueCount);

			// 5. Return JSON
			return {
				content: [
					{ type: "text" as const, text: JSON.stringify(stats) },
				],
			};
		},
	);

	// til_review_list: list of cards due for review
	server.registerTool(
		"til_review_list",
		{
			title: "Review List",
			description: "Returns today's TIL review cards and stats. Set include_content=true to include note content with each card (avoids separate file reads).",
			inputSchema: z.object({
				category: z.string().optional().describe("Filter by specific category"),
				limit: z.number().min(1).max(100).optional().describe("Max card count (default 20)"),
				include_content: z.boolean().optional().describe("If true, include note content with each card (default false)"),
			}),
		},
		async ({ category, limit, include_content }) => {
			const allFiles = await storage.listFiles();
			const srsFiles: SrsFileEntry[] = [];

			for (const f of allFiles) {
				if (!f.path.startsWith(tilPath + "/")) continue;
				if (f.extension !== "md") continue;
				if (f.name === "backlog.md") continue;
				if (category) {
					const cat = extractCategory(f.path, tilPath);
					if (cat !== category) continue;
				}

				const fileMeta = await metadata.getFileMetadata(f.path);
				if (!fileMeta) continue;

				const headings = fileMeta.headings ?? [];
				const title = headings.length > 0 ? headings[0]! : f.name.replace(/\.md$/, "");

				srsFiles.push({
					path: f.path,
					extension: f.extension,
					title,
					frontmatter: fileMeta.frontmatter ?? {},
				});
			}

			const effectiveLimit = limit ?? 20;
			const cards = filterDueCards(srsFiles, tilPath, undefined, effectiveLimit);
			const stats = computeReviewStats(srsFiles, tilPath);
			const remaining = Math.max(0, stats.dueToday - cards.length);

			if (include_content) {
				const contents = await Promise.all(cards.map((card) => storage.readFile(card.path)));
				const cardsWithContent = cards.map((card, i) => ({
					...card,
					content: contents[i] ?? "",
				}));
				const data = { cards: cardsWithContent, stats, remaining };
				return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
			}

			const data = { cards, stats, remaining };
			return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
		},
	);

	// til_review_update: record a review result or remove from review schedule
	server.registerTool(
		"til_review_update",
		{
			title: "Update Review",
			description: "Records a review result for a TIL file, or removes it from spaced repetition tracking",
			inputSchema: z.object({
				path: z.string().describe("TIL file path"),
				grade: z.number().min(0).max(5).optional().describe("SM-2 grade (0-5, required when action=review)"),
				action: z.enum(["review", "remove"]).optional().describe("review (default): record review, remove: remove from review schedule"),
			}),
		},
		async ({ path, grade, action }) => {
			const effectiveAction = action ?? "review";

			const content = await storage.readFile(path);
			if (content === null) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ error: `File not found: ${path}` }) }], isError: true };
			}

			if (effectiveAction === "remove") {
				const updated = removeFrontmatterSrs(content);
				await storage.writeFile(path, updated);
				return { content: [{ type: "text" as const, text: JSON.stringify({ path, removed: true }) }] };
			}

			// action === "review"
			if (grade === undefined) {
				return { content: [{ type: "text" as const, text: "Error: grade (0-5) is required when action=review" }], isError: true };
			}

			const fileMeta = await metadata.getFileMetadata(path);
			const fm = fileMeta?.frontmatter ?? {};
			const currentSrs = parseSrsMetadata(fm) ?? createDefaultSrsMetadata();
			const newSrs = computeNextReview(currentSrs, grade as ReviewGrade);
			const updated = updateFrontmatterSrs(content, newSrs);
			await storage.writeFile(path, updated);

			return {
				content: [{
					type: "text" as const,
					text: JSON.stringify({
						path,
						grade,
						next_review: newSrs.next_review,
						interval: newSrs.interval,
						ease_factor: newSrs.ease_factor,
						repetitions: newSrs.repetitions,
					}),
				}],
			};
		},
	);

	// til_save_note: save a TIL note (ensures frontmatter + path conventions)
	server.registerTool(
		"til_save_note",
		{
			title: "Save TIL Note",
			description: "Saves a TIL note. The server ensures frontmatter format and path conventions. Set auto_check_backlog=true to auto-check backlog after saving.",
			inputSchema: z.object({
				category: z.string().describe("Category (e.g., typescript, react)"),
				slug: z.string().describe("Filename slug (e.g., generics, hooks)"),
				title: z.string().describe("Note title"),
				content: z.string().describe("Note body (markdown)"),
				tags: z.array(z.string()).optional().describe("Tag list (e.g., [\"typescript\", \"basics\"])"),
				date: z.string().optional().describe("Creation date (YYYY-MM-DD, defaults to today)"),
				fmCategory: z.string().optional().describe("frontmatter category value (defaults to category parameter)"),
				aliases: z.array(z.string()).optional().describe("Aliases list (e.g., [\"Korean Title\", \"English Title\"])"),
				auto_check_backlog: z.boolean().optional().describe("If true, auto-check matching backlog item after saving (default false)"),
			}),
		},
		async ({ category, slug, title, content, tags, date, fmCategory, aliases, auto_check_backlog }) => {
			const path = `${tilPath}/${category}/${slug}.md`;
			const noteDate = date || new Date().toISOString().slice(0, 10);

			// Build frontmatter
			const fmLines = ["---", `title: "${title.replace(/"/g, '\\"')}"`, `date: ${noteDate}`];
			const effectiveCategory = fmCategory ?? category;
			fmLines.push(`category: ${effectiveCategory}`);
			if (tags && tags.length > 0) {
				fmLines.push("tags:");
				for (const tag of tags) {
					fmLines.push(`  - ${tag}`);
				}
			}
			if (aliases && aliases.length > 0) {
				fmLines.push(`aliases: [${aliases.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ")}]`);
			}
			fmLines.push("---", "");

			const fullContent = fmLines.join("\n") + content;

			// Create directory + save file
			await storage.mkdir(`${tilPath}/${category}`);
			const existed = await storage.exists(path);
			await storage.writeFile(path, fullContent);

			const data: { path: string; created: boolean; category: string; slug: string; title: string; backlog_checked?: boolean; backlog_already_done?: boolean } = { path, created: !existed, category, slug, title };

			// auto_check_backlog: auto-check backlog after saving
			if (auto_check_backlog) {
				const backlogPath = `${tilPath}/${category}/backlog.md`;
				const backlogContent = await storage.readFile(backlogPath);
				if (backlogContent !== null) {
					const result = checkBacklogItem(backlogContent, slug);
					if (result.found && !result.alreadyDone) {
						await storage.writeFile(backlogPath, result.content);
						data.backlog_checked = true;
					} else if (result.alreadyDone) {
						data.backlog_already_done = true;
					}
				}
			}

			return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
		},
	);

	// til_backlog_check: mark a backlog item as completed
	server.registerTool(
		"til_backlog_check",
		{
			title: "Check Backlog Item",
			description: "Marks a backlog item as completed ([x])",
			inputSchema: z.object({
				category: z.string().describe("Category (e.g., typescript, react)"),
				slug: z.string().describe("Slug of the item to mark as completed (e.g., generics)"),
			}),
		},
		async ({ category, slug }) => {
			const backlogPath = `${tilPath}/${category}/backlog.md`;
			const content = await storage.readFile(backlogPath);
			if (content === null) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Error: Backlog file not found — ${backlogPath}` }) }], isError: true };
			}

			const result = checkBacklogItem(content, slug);
			if (!result.found) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Item not found: "${slug}"`, backlogPath }) }], isError: true };
			}
			if (result.alreadyDone) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ alreadyDone: true, slug, backlogPath }) }] };
			}

			await storage.writeFile(backlogPath, result.content);
			return { content: [{ type: "text" as const, text: JSON.stringify({ checked: true, slug, backlogPath }) }] };
		},
	);
}
