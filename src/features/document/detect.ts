import type { DocumentBlock, DocumentBlockRole } from "./types";

const noticeNumberPattern = /^[\p{Script=Hangul}\s]*공고\s*제?\d{4}[-–]\d+호/u;
const datePattern = /^\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?(?:\s|$)/u;
const sectionPattern = /^\s*\d+\.\s+\S/u;
const koreanItemPattern = /^\s*[가-힣]\.\s+\S/u;
const dashItemPattern = /^\s*[-–]\s+\S/u;
const notePattern = /^\s*※\s*\S/u;
const titlePattern = /(?:공고|공모전|제안요청서|모집|안내|계획)/u;
const markdownTableRowPattern = /^\s*\|.*\|\s*$/u;
const tableRowPattern = /\S\t\S/u;
const markdownImagePattern = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/u;

export function detectBlockRole(line: string, nonEmptyIndex: number): DocumentBlockRole {
  const normalized = line.trim();

  if (noticeNumberPattern.test(normalized)) {
    return "noticeNumber";
  }

  if (datePattern.test(line)) {
    return "body";
  }

  if (sectionPattern.test(line)) {
    return "section";
  }

  if (koreanItemPattern.test(line)) {
    return "koreanItem";
  }

  if (dashItemPattern.test(line)) {
    return "dashItem";
  }

  if (notePattern.test(line)) {
    return "note";
  }

  if (markdownTableRowPattern.test(line) || tableRowPattern.test(line)) {
    return "tableRow";
  }

  if (markdownImagePattern.test(line)) {
    return "body";
  }

  if (nonEmptyIndex === 0) {
    return "title";
  }

  return "body";
}

export function normalizeLinesToBlocks(lines: string[]): DocumentBlock[] {
  const nonEmptyLines = lines
    .filter((line) => line.trim().length > 0)
    .filter((line) => !isMarkdownTableDivider(line));
  let sawNoticeNumber = false;
  let titleAssigned = false;

  return nonEmptyLines.map((rawText, index) => {
    const text = normalizeTableRowText(rawText);
    const detectedRole = detectBlockRole(text, index);
    const role = promoteTitleAfterNotice(text, detectedRole, sawNoticeNumber, titleAssigned);

    if (role === "noticeNumber") {
      sawNoticeNumber = true;
    }

    if (role === "title") {
      titleAssigned = true;
    }

    return {
      id: `block-${index + 1}`,
      role,
      text
    };
  });
}

function normalizeTableRowText(text: string): string {
  if (!markdownTableRowPattern.test(text)) {
    return text;
  }

  return text
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim())
    .join("\t");
}

function isMarkdownTableDivider(text: string): boolean {
  if (!markdownTableRowPattern.test(text)) {
    return false;
  }

  return text
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

function promoteTitleAfterNotice(
  text: string,
  role: DocumentBlockRole,
  sawNoticeNumber: boolean,
  titleAssigned: boolean
): DocumentBlockRole {
  if (role !== "body" || !sawNoticeNumber || titleAssigned) {
    return role;
  }

  return titlePattern.test(text) ? "title" : role;
}
