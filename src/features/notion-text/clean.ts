export function cleanNotionLine(line: string): string {
  const heading = line.match(/^\s*#{1,6}\s+(.*)$/u);

  if (heading !== null) {
    return cleanInlineMarkdown(heading[1] ?? "").trim();
  }

  const leadingWhitespace = line.match(/^\s*/u)?.[0] ?? "";
  const content = cleanInlineMarkdown(line.slice(leadingWhitespace.length)).replace(/[ \t]{2,}/g, " ").trimEnd();

  return `${leadingWhitespace}${content}`;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+(?:\s+"[^"]*")?\)/gu, "$1")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[*_`~]/gu, "")
    .replace(/\u00a0/gu, " ");
}
