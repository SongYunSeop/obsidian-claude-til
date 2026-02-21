import { App, TFile } from "obsidian";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import { computeBacklogProgress, parseBacklogSections } from "../backlog";

/**
 * MCP 도구를 서버에 등록한다.
 * 모든 도구는 Obsidian App 인스턴스를 통해 vault에 직접 접근한다.
 */
export function registerTools(server: McpServer, app: App, tilPath: string): void {
	// vault_read_note: 노트 내용 읽기
	server.registerTool(
		"vault_read_note",
		{
			title: "Read Note",
			description: "Vault에서 노트 내용을 읽습니다",
			inputSchema: z.object({
				path: z.string().describe("노트 파일 경로 (예: til/typescript/generics.md)"),
			}),
		},
		async ({ path }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { content: [{ type: "text" as const, text: `Error: 파일을 찾을 수 없습니다 — ${path}` }], isError: true };
			}
			const text = await app.vault.read(file);
			return { content: [{ type: "text" as const, text }] };
		},
	);

	// vault_list_files: 폴더 내 파일 목록
	server.registerTool(
		"vault_list_files",
		{
			title: "List Files",
			description: "Vault 폴더 내 파일 목록을 반환합니다",
			inputSchema: z.object({
				folder: z.string().optional().describe("폴더 경로 (생략 시 루트)"),
				extension: z.string().optional().describe("필터링할 확장자 (예: md)"),
			}),
		},
		async ({ folder, extension }) => {
			const files = app.vault.getFiles();
			const filtered = files.filter((f) => {
				if (folder && !f.path.startsWith(folder + "/") && f.path !== folder) return false;
				if (extension && f.extension !== extension) return false;
				return true;
			});
			const list = filtered.map((f) => f.path).join("\n");
			return { content: [{ type: "text" as const, text: list || "(파일 없음)" }] };
		},
	);

	// vault_search: vault 전체 텍스트 검색
	server.registerTool(
		"vault_search",
		{
			title: "Search Vault",
			description: "Vault 전체에서 텍스트를 검색합니다",
			inputSchema: z.object({
				query: z.string().describe("검색할 텍스트"),
			}),
		},
		async ({ query }) => {
			const files = app.vault.getFiles().filter((f) => f.extension === "md");
			const results: string[] = [];
			const lowerQuery = query.toLowerCase();

			for (const file of files) {
				const text = await app.vault.read(file);
				if (text.toLowerCase().includes(lowerQuery)) {
					results.push(file.path);
				}
				if (results.length >= 50) break;
			}
			const text = results.length > 0
				? `${results.length}개 파일에서 발견:\n${results.join("\n")}`
				: `"${query}"에 대한 검색 결과가 없습니다`;
			return { content: [{ type: "text" as const, text }] };
		},
	);

	// vault_get_active_file: 현재 열린 파일 경로 + 내용
	server.registerTool(
		"vault_get_active_file",
		{
			title: "Get Active File",
			description: "현재 에디터에서 열린 파일의 경로와 내용을 반환합니다",
		},
		async () => {
			const file = app.workspace.getActiveFile();
			if (!file) {
				return { content: [{ type: "text" as const, text: "현재 열린 파일이 없습니다" }] };
			}
			const text = await app.vault.read(file);
			return { content: [{ type: "text" as const, text: `path: ${file.path}\n---\n${text}` }] };
		},
	);

	// til_list: TIL 파일 목록 + 메타데이터
	server.registerTool(
		"til_list",
		{
			title: "List TILs",
			description: "TIL 파일 목록과 카테고리별 분류를 반환합니다",
			inputSchema: z.object({
				category: z.string().optional().describe("특정 카테고리만 필터링"),
			}),
		},
		async ({ category }) => {
			const filePaths = app.vault.getFiles()
				.filter((f) => f.path.startsWith(tilPath + "/") && f.extension === "md")
				.map((f) => f.path);

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
			const files = app.vault.getFiles().filter((f) => {
				if (!f.path.startsWith(tilPath + "/")) return false;
				if (f.name !== "backlog.md") return false;
				if (category) {
					const cat = extractCategory(f.path, tilPath);
					if (cat !== category) return false;
				}
				return true;
			});

			const categories: { name: string; path: string; done: number; total: number; sections?: { heading: string; items: { displayName: string; path: string; done: boolean }[] }[] }[] = [];

			for (const file of files) {
				const content = await app.vault.read(file);
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
			const allFiles = app.vault.getFiles().filter((f) => f.extension === "md");
			const allPaths = allFiles.map((f) => f.path);

			// 1단계: 경로 매칭
			const pathMatches = findPathMatches(allPaths, topic, tilPath);

			// 2단계: 내용 매칭 (경로 매칭에 포함되지 않은 파일만)
			const pathMatchSet = new Set(pathMatches);
			const contentMatches: string[] = [];
			const lowerTopic = topic.toLowerCase();
			for (const file of allFiles) {
				if (pathMatchSet.has(file.path)) continue;
				if (!file.path.startsWith(tilPath + "/")) continue;
				if (file.name === "backlog.md") continue;
				const text = await app.vault.read(file);
				if (text.toLowerCase().includes(lowerTopic)) {
					contentMatches.push(file.path);
				}
				if (pathMatches.length + contentMatches.length >= 20) break;
			}

			// 3단계: metadataCache로 enrichment
			const resolvedLinks = app.metadataCache.resolvedLinks;
			const matchedFiles: TilFileContext[] = [];

			for (const filePath of [...pathMatches, ...contentMatches]) {
				const file = app.vault.getAbstractFileByPath(filePath);
				if (!file || !(file instanceof TFile)) continue;

				const cache = app.metadataCache.getFileCache(file);
				const headings = (cache?.headings ?? []).map((h) => h.heading);
				const outgoingLinks = (cache?.links ?? []).map((l) => l.link);
				const tags = (cache?.tags ?? []).map((t) => t.tag);

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
			const unresolvedMentions = findUnresolvedMentions(
				app.metadataCache.unresolvedLinks,
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
			const allFiles = app.vault.getFiles().filter((f) => f.extension === "md");

			const filesWithMeta = allFiles.map((f) => {
				const cache = app.metadataCache.getFileCache(f);
				const headings = (cache?.headings ?? []).map((h) => h.heading);
				return { path: f.path, mtime: f.stat.mtime, headings };
			});

			const result = filterRecentFiles(filesWithMeta, days, tilPath);
			return { content: [{ type: "text" as const, text: formatRecentContext(result) }] };
		},
	);
}
