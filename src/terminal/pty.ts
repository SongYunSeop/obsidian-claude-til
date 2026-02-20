import type { IPty } from "node-pty";
import * as path from "path";
import { FileSystemAdapter, App } from "obsidian";
import { ensurePath } from "./env";

const electronRequire = (window as unknown as { require: NodeJS.Require }).require;

export interface PtyOptions {
	shellPath: string;
	cols: number;
	rows: number;
	cwd: string;
}

/**
 * node-pty를 electronRequire로 로드하여 PTY 프로세스를 생성/관리한다.
 * 플러그인 디렉토리의 node_modules/node-pty를 우선 시도하고, 실패 시 글로벌 fallback.
 */
export function loadNodePty(app: App): typeof import("node-pty") {
	const adapter = app.vault.adapter as FileSystemAdapter;
	const basePath = adapter.getBasePath();
	const pluginPath = path.join(basePath, app.vault.configDir, "plugins", "claude-til");
	const nodePtyPath = path.join(pluginPath, "node_modules", "node-pty");

	try {
		return electronRequire(nodePtyPath);
	} catch {
		return electronRequire("node-pty");
	}
}

export function spawnPty(app: App, opts: PtyOptions): IPty {
	const nodePty = loadNodePty(app);
	const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();

	return nodePty.spawn(opts.shellPath, ["-l"], {
		name: "xterm-256color",
		cols: opts.cols,
		rows: opts.rows,
		cwd: opts.cwd || vaultPath,
		env: {
			...process.env,
			PATH: ensurePath(process.env.PATH),
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
		},
	});
}
