/**
 * macOS GUI apps (Electron) do not inherit the full shell PATH.
 * Appends common paths to ensure Homebrew and other user tools are available.
 */
export function ensurePath(basePath: string | undefined): string {
	const extra = [
		"/opt/homebrew/bin",     // macOS Apple Silicon
		"/opt/homebrew/sbin",
		"/usr/local/bin",        // macOS Intel / Linux
		"/usr/local/sbin",
	];
	const current = basePath || "";
	const parts = current.split(":");
	const missing = extra.filter((p) => !parts.includes(p));
	return missing.length > 0 ? [...parts, ...missing].join(":") : current;
}
