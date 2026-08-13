#!/usr/bin/env node
/**
 * 모든 글을 parseMarkdown()에 통과시켜 블록 트리를 JSON 스냅샷으로 저장한다.
 *
 * 파서를 수정하기 전후로 각각 실행해 parse-diff.mjs 로 비교하면,
 * 기존 글의 해석 결과가 바뀌었는지(= 회귀가 생겼는지) 알 수 있다.
 *
 *   node scripts/parse-snapshot.mjs .parse-snapshots/before.json
 *   node scripts/parse-snapshot.mjs .parse-snapshots/after.json
 *
 * 의존성을 새로 추가하지 않으려고, 이미 devDependency 로 있는 typescript 의
 * transpileModule 로 파서를 즉석에서 JS 로 바꿔 불러온다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_DIR = path.join(ROOT, "content/posts");
const LIB_DIR = path.join(ROOT, "src/lib/blog");

// --- 파서 로드 -------------------------------------------------------------
// markdown.ts 는 utils.ts(값)와 types.ts(타입)를 @/ 별칭으로 가져온다.
// 타입 import 는 트랜스파일 시 사라지고, utils 만 상대경로로 바꿔주면 된다.
async function loadParser() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-parser-"));

  for (const name of ["utils", "markdown"]) {
    const source = fs.readFileSync(path.join(LIB_DIR, `${name}.ts`), "utf-8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const rewritten = outputText
      .replace(/from\s+["']@\/lib\/blog\/(\w+)["']/g, 'from "./$1.mjs"')
      // 타입만 쓰는 import 가 남아있으면 제거 (해당 모듈은 만들지 않으므로)
      .replace(/^import\s+\{[^}]*\}\s+from\s+["']\.\/types\.mjs["'];?\s*$/gm, "");
    fs.writeFileSync(path.join(outDir, `${name}.mjs`), rewritten);
  }

  const mod = await import(pathToFileURL(path.join(outDir, "markdown.mjs")).href);
  return { parseMarkdown: mod.parseMarkdown, outDir };
}

// --- frontmatter 분리 (posts.ts 의 parseFrontmatter 와 동일 규칙) ----------
function stripFrontmatter(fileContent) {
  const lines = fileContent.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return fileContent.trim();

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      return lines.slice(i + 1).join("\n").trim();
    }
  }
  return fileContent.trim();
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith(".md") ? [full] : [];
  });
}

// --- 실행 ------------------------------------------------------------------
const outPath = path.resolve(process.argv[2] ?? ".parse-snapshots/snapshot.json");
const { parseMarkdown, outDir } = await loadParser();

const snapshot = {};
let blockCount = 0;

for (const file of walk(POSTS_DIR).sort()) {
  const slug = path.basename(file, ".md");
  const content = stripFrontmatter(fs.readFileSync(file, "utf-8"));
  const { blocks, toc } = parseMarkdown(content);
  snapshot[slug] = { blocks, toc };
  blockCount += blocks.length;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 1));
fs.rmSync(outDir, { recursive: true, force: true });

console.log(`글 ${Object.keys(snapshot).length}편 / 블록 ${blockCount}개 → ${path.relative(ROOT, outPath)}`);
