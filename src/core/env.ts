/**
 * macOS GUI 앱(Electron)은 셸의 전체 PATH를 상속받지 못한다.
 * Homebrew 등 사용자 도구 경로를 보장하기 위해 공통 경로를 추가한다.
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
