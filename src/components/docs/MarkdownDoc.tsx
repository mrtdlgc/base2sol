import path from "node:path";
import type { ReactNode } from "react";

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("#") ||
    line.startsWith("```") ||
    line.startsWith("- ") ||
    /^\d+\.\s/.test(line) ||
    line.startsWith("|")
  );
}

function splitTableLine(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function docsHrefFromMarkdown(href: string, currentFile: string): string {
  if (/^(https?:)?\/\//.test(href) || href.startsWith("#") || href.startsWith("/")) {
    return href;
  }

  if (!href.endsWith(".md")) {
    return href;
  }

  const resolved = path.posix
    .normalize(path.posix.join(path.posix.dirname(currentFile.replaceAll("\\", "/")), href))
    .replace(/^docs\//, "")
    .replace(/\.md$/, "");

  return resolved === "README" ? "/docs" : `/docs/${resolved}`;
}

function renderInline(text: string, currentFile: string): ReactNode[] {
  const out: ReactNode[] = [];
  const regex = /(`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      out.push(<code key={out.length}>{match[2]}</code>);
    } else if (match[3] && match[4]) {
      out.push(
        <a key={out.length} href={docsHrefFromMarkdown(match[4], currentFile)}>
          {match[3]}
        </a>
      );
    } else if (match[5]) {
      out.push(<strong key={out.length}>{match[5]}</strong>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out;
}

export function MarkdownDoc({
  markdown,
  currentFile,
}: {
  markdown: string;
  currentFile: string;
}) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={blocks.length}>
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const body = renderInline(heading[2], currentFile);
      if (level === 1) blocks.push(<h1 key={blocks.length}>{body}</h1>);
      if (level === 2) blocks.push(<h2 key={blocks.length}>{body}</h2>);
      if (level === 3) blocks.push(<h3 key={blocks.length}>{body}</h3>);
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      const headers = splitTableLine(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableLine(lines[i].trim()));
        i += 1;
      }
      blocks.push(
        <table key={blocks.length}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{renderInline(header, currentFile)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderInline(cell, currentFile)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2));
        i += 1;
      }
      blocks.push(
        <ul key={blocks.length}>
          {items.map((item, index) => (
            <li key={index}>{renderInline(item, currentFile)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={blocks.length}>
          {items.map((item, index) => (
            <li key={index}>{renderInline(item, currentFile)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [trimmed];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(<p key={blocks.length}>{renderInline(paragraph.join(" "), currentFile)}</p>);
  }

  return <div className="markdown-doc">{blocks}</div>;
}
