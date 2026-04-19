import Link from "next/link";
import { Fragment, ReactNode } from "react";

import { DiagramBlock } from "@/components/blog/diagrams";
import { MarkdownBlock } from "@/lib/blog/types";

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-900 dark:bg-slate-800/80 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (/^\[[^\]]+\]\([^)]+\)$/.test(part)) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (!match) {
        return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
      }

      const [, label, href] = match;
      const external = href.startsWith("http");

      return external ? (
        <a
          key={`${part}-${index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-slate-900 underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-slate-900 dark:text-slate-200 dark:decoration-slate-600 dark:hover:decoration-slate-300"
        >
          {label}
        </a>
      ) : (
        <Link
          key={`${part}-${index}`}
          href={href}
          className="text-slate-900 underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-slate-900 dark:text-slate-200 dark:decoration-slate-600 dark:hover:decoration-slate-300"
        >
          {label}
        </Link>
      );
    }

    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-slate-950 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (/^\*[^*]+\*$/.test(part)) {
      return (
        <em key={`${part}-${index}`} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

type MarkdownRendererProps = {
  blocks: MarkdownBlock[];
};

export function MarkdownRenderer({ blocks }: MarkdownRendererProps) {
  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const HeadingTag = `h${block.level}` as keyof JSX.IntrinsicElements;
          const className =
            block.level === 1
              ? "text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100"
              : block.level === 2
                ? "mt-14 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100"
                : "mt-10 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100";

          return (
            <HeadingTag key={`${block.id}-${index}`} id={block.id} className={className}>
              {block.text}
            </HeadingTag>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={`paragraph-${index}`} className="text-[1.02rem] leading-8 text-slate-700 dark:text-slate-300/95">
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul key={`ul-${index}`} className="list-disc space-y-2 pl-6 text-[1.02rem] leading-8 text-slate-700 marker:text-slate-400 dark:text-slate-300/95 dark:marker:text-slate-600">
              {block.items.map((item) => (
                <li key={item}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol key={`ol-${index}`} className="list-decimal space-y-2 pl-6 text-[1.02rem] leading-8 text-slate-700 marker:text-slate-400 dark:text-slate-300/95 dark:marker:text-slate-600">
              {block.items.map((item) => (
                <li key={item}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={`blockquote-${index}`}
              className="border-l-2 border-slate-300 pl-5 text-[1.02rem] leading-8 text-slate-600 dark:border-slate-700 dark:text-slate-400/95"
            >
              {renderInline(block.text)}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <div key={`code-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-700/80 dark:bg-[#111827]">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-[0.24em] text-slate-400 dark:border-slate-700/80 dark:text-slate-500">
                <span>{block.language || "code"}</span>
              </div>
              <pre className="overflow-x-auto p-4 text-sm leading-7 text-slate-100 dark:text-slate-200">
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div key={`table-${index}`} className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60">
                  <tr>
                    {block.headers.map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className="transition-colors hover:bg-secondary/30">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-4 py-3 leading-6 text-foreground/80">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "diagram") {
          return <DiagramBlock key={`diagram-${index}`} name={block.name} />;
        }

        return <hr key={`hr-${index}`} className="border-slate-200 dark:border-slate-800" />;
      })}
    </div>
  );
}
