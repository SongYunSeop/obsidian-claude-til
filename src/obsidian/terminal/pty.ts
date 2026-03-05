import type { IPty } from "node-pty";
import * as path from "path";
import { FileSystemAdapter, App } from "obsidian";
import { ensurePath } from "../../core/env";

const electronRequire = (window as unknown as { require: NodeJS.Require }).require;

export interface PtyOptions {
	shellPath: string;
	cols: number;
	rows: number;
	cwd: string;
}

/**
 * Loads node-pty via electronRequire and manages PTY processes.
 * Tries the plugin directory's node_modules/node-pty first, falls back to global.
 */
export function loadNodePty(app: App): typeof import("node-pty") {
	const adapter = app.vault.adapter as FileSystemAdapter;
	const basePath = adapter.getBasePath();
	const pluginPath = path.join(basePath, app.vault.configDir, "plugins", "oh-my-til");
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
			FORCE_HYPERLINK: "1",
		},
	});
}
