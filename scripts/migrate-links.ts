#!/usr/bin/env npx tsx
/**
 * CLI: vault의 [[wikilink]]를 표준 마크다운 링크로 변환한다.
 *
 * Usage:
 *   npx tsx scripts/migrate-links.ts <vault-path> [scan|migrate|verify]
 *
 * Modes:
 *   scan     — wikilink가 포함된 파일과 개수를 출력 (기본값)
 *   migrate  — wikilink를 마크다운 링크로 변환
 *   verify   — 잔여 wikilink 존재 여부 확인
 */
import * as fs from "fs";
import * as path from "path";
import { countWikilinks, migrateLinks, hasWikilinks } from "../src/migrate-links";

const TARGET_DIRS = ["til", "Daily"];

function collectMarkdownFiles(vaultPath: string): string[] {
	const files: string[] = [];

	for (const dir of TARGET_DIRS) {
		const dirPath = path.join(vaultPath, dir);
		if (!fs.existsSync(dirPath)) continue;
		walkDir(dirPath, files);
	}

	return files.sort();
}

function walkDir(dirPath: string, result: string[]): void {
	for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			walkDir(fullPath, result);
		} else if (entry.name.endsWith(".md")) {
			result.push(fullPath);
		}
	}
}

function scan(vaultPath: string): void {
	const files = collectMarkdownFiles(vaultPath);
	let totalCount = 0;
	const results: { file: string; count: number }[] = [];

	for (const filePath of files) {
		const content = fs.readFileSync(filePath, "utf-8");
		const count = countWikilinks(content);
		if (count > 0) {
			const rel = path.relative(vaultPath, filePath);
			results.push({ file: rel, count });
			totalCount += count;
		}
	}

	if (results.length === 0) {
		console.log("변환할 wikilink가 없습니다.");
		return;
	}

	console.log("| 파일 | wikilink 수 |");
	console.log("|------|------------|");
	for (const r of results) {
		console.log(`| ${r.file} | ${r.count} |`);
	}
	console.log();
	console.log(`총 ${results.length}개 파일에서 ${totalCount}개의 wikilink 발견`);
}

function migrate(vaultPath: string): void {
	const files = collectMarkdownFiles(vaultPath);
	let totalCount = 0;
	const results: { file: string; count: number }[] = [];

	for (const filePath of files) {
		const content = fs.readFileSync(filePath, "utf-8");
		const { content: converted, count } = migrateLinks(content);
		if (count > 0) {
			fs.writeFileSync(filePath, converted, "utf-8");
			const rel = path.relative(vaultPath, filePath);
			results.push({ file: rel, count });
			totalCount += count;
		}
	}

	if (results.length === 0) {
		console.log("변환할 wikilink가 없습니다.");
		return;
	}

	console.log("| 파일 | 변환 수 |");
	console.log("|------|--------|");
	for (const r of results) {
		console.log(`| ${r.file} | ${r.count} |`);
	}
	console.log();
	console.log(`총 ${results.length}개 파일, ${totalCount}개 링크 변환 완료`);
}

function verify(vaultPath: string): void {
	const files = collectMarkdownFiles(vaultPath);
	const remaining: { file: string; count: number }[] = [];

	for (const filePath of files) {
		const content = fs.readFileSync(filePath, "utf-8");
		if (hasWikilinks(content)) {
			const count = countWikilinks(content);
			const rel = path.relative(vaultPath, filePath);
			remaining.push({ file: rel, count });
		}
	}

	if (remaining.length === 0) {
		console.log("모든 wikilink가 변환되었습니다.");
		return;
	}

	console.log("잔여 wikilink:");
	for (const r of remaining) {
		console.log(`  ${r.file}: ${r.count}개`);
	}
}

// --- main ---
const args = process.argv.slice(2);
const vaultPath = args[0];
const mode = args[1] || "scan";

if (!vaultPath) {
	console.error("Usage: npx tsx scripts/migrate-links.ts <vault-path> [scan|migrate|verify]");
	process.exit(1);
}

if (!fs.existsSync(vaultPath)) {
	console.error(`경로가 존재하지 않습니다: ${vaultPath}`);
	process.exit(1);
}

switch (mode) {
	case "scan":
		scan(vaultPath);
		break;
	case "migrate":
		migrate(vaultPath);
		break;
	case "verify":
		verify(vaultPath);
		break;
	default:
		console.error(`알 수 없는 모드: ${mode} (scan|migrate|verify)`);
		process.exit(1);
}
