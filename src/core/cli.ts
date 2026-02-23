/**
 * CLI argument parsing — pure function, no side effects.
 */
export function parseArgs(args: string[]): { positional: string[]; options: Record<string, string> } {
	const positional: string[] = [];
	const options: Record<string, string> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg.startsWith("--") && i + 1 < args.length) {
			options[arg.slice(2)] = args[++i]!;
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}
	return { positional, options };
}
