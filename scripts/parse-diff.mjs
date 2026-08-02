#!/usr/bin/env node
/**
 * parse-snapshot.mjs 가 만든 두 스냅샷을 비교한다.
 *
 *   node scripts/parse-diff.mjs .parse-snapshots/before.json .parse-snapshots/after.json
 *
 * 파서를 고친 뒤 기존 글의 해석이 달라졌는지 확인하는 용도다.
 * 새 문법을 쓰는 글이 없다면 "차이 없음"이 나와야 정상이고,
 * 차이가 뜨면 의도한 변화인지 회귀인지 판단해야 한다.
 *
 * 종료 코드: 차이 없으면 0, 있으면 1 (CI 에서 바로 쓸 수 있게)
 */
import fs from "node:fs";
import path from "node:path";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("사용법: node scripts/parse-diff.mjs <before.json> <after.json>");
  process.exit(2);
}

const before = JSON.parse(fs.readFileSync(beforePath, "utf-8"));
const after = JSON.parse(fs.readFileSync(afterPath, "utf-8"));

const slugs = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
const changed = [];

for (const slug of slugs) {
  const a = before[slug];
  const b = after[slug];

  if (!a) { changed.push({ slug, kind: "추가된 글" }); continue; }
  if (!b) { changed.push({ slug, kind: "사라진 글" }); continue; }

  const aBlocks = a.blocks ?? [];
  const bBlocks = b.blocks ?? [];

  if (aBlocks.length !== bBlocks.length) {
    changed.push({ slug, kind: `블록 수 ${aBlocks.length} → ${bBlocks.length}` });
    continue;
  }

  const diffs = [];
  for (let i = 0; i < aBlocks.length; i += 1) {
    const x = JSON.stringify(aBlocks[i]);
    const y = JSON.stringify(bBlocks[i]);
    if (x !== y) diffs.push({ index: i, type: aBlocks[i].type, before: x, after: y });
  }
  if (diffs.length) changed.push({ slug, kind: `블록 ${diffs.length}개 변경`, diffs });
}

if (!changed.length) {
  console.log(`차이 없음 (글 ${slugs.length}편 비교)`);
  process.exit(0);
}

console.log(`차이 발견: ${changed.length}편 / 전체 ${slugs.length}편\n`);
for (const c of changed) {
  console.log(`■ ${c.slug} - ${c.kind}`);
  for (const d of (c.diffs ?? []).slice(0, 5)) {
    console.log(`   [${d.index}] ${d.type}`);
    console.log(`     before: ${d.before.slice(0, 160)}`);
    console.log(`     after : ${d.after.slice(0, 160)}`);
  }
  if ((c.diffs?.length ?? 0) > 5) console.log(`   ... 외 ${c.diffs.length - 5}개`);
  console.log();
}
process.exit(1);
