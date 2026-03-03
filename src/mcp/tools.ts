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
 * MCP 도구를 서버에 등록한다.
 * 모든 도구는 FileStorage / MetadataProvider 포트를 통해 vault에 접근한다.
 */
export function registerTools(server: McpServer, storage: FileStorage, metadata: MetadataProvider, tilPath: string): void {
	// vault_get_active_file: 현재 열린 파일 경로 + 내용
	server.registerTool(
		"vault_get_active_file",
		{
			title: "Get Active File",
			description: "현재 에디터에서 열린 파일의 경로와 내용을 반환합니다",
		},
		async () => {
			const activePath = await metadata.getActiveFilePath();
			if (!activePath) {
				return { content: [{ type: "text" as const, text: "현재 열린 파일이 없습니다" }] };
			}
			const text = await storage.readFile(activePath);
			if (text === null) {
				return { content: [{ type: "text" as const, text: "현재 열린 파일이 없습니다" }] };
			}
			return { content: [{ type: "text" as const, text: `path: ${activePath}\n---\n${text}` }] };
		},
	);

	// til_list: TIL 파일 목록 + 메타데이터
	server.registerTool(
		"til_list",
		{
			title: "List TILs",
			description: "TIL 파일 목록과 카테고리별 분류를 반환합니다. search로 파일명/경로 필터링 가능.",
			inputSchema: z.object({
				category: z.string().optional().describe("특정 카테고리만 필터링"),
				search: z.string().optional().describe("파일 경로/이름에서 검색 (대소문자 무시)"),
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

	// til_backlog_status: 백로그 진행률 요약
	server.registerTool(
		"til_backlog_status",
		{
			title: "Backlog Status",
			description: "학습 백로그의 진행률을 요약합니다",
			inputSchema: z.object({
				category: z.string().optional().describe("특정 카테고리만 필터링"),
			}),
		},
		async ({ category }) => {
			// 백로그 파일은 til/{카테고리}/backlog.md 경로에 있다
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

	// til_get_context: 주제 관련 기존 지식 컨텍스트
	server.registerTool(
		"til_get_context",
		{
			title: "Get Topic Context",
			description: "주제 관련 기존 학습 내용을 파악합니다 (파일, 링크 관계, 미작성 주제)",
			inputSchema: z.object({
				topic: z.string().describe("학습 주제 (예: typescript, hooks, flexbox)"),
			}),
		},
		async ({ topic }) => {
			const allFiles = (await storage.listFiles()).filter((f) => f.extension === "md");
			const allPaths = allFiles.map((f) => f.path);

			// 1단계: 경로 매칭
			const pathMatches = findPathMatches(allPaths, topic, tilPath);

			// 2단계: 내용 매칭 (경로 매칭에 포함되지 않은 파일만, 배치 병렬 I/O)
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
					if (text !== null && text.toLowerCase().includes(lowerTopic)) {
						contentMatches.push(batch[j]!.path);
					}
					if (pathMatches.length + contentMatches.length >= 20) break;
				}
			}

			// 3단계: metadata enrichment (병렬 조회)
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

				// backlinks: resolvedLinks에서 이 파일을 참조하는 파일들
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

			// 4단계: 미작성 링크 탐색
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

	// til_recent_context: 최근 학습 흐름
	server.registerTool(
		"til_recent_context",
		{
			title: "Recent Learning Context",
			description: "최근 학습 흐름을 시간순으로 파악합니다",
			inputSchema: z.object({
				days: z.number().min(1).max(90).default(7).describe("조회할 일수 (기본 7일)"),
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

	// til_dashboard: 학습 대시보드 통계
	server.registerTool(
		"til_dashboard",
		{
			title: "Dashboard Stats",
			description: "학습 대시보드 통계를 반환합니다 (요약, 히트맵, 카테고리, 백로그, 복습)",
			inputSchema: z.object({}),
		},
		async () => {
			// 1. vault 파일에서 EnhancedStatsFileEntry 구성 (frontmatter date 포함)
			const allFiles = await storage.listFiles();

			// 1. vault 파일에서 EnhancedStatsFileEntry 구성 + 복습 카운트 (병렬 메타데이터 조회)
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

						// 복습 대상 카운트 (이미 가져온 frontmatter 재활용)
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

			// 2. backlog 파일 읽어서 BacklogProgressEntry 구성
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

			// 3. computeEnhancedStats 호출
			const stats = computeEnhancedStats(files, tilPath, backlogEntries, undefined, reviewDueCount);

			// 5. JSON 반환
			return {
				content: [
					{ type: "text" as const, text: JSON.stringify(stats) },
				],
			};
		},
	);

	// til_review_list: 복습 대상 카드 목록
	server.registerTool(
		"til_review_list",
		{
			title: "Review List",
			description: "오늘 복습할 TIL 카드 목록과 통계를 반환합니다. include_content=true로 노트 내용을 함께 가져오면 별도 파일 읽기를 줄일 수 있습니다.",
			inputSchema: z.object({
				category: z.string().optional().describe("특정 카테고리만 필터링"),
				limit: z.number().min(1).max(100).optional().describe("최대 카드 수 (기본 20)"),
				include_content: z.boolean().optional().describe("true면 각 카드의 노트 내용을 함께 반환 (기본 false)"),
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

	// til_review_update: 복습 결과 기록 또는 복습 해제
	server.registerTool(
		"til_review_update",
		{
			title: "Update Review",
			description: "TIL 파일의 복습 결과를 기록하거나 복습 대상에서 제거합니다",
			inputSchema: z.object({
				path: z.string().describe("TIL 파일 경로"),
				grade: z.number().min(0).max(5).optional().describe("SM-2 등급 (0-5, action=review 시 필수)"),
				action: z.enum(["review", "remove"]).optional().describe("review(기본): 복습 기록, remove: 복습 해제"),
			}),
		},
		async ({ path, grade, action }) => {
			const effectiveAction = action ?? "review";

			const content = await storage.readFile(path);
			if (content === null) {
				return { content: [{ type: "text" as const, text: `Error: 파일을 찾을 수 없습니다 — ${path}` }], isError: true };
			}

			if (effectiveAction === "remove") {
				const updated = removeFrontmatterSrs(content);
				await storage.writeFile(path, updated);
				return { content: [{ type: "text" as const, text: JSON.stringify({ path, removed: true }) }] };
			}

			// action === "review"
			if (grade === undefined) {
				return { content: [{ type: "text" as const, text: "Error: action=review 시 grade(0-5)가 필요합니다" }], isError: true };
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

	// til_save_note: TIL 노트 저장 (frontmatter + 경로 규칙 보장)
	server.registerTool(
		"til_save_note",
		{
			title: "Save TIL Note",
			description: "TIL 노트를 저장합니다. frontmatter 형식과 경로 규칙을 서버가 보장합니다. auto_check_backlog=true로 저장 후 백로그 자동 체크.",
			inputSchema: z.object({
				category: z.string().describe("카테고리 (예: typescript, react)"),
				slug: z.string().describe("파일명 slug (예: generics, hooks)"),
				title: z.string().describe("노트 제목"),
				content: z.string().describe("노트 본문 (마크다운)"),
				tags: z.array(z.string()).optional().describe("태그 목록 (예: [\"typescript\", \"basics\"])"),
				date: z.string().optional().describe("작성일 (YYYY-MM-DD, 생략 시 오늘)"),
				fmCategory: z.string().optional().describe("frontmatter category 값 (생략 시 category 파라미터 사용)"),
				aliases: z.array(z.string()).optional().describe("aliases 목록 (예: [\"한글 제목\", \"English Title\"])"),
				auto_check_backlog: z.boolean().optional().describe("true면 저장 후 백로그 항목을 자동으로 완료 처리 (기본 false)"),
			}),
		},
		async ({ category, slug, title, content, tags, date, fmCategory, aliases, auto_check_backlog }) => {
			const path = `${tilPath}/${category}/${slug}.md`;
			const noteDate = date || new Date().toISOString().slice(0, 10);

			// frontmatter 생성
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

			// 디렉토리 생성 + 파일 저장
			await storage.mkdir(`${tilPath}/${category}`);
			const existed = await storage.exists(path);
			await storage.writeFile(path, fullContent);

			const data: { path: string; created: boolean; category: string; slug: string; title: string; backlog_checked?: boolean; backlog_already_done?: boolean } = { path, created: !existed, category, slug, title };

			// auto_check_backlog: 저장 후 백로그 자동 체크
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

	// til_backlog_check: 백로그 항목 완료 처리
	server.registerTool(
		"til_backlog_check",
		{
			title: "Check Backlog Item",
			description: "백로그 항목을 완료([x]) 처리합니다",
			inputSchema: z.object({
				category: z.string().describe("카테고리 (예: typescript, react)"),
				slug: z.string().describe("체크할 항목의 slug (예: generics)"),
			}),
		},
		async ({ category, slug }) => {
			const backlogPath = `${tilPath}/${category}/backlog.md`;
			const content = await storage.readFile(backlogPath);
			if (content === null) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ error: `백로그 파일을 찾을 수 없습니다 — ${backlogPath}` }) }], isError: true };
			}

			const result = checkBacklogItem(content, slug);
			if (!result.found) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ error: `"${slug}" 항목을 찾을 수 없습니다`, backlogPath }) }], isError: true };
			}
			if (result.alreadyDone) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ alreadyDone: true, slug, backlogPath }) }] };
			}

			await storage.writeFile(backlogPath, result.content);
			return { content: [{ type: "text" as const, text: JSON.stringify({ checked: true, slug, backlogPath }) }] };
		},
	);
}
