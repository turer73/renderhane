"use client";

import { useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Simple Markdown → HTML renderer (no external dependencies).
 * Supports: headings, bold, italic, code blocks, inline code,
 * links, tables, lists, and horizontal rules.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className="prose prose-neutral dark:prose-invert max-w-none
        prose-headings:scroll-mt-20
        prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4
        prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3
        prose-p:leading-relaxed prose-p:mb-4
        prose-a:text-primary prose-a:underline
        prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4 prose-pre:overflow-x-auto
        prose-table:border-collapse prose-table:w-full
        prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted prose-th:text-left prose-th:text-sm prose-th:font-semibold
        prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-sm
        prose-li:mb-1
        prose-strong:font-semibold
        prose-hr:my-8"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  let listType: "ul" | "ol" = "ul";

  function flushList() {
    if (inList && listItems.length > 0) {
      const tag = listType;
      result.push(`<${tag}>${listItems.join("")}</${tag}>`);
      listItems = [];
      inList = false;
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      const headerRow = tableRows[0];
      const bodyRows = tableRows.slice(1);
      result.push(
        `<table><thead>${headerRow}</thead><tbody>${bodyRows.join("")}</tbody></table>`
      );
      tableRows = [];
      inTable = false;
    }
  }

  function inlineFormat(text: string): string {
    // Inline code
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Links — escape href and label, and reject javascript:/data:/vbscript: schemes
    // so a future user-generated markdown source cannot inject script execution.
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label: string, href: string) => {
        const safeHref = isSafeHref(href) ? escapeHtml(href) : "#";
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
      }
    );
    return text;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        result.push(
          `<pre><code>${escapeHtml(codeBlockContent.join("\n"))}</code></pre>`
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      flushTable();
      continue;
    }

    // Table rows
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushList();
      const cells = line
        .split("|")
        .filter((c) => c.trim() !== "")
        .map((c) => c.trim());

      // Skip separator rows (|---|---|)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }

      const isHeader = !inTable;
      const tag = isHeader ? "th" : "td";
      const row = `<tr>${cells.map((c) => `<${tag}>${inlineFormat(c)}</${tag}>`).join("")}</tr>`;
      tableRows.push(row);
      inTable = true;
      continue;
    }

    // If we were in a table but this line isn't a table row
    if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      result.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      result.push("<hr />");
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        flushList();
        inList = true;
        listType = "ul";
      }
      listItems.push(`<li>${inlineFormat(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        flushList();
        inList = true;
        listType = "ol";
      }
      listItems.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    // Paragraph
    flushList();
    result.push(`<p>${inlineFormat(line)}</p>`);
  }

  flushList();
  flushTable();

  return result.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Allow http/https/mailto/tel/relative paths; reject javascript:, data:, vbscript: */
function isSafeHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
    return false;
  }
  return true;
}
