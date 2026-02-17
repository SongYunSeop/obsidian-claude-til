import { App, TFile } from "obsidian";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
			const files = app.vault.getFiles().filter((f) => {
				if (!f.path.startsWith(tilPath + "/")) return false;
				if (f.extension !== "md") return false;
				if (category) {
					const parts = f.path.replace(tilPath + "/", "").split("/");
					if (parts.length < 2 || parts[0] !== category) return false;
				}
				return true;
			});

			const byCategory: Record<string, string[]> = {};
			for (const file of files) {
				const relative = file.path.replace(tilPath + "/", "");
				const parts = relative.split("/");
				const cat = parts.length >= 2 ? parts[0]! : "(uncategorized)";
				if (!byCategory[cat]) byCategory[cat] = [];
				byCategory[cat]!.push(file.path);
			}

			const lines: string[] = [`TIL 총 ${files.length}개`];
			for (const [cat, paths] of Object.entries(byCategory)) {
				lines.push(`\n## ${cat} (${paths.length}개)`);
				for (const p of paths) {
					lines.push(`- ${p}`);
				}
			}
			return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
			const backlogFolder = tilPath + "/backlog";
			const files = app.vault.getFiles().filter((f) => {
				if (!f.path.startsWith(backlogFolder + "/") && f.path !== backlogFolder) return false;
				if (f.extension !== "md") return false;
				if (category) {
					const relative = f.path.replace(backlogFolder + "/", "");
					if (!relative.startsWith(category + "/") && relative !== category + ".md") return false;
				}
				return true;
			});

			let totalTodo = 0;
			let totalDone = 0;
			const results: string[] = [];

			for (const file of files) {
				const text = await app.vault.read(file);
				const todoMatches = text.match(/- \[ \]/g);
				const doneMatches = text.match(/- \[x\]/gi);
				const todo = todoMatches?.length ?? 0;
				const done = doneMatches?.length ?? 0;
				totalTodo += todo;
				totalDone += done;
				if (todo + done > 0) {
					results.push(`${file.path}: ${done}/${todo + done} 완료`);
				}
			}

			const total = totalTodo + totalDone;
			const pct = total > 0 ? Math.round((totalDone / total) * 100) : 0;
			const text = total > 0
				? `백로그 진행률: ${totalDone}/${total} (${pct}%)\n\n${results.join("\n")}`
				: "백로그 항목이 없습니다";
			return { content: [{ type: "text" as const, text }] };
		},
	);
}
