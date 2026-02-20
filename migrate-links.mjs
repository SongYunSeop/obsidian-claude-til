#!/usr/bin/env npx tsx

// scripts/migrate-links.ts
import * as fs from "fs";
import * as path from "path";

// src/migrate-links.ts
function parseWikilink(inner) {
  const pipeIndex = inner.search(/\\?\|/);
  if (pipeIndex === -1) {
    return { path: inner, displayText: inner };
  }
  const path2 = inner.slice(0, pipeIndex);
  const separatorLength = inner[pipeIndex] === "\\" ? 2 : 1;
  const displayText = inner.slice(pipeIndex + separatorLength);
  return { path: path2, displayText };
}
function toMarkdownLink(path2, displayText) {
  const mdPath = path2.endsWith(".md") ? path2 : `${path2}.md`;
  return `[${displayText}](${mdPath})`;
}
var WIKILINK_REGEX = /(```[\s\S]*?```|`[^`\n]+`)|(\[\[[^\[\]]+?\]\])/g;
function countWikilinks(content) {
  let count = 0;
  const regex = new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags);
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[2]) {
      count++;
    }
  }
  return count;
}
function migrateLinks(content) {
  let count = 0;
  const result = content.replace(
    new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags),
    (fullMatch, codeBlock, wikilink) => {
      if (codeBlock)
        return fullMatch;
      if (wikilink) {
        const inner = wikilink.slice(2, -2);
        const { path: path2, displayText } = parseWikilink(inner);
        count++;
        return toMarkdownLink(path2, displayText);
      }
      return fullMatch;
    }
  );
  return { content: result, count };
}
function hasWikilinks(content) {
  return countWikilinks(content) > 0;
}

// scripts/migrate-links.ts
var TARGET_DIRS = ["til", "Daily"];
function collectMarkdownFiles(vaultPath2) {
  const files = [];
  for (const dir of TARGET_DIRS) {
    const dirPath = path.join(vaultPath2, dir);
    if (!fs.existsSync(dirPath))
      continue;
    walkDir(dirPath, files);
  }
  return files.sort();
}
function walkDir(dirPath, result) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, result);
    } else if (entry.name.endsWith(".md")) {
      result.push(fullPath);
    }
  }
}
function scan(vaultPath2) {
  const files = collectMarkdownFiles(vaultPath2);
  let totalCount = 0;
  const results = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const count = countWikilinks(content);
    if (count > 0) {
      const rel = path.relative(vaultPath2, filePath);
      results.push({ file: rel, count });
      totalCount += count;
    }
  }
  if (results.length === 0) {
    console.log("\uBCC0\uD658\uD560 wikilink\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  console.log("| \uD30C\uC77C | wikilink \uC218 |");
  console.log("|------|------------|");
  for (const r of results) {
    console.log(`| ${r.file} | ${r.count} |`);
  }
  console.log();
  console.log(`\uCD1D ${results.length}\uAC1C \uD30C\uC77C\uC5D0\uC11C ${totalCount}\uAC1C\uC758 wikilink \uBC1C\uACAC`);
}
function migrate(vaultPath2) {
  const files = collectMarkdownFiles(vaultPath2);
  let totalCount = 0;
  const results = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const { content: converted, count } = migrateLinks(content);
    if (count > 0) {
      fs.writeFileSync(filePath, converted, "utf-8");
      const rel = path.relative(vaultPath2, filePath);
      results.push({ file: rel, count });
      totalCount += count;
    }
  }
  if (results.length === 0) {
    console.log("\uBCC0\uD658\uD560 wikilink\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  console.log("| \uD30C\uC77C | \uBCC0\uD658 \uC218 |");
  console.log("|------|--------|");
  for (const r of results) {
    console.log(`| ${r.file} | ${r.count} |`);
  }
  console.log();
  console.log(`\uCD1D ${results.length}\uAC1C \uD30C\uC77C, ${totalCount}\uAC1C \uB9C1\uD06C \uBCC0\uD658 \uC644\uB8CC`);
}
function verify(vaultPath2) {
  const files = collectMarkdownFiles(vaultPath2);
  const remaining = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    if (hasWikilinks(content)) {
      const count = countWikilinks(content);
      const rel = path.relative(vaultPath2, filePath);
      remaining.push({ file: rel, count });
    }
  }
  if (remaining.length === 0) {
    console.log("\uBAA8\uB4E0 wikilink\uAC00 \uBCC0\uD658\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    return;
  }
  console.log("\uC794\uC5EC wikilink:");
  for (const r of remaining) {
    console.log(`  ${r.file}: ${r.count}\uAC1C`);
  }
}
var args = process.argv.slice(2);
var vaultPath = args[0];
var mode = args[1] || "scan";
if (!vaultPath) {
  console.error("Usage: npx tsx scripts/migrate-links.ts <vault-path> [scan|migrate|verify]");
  process.exit(1);
}
if (!fs.existsSync(vaultPath)) {
  console.error(`\uACBD\uB85C\uAC00 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4: ${vaultPath}`);
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
    console.error(`\uC54C \uC218 \uC5C6\uB294 \uBAA8\uB4DC: ${mode} (scan|migrate|verify)`);
    process.exit(1);
}
