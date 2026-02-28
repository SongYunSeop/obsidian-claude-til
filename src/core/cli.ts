import * as path from "path";
import * as os from "os";

const VALUE_OPTIONS = new Set(["port", "til-path", "out", "title", "subtitle", "github", "mode"]);
const BOOLEAN_OPTIONS = new Set(["no-obsidian"]);

/**
 * CLI argument parsing — pure function, no side effects.
 */
export function parseArgs(args: string[]): { positional: string[]; options: Record<string, string> } {
	const positional: string[] = [];
	const options: Record<string, string> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg.startsWith("--") && VALUE_OPTIONS.has(arg.slice(2)) && i + 1 < args.length) {
			options[arg.slice(2)] = args[++i]!;
		} else if (arg.startsWith("--") && BOOLEAN_OPTIONS.has(arg.slice(2))) {
			options[arg.slice(2)] = "true";
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}
	return { positional, options };
}

/**
 * Expand leading `~` to the user's home directory.
 */
export function expandTilde(p: string): string {
	if (p === "~" || p.startsWith("~/")) {
		return path.join(os.homedir(), p.slice(1));
	}
	return p;
}
