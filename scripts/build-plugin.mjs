/**
 * Claude Code Plugin 빌드 스크립트.
 * vault-assets/에서 소스를 읽어 dist/claude-plugin/ 디렉토리에
 * Claude Code Plugin 규격에 맞는 구조를 생성한다.
 *
 * - skills/, agents/: __PLUGIN_VERSION__ 플레이스홀더를 실제 버전으로 치환
 * - hooks/, scripts/: 훅 설정 및 스크립트 복사
 * - .mcp.json: MCP 서버 자동 등록 설정
 * - .claude-plugin/plugin.json: 플러그인 매니페스트
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist", "claude-plugin");
const ASSETS = path.join(ROOT, "vault-assets");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const VERSION = pkg.version;
const PLACEHOLDER = "__PLUGIN_VERSION__";

function clean() {
	if (fs.existsSync(OUT)) {
		fs.rmSync(OUT, { recursive: true });
	}
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

/** 파일 내용에서 __PLUGIN_VERSION__을 실제 버전으로 치환 */
function resolveVersion(content) {
	return content.replaceAll(PLACEHOLDER, VERSION);
}

const TEXT_EXTENSIONS = new Set([".md", ".json", ".sh", ".txt", ".yaml", ".yml"]);

/** 디렉토리를 재귀 복사하며 텍스트 파일의 버전 플레이스홀더 치환 (바이너리 파일은 그대로 복사) */
function copyDir(src, dest) {
	ensureDir(dest);
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			const content = fs.readFileSync(srcPath, "utf-8");
			fs.writeFileSync(destPath, resolveVersion(content));
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function buildManifest() {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf-8"),
	);
	manifest.version = VERSION;

	const destDir = path.join(OUT, ".claude-plugin");
	ensureDir(destDir);
	fs.writeFileSync(path.join(destDir, "plugin.json"), JSON.stringify(manifest, null, "\t") + "\n");
}

function buildSkills() {
	copyDir(path.join(ASSETS, "skills"), path.join(OUT, "skills"));
}

function buildAgents() {
	copyDir(path.join(ASSETS, "agents"), path.join(OUT, "agents"));
}

function buildHooks() {
	const hooksDir = path.join(OUT, "hooks");
	ensureDir(hooksDir);
	fs.copyFileSync(
		path.join(ASSETS, "plugin", "hooks.json"),
		path.join(hooksDir, "hooks.json"),
	);

	const scriptsDir = path.join(OUT, "scripts");
	ensureDir(scriptsDir);
	const shDest = path.join(scriptsDir, "notify-complete.sh");
	fs.copyFileSync(path.join(ASSETS, "hooks", "notify-complete.sh"), shDest);
	fs.chmodSync(shDest, 0o755);
}

function buildMcp() {
	fs.copyFileSync(
		path.join(ASSETS, "plugin", "mcp.json"),
		path.join(OUT, ".mcp.json"),
	);
}

// Main
clean();
ensureDir(OUT);

buildManifest();
buildSkills();
buildAgents();
buildHooks();
buildMcp();

console.log(`Claude Code Plugin built: dist/claude-plugin/ (v${VERSION})`);
