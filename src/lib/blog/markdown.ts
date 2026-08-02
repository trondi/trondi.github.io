import { ListItem, MarkdownBlock, ParsedMarkdown } from "@/lib/blog/types";
import { slugifyHeading, stripMarkdown } from "@/lib/blog/utils";

const UNORDERED_ITEM = /^-\s+/;
const ORDERED_ITEM = /^\d+\.\s+/;

function indentOf(line: string) {
  return line.length - line.trimStart().length;
}

/**
 * 들여쓰기를 기준으로 리스트 하나를 파싱한다.
 *
 * - 같은 깊이의 마커  → 새 항목
 * - 더 깊은 마커      → 직전 항목의 중첩 리스트(children)
 * - 더 깊은 일반 텍스트 → 직전 항목에 이어붙임 (한 항목을 여러 줄로 쓴 경우)
 *
 * `-` 와 `1.` 이 같은 깊이에서 섞이면 서로 다른 리스트로 끊는다.
 */
function parseList(lines: string[], start: number, baseIndent: number) {
  const ordered = ORDERED_ITEM.test(lines[start].trim());
  const items: ListItem[] = [];
  let index = start;

  while (index < lines.length) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) break;

    const indent = indentOf(raw);
    const isItem = UNORDERED_ITEM.test(trimmed) || ORDERED_ITEM.test(trimmed);
    const last = items[items.length - 1];

    if (isItem && indent === baseIndent) {
      if (ordered !== ORDERED_ITEM.test(trimmed)) break;
      items.push({ text: trimmed.replace(ordered ? ORDERED_ITEM : UNORDERED_ITEM, "") });
      index += 1;
      continue;
    }

    if (isItem && indent > baseIndent && last) {
      const nested = parseList(lines, index, indent);
      last.children = [...(last.children ?? []), nested.block];
      index = nested.next;
      continue;
    }

    if (indent > baseIndent && last && !isSpecialLine(trimmed)) {
      last.text += ` ${trimmed}`;
      index += 1;
      continue;
    }

    break;
  }

  const block: MarkdownBlock = ordered
    ? { type: "ordered-list", items }
    : { type: "unordered-list", items };

  return { block, next: index };
}

function isSpecialLine(line: string) {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^-\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^---+$/.test(line) ||
    /^\|/.test(line)
  );
}

function parseTableCells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ParsedMarkdown["blocks"] = [];
  const toc: ParsedMarkdown["toc"] = [];
  const headingCounts = new Map<string, number>();

  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    if (trimmedLine.startsWith("```")) {
      const language = trimmedLine.replace(/```/, "").trim();

      // diagram block: ```diagram\n<name>\n```
      if (language === "diagram") {
        const innerLines: string[] = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith("```")) {
          innerLines.push(lines[index].trim());
          index += 1;
        }
        const name = innerLines.filter(Boolean).join("").trim();
        if (name) blocks.push({ type: "diagram", name });
        index += 1;
        continue;
      }

      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      index += 1;
      continue;
    }

    // table block
    if (/^\|/.test(trimmedLine)) {
      const headers = parseTableCells(trimmedLine);
      index += 1;
      // skip separator row (|---|---|)
      if (index < lines.length && /^\|[-| :]+\|/.test(lines[index].trim())) {
        index += 1;
      }
      const rows: string[][] = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) {
        rows.push(parseTableCells(lines[index].trim()));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = stripMarkdown(headingMatch[2]);
      const baseId = slugifyHeading(text);
      const count = headingCounts.get(baseId) ?? 0;
      const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
      headingCounts.set(baseId, count + 1);

      blocks.push({ type: "heading", level, text, id });
      if (level >= 2) {
        toc.push({ id, text, level });
      }
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmedLine)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmedLine)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    if (UNORDERED_ITEM.test(trimmedLine) || ORDERED_ITEM.test(trimmedLine)) {
      const { block, next } = parseList(lines, index, indentOf(rawLine));
      blocks.push(block);
      index = next;
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isSpecialLine(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    } else {
      blocks.push({ type: "paragraph", text: trimmedLine });
      index += 1;
    }
  }

  return { blocks, toc };
}
