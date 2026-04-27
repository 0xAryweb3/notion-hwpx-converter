import type { DocumentBlock, DocumentBlockRole } from "./types";

const noticeNumberPattern = /^[\p{Script=Hangul}\s]*공고\s*제?\d{4}[-–]\d+호/u;
const sectionPattern = /^\s*\d+\.\s+\S/u;
const koreanItemPattern = /^\s*[가-힣]\.\s+\S/u;
const dashItemPattern = /^\s*[-–]\s+\S/u;
const notePattern = /^\s*※\s*\S/u;

export function detectBlockRole(line: string, nonEmptyIndex: number): DocumentBlockRole {
  const normalized = line.trim();

  if (noticeNumberPattern.test(normalized)) {
    return "noticeNumber";
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

  if (nonEmptyIndex === 0) {
    return "title";
  }

  return "body";
}

export function normalizeLinesToBlocks(lines: string[]): DocumentBlock[] {
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  return nonEmptyLines.map((text, index) => ({
    id: `block-${index + 1}`,
    role: detectBlockRole(text, index),
    text
  }));
}
