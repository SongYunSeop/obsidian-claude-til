import { describe, it, expect } from "vitest";
import { App, Vault, TFile } from "obsidian";

// MCP 도구의 핵심 로직을 직접 테스트한다.
// 실제 McpServer 없이 vault 접근 로직만 검증.

function createApp(files: Record<string, string>): App {
	const vault = new Vault();
	for (const [path, content] of Object.entries(files)) {
		(vault as any)._setFile(path, content);
	}
	return new App(vault);
}

describe("vault_read_note 로직", () => {
	it("존재하는 노트를 읽는다", async () => {
		const app = createApp({ "til/typescript/generics.md": "# Generics\n내용" });

		const file = app.vault.getAbstractFileByPath("til/typescript/generics.md");
		expect(file).toBeInstanceOf(TFile);

		const content = await app.vault.read(file as TFile);
		expect(content).toBe("# Generics\n내용");
	});

	it("존재하지 않는 경로에서 null을 반환한다", () => {
		const app = createApp({});

		const file = app.vault.getAbstractFileByPath("nonexistent.md");
		expect(file).toBeNull();
	});
});

describe("vault_list_files 로직", () => {
	it("폴더 내 파일 목록을 필터링한다", () => {
		const app = createApp({
			"til/ts/a.md": "",
			"til/ts/b.md": "",
			"notes/c.md": "",
		});

		const files = app.vault.getFiles();
		const filtered = files.filter((f) => f.path.startsWith("til/"));
		expect(filtered).toHaveLength(2);
	});

	it("확장자로 필터링한다", () => {
		const vault = new Vault();
		(vault as any)._setFile("til/a.md", "");
		(vault as any)._setFile("til/b.txt", "");
		const app = new App(vault);

		const files = app.vault.getFiles();
		const mdOnly = files.filter((f) => f.extension === "md");
		expect(mdOnly).toHaveLength(1);
		expect(mdOnly[0]!.path).toBe("til/a.md");
	});
});

describe("vault_search 로직", () => {
	it("텍스트를 포함하는 파일을 찾는다", async () => {
		const app = createApp({
			"til/ts/generics.md": "TypeScript generics are powerful",
			"til/react/hooks.md": "React hooks pattern",
			"til/ts/types.md": "Advanced TypeScript types",
		});

		const files = app.vault.getFiles().filter((f) => f.extension === "md");
		const query = "typescript";
		const results: string[] = [];

		for (const file of files) {
			const text = await app.vault.read(file);
			if (text.toLowerCase().includes(query.toLowerCase())) {
				results.push(file.path);
			}
		}

		expect(results).toHaveLength(2);
		expect(results).toContain("til/ts/generics.md");
		expect(results).toContain("til/ts/types.md");
	});
});

describe("til_list 로직", () => {
	it("TIL 파일을 카테고리별로 분류한다", () => {
		const app = createApp({
			"til/typescript/generics.md": "",
			"til/typescript/types.md": "",
			"til/react/hooks.md": "",
		});

		const tilPath = "til";
		const files = app.vault.getFiles().filter((f) =>
			f.path.startsWith(tilPath + "/") && f.extension === "md"
		);

		const byCategory: Record<string, string[]> = {};
		for (const file of files) {
			const relative = file.path.replace(tilPath + "/", "");
			const parts = relative.split("/");
			const cat = parts.length >= 2 ? parts[0]! : "(uncategorized)";
			if (!byCategory[cat]) byCategory[cat] = [];
			byCategory[cat]!.push(file.path);
		}

		expect(Object.keys(byCategory)).toHaveLength(2);
		expect(byCategory["typescript"]).toHaveLength(2);
		expect(byCategory["react"]).toHaveLength(1);
	});

	it("카테고리 필터를 적용한다", () => {
		const app = createApp({
			"til/typescript/generics.md": "",
			"til/react/hooks.md": "",
		});

		const tilPath = "til";
		const category = "typescript";
		const files = app.vault.getFiles().filter((f) => {
			if (!f.path.startsWith(tilPath + "/")) return false;
			if (f.extension !== "md") return false;
			const parts = f.path.replace(tilPath + "/", "").split("/");
			if (parts.length < 2 || parts[0] !== category) return false;
			return true;
		});

		expect(files).toHaveLength(1);
		expect(files[0]!.path).toBe("til/typescript/generics.md");
	});
});

describe("til_backlog_status 로직", () => {
	it("체크박스를 카운트한다", async () => {
		const content = `# Backlog
- [x] 완료된 항목
- [ ] 미완료 항목1
- [x] 또 완료
- [ ] 미완료 항목2
`;
		const app = createApp({ "til/backlog/typescript.md": content });

		const file = app.vault.getFiles().find((f) => f.path === "til/backlog/typescript.md")!;
		const text = await app.vault.read(file);
		const todoMatches = text.match(/- \[ \]/g);
		const doneMatches = text.match(/- \[x\]/gi);
		const todo = todoMatches?.length ?? 0;
		const done = doneMatches?.length ?? 0;

		expect(done).toBe(2);
		expect(todo).toBe(2);
	});

	it("빈 백로그에서 0을 반환한다", async () => {
		const app = createApp({ "til/backlog/empty.md": "# Empty backlog\nNo items here." });

		const file = app.vault.getFiles().find((f) => f.path === "til/backlog/empty.md")!;
		const text = await app.vault.read(file);
		const todoMatches = text.match(/- \[ \]/g);
		const doneMatches = text.match(/- \[x\]/gi);

		expect(todoMatches).toBeNull();
		expect(doneMatches).toBeNull();
	});
});

describe("vault_get_active_file 로직", () => {
	it("열린 파일이 없으면 null을 반환한다", () => {
		const app = createApp({});
		const active = app.workspace.getActiveFile();
		expect(active).toBeNull();
	});

	it("열린 파일의 정보를 반환한다", async () => {
		const app = createApp({ "til/test.md": "# Test content" });
		const file = new TFile("til/test.md");
		(app as any)._setActiveFile(file);

		const active = app.workspace.getActiveFile();
		expect(active).not.toBeNull();
		expect(active!.path).toBe("til/test.md");
	});
});
