import { strFromU8, unzipSync } from "fflate";
import { normalizeLinesToBlocks } from "../document/detect";
import type { DocumentBlockRole } from "../document/types";
import { analyzeHwpxFormatGrammar } from "./formatGrammar";
import type { HwpxFormatGrammar } from "./formatGrammar";
import { analyzeHwpxFormatProfile } from "./formatProfile";
import type { HwpxFormatProfile } from "./formatProfile";

export interface HwpxParagraphStyle {
  paraPrIDRef: string;
  charPrIDRef: string;
  styleIDRef: string;
}

export type HwpxStyleMap = Record<DocumentBlockRole, HwpxParagraphStyle>;

export interface HwpxTemplate {
  files: Record<string, Uint8Array>;
  headerXml: string;
  sectionXml: string;
  sectionControlsXml: string;
  styleMap: HwpxStyleMap;
  styleDetails: Record<DocumentBlockRole, HwpxTextStyleSummary | null>;
  analysis: HwpxTemplateAnalysis;
  availableFonts: string[];
  formatProfile: HwpxFormatProfile;
  formatGrammar: HwpxFormatGrammar;
}

export interface HwpxTextStyleSummary {
  fontSizePt: number | null;
  textColor: string | null;
  charSpacing: number | null;
  bold: boolean;
}

export interface HwpxTemplateAnalysis {
  paragraphCount: number;
  tableCount: number;
  leadingTitleTableCount: number;
  bodyTableCount: number;
}

const fallbackStyleMap: HwpxStyleMap = {
  title: { paraPrIDRef: "58", charPrIDRef: "63", styleIDRef: "1" },
  noticeNumber: { paraPrIDRef: "38", charPrIDRef: "116", styleIDRef: "1" },
  body: { paraPrIDRef: "0", charPrIDRef: "29", styleIDRef: "0" },
  section: { paraPrIDRef: "53", charPrIDRef: "39", styleIDRef: "0" },
  koreanItem: { paraPrIDRef: "55", charPrIDRef: "57", styleIDRef: "19" },
  dashItem: { paraPrIDRef: "64", charPrIDRef: "9", styleIDRef: "0" },
  tableRow: { paraPrIDRef: "0", charPrIDRef: "29", styleIDRef: "0" },
  image: { paraPrIDRef: "0", charPrIDRef: "29", styleIDRef: "0" },
  note: { paraPrIDRef: "67", charPrIDRef: "76", styleIDRef: "0" }
};

export function loadHwpxTemplate(data: ArrayBuffer | Uint8Array): HwpxTemplate {
  const files = unzipSync(toUint8Array(data));
  const header = files["Contents/header.xml"];
  const section = files["Contents/section0.xml"];

  if (header === undefined || section === undefined) {
    throw new Error("HWPX template must contain Contents/header.xml and Contents/section0.xml");
  }

  const sectionXml = strFromU8(section);
  const headerXml = strFromU8(header);
  const styleMap = inferStyleMap(sectionXml);
  const analysis = analyzeTemplate(sectionXml);
  const formatProfile = analyzeHwpxFormatProfile(headerXml, sectionXml);

  return {
    files,
    headerXml,
    sectionXml,
    sectionControlsXml: extractSectionControls(sectionXml),
    styleMap,
    styleDetails: extractStyleDetails(headerXml, styleMap),
    analysis,
    availableFonts: extractAvailableFonts(headerXml),
    formatProfile,
    formatGrammar: analyzeHwpxFormatGrammar(formatProfile, { titleTableCount: analysis.leadingTitleTableCount })
  };
}

function inferStyleMap(sectionXml: string): HwpxStyleMap {
  const inferred = { ...fallbackStyleMap };
  const paragraphPattern = /<hp:p\b([^>]*)>([\s\S]*?)<\/hp:p>/g;
  const paragraphs: Array<{ attrs: string; body: string; text: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(sectionXml)) !== null) {
    const paragraphAttrs = match[1] ?? "";
    const paragraphBody = match[2] ?? "";
    const text = extractParagraphText(paragraphBody);

    if (text.trim().length === 0) {
      continue;
    }

    paragraphs.push({ attrs: paragraphAttrs, body: paragraphBody, text });
  }

  const roles = normalizeLinesToBlocks(paragraphs.map((paragraph) => paragraph.text));
  const seenRoles = new Set<DocumentBlockRole>();

  paragraphs.forEach((paragraph, index) => {
    const role = roles[index]?.role;

    if (role === undefined || seenRoles.has(role)) {
      return;
    }

    const paraPrIDRef = readXmlAttribute(paragraph.attrs, "paraPrIDRef");
    const styleIDRef = readXmlAttribute(paragraph.attrs, "styleIDRef");
    const charPrIDRef = readFirstRunCharPr(paragraph.body);

    if (paraPrIDRef !== null && styleIDRef !== null && charPrIDRef !== null) {
      inferred[role] = { paraPrIDRef, charPrIDRef, styleIDRef };
      seenRoles.add(role);
    }
  });

  applySampleStructureFallbacks(inferred, paragraphs, seenRoles);

  return inferred;
}

function applySampleStructureFallbacks(
  inferred: HwpxStyleMap,
  paragraphs: Array<{ attrs: string; body: string; text: string }>,
  seenRoles: Set<DocumentBlockRole>
): void {
  const candidates = paragraphs
    .map((paragraph) => ({
      text: normalizeWhitespace(paragraph.text),
      style: readParagraphStyle(paragraph.attrs, paragraph.body)
    }))
    .filter((candidate): candidate is { text: string; style: HwpxParagraphStyle } => candidate.style !== null);
  const firstRoundBulletIndex = candidates.findIndex((candidate) => candidate.text.startsWith("○"));
  const firstRoundBullet = firstRoundBulletIndex < 0 ? undefined : candidates[firstRoundBulletIndex];
  const firstArticleHeading =
    findHeadingBefore(candidates, firstRoundBulletIndex, inferred.title) ??
    candidates.find((candidate) => isLikelyArticleHeading(candidate.text, candidate.style, inferred.title));

  if (!seenRoles.has("section") && firstArticleHeading !== undefined) {
    inferred.section = firstArticleHeading.style;
  }

  if (!seenRoles.has("dashItem") && firstRoundBullet !== undefined) {
    inferred.dashItem = firstRoundBullet.style;
  }

  if (!seenRoles.has("tableRow") && firstRoundBullet !== undefined) {
    inferred.tableRow = firstRoundBullet.style;
  }

  if (isLikelyTitleIssueStyle(inferred.body, inferred.title) && firstRoundBullet !== undefined) {
    inferred.body = firstRoundBullet.style;
  }
}

function findHeadingBefore(
  candidates: Array<{ text: string; style: HwpxParagraphStyle }>,
  beforeIndex: number,
  titleStyle: HwpxParagraphStyle
): { text: string; style: HwpxParagraphStyle } | undefined {
  if (beforeIndex < 0) {
    return undefined;
  }

  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];

    if (candidate !== undefined && isLikelyArticleHeading(candidate.text, candidate.style, titleStyle)) {
      return candidate;
    }
  }

  return undefined;
}

function readParagraphStyle(attrs: string, body: string): HwpxParagraphStyle | null {
  const paraPrIDRef = readXmlAttribute(attrs, "paraPrIDRef");
  const styleIDRef = readXmlAttribute(attrs, "styleIDRef");
  const charPrIDRef = readFirstRunCharPr(body);

  return paraPrIDRef !== null && styleIDRef !== null && charPrIDRef !== null
    ? { paraPrIDRef, styleIDRef, charPrIDRef }
    : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyArticleHeading(text: string, style: HwpxParagraphStyle, titleStyle: HwpxParagraphStyle): boolean {
  if (
    text.length === 0 ||
    text.length > 40 ||
    text.startsWith("○") ||
    text.startsWith("-") ||
    text.startsWith("–") ||
    isTemplateInstructionText(text) ||
    isSameParagraphStyle(style, titleStyle)
  ) {
    return false;
  }

  return !/(?:BRIEF|통권|탄소중립 정보공유|전국 소식|울산 소식|센터 소식)/u.test(text);
}

function isSameParagraphStyle(left: HwpxParagraphStyle, right: HwpxParagraphStyle): boolean {
  return (
    left.paraPrIDRef === right.paraPrIDRef &&
    left.charPrIDRef === right.charPrIDRef &&
    left.styleIDRef === right.styleIDRef
  );
}

function isTemplateInstructionText(text: string): boolean {
  return text.startsWith("<") && text.endsWith(">");
}

function isLikelyTitleIssueStyle(body: HwpxParagraphStyle, title: HwpxParagraphStyle): boolean {
  return body.paraPrIDRef === title.paraPrIDRef || body.paraPrIDRef === "19";
}

function extractSectionControls(sectionXml: string): string {
  const secPr = sectionXml.match(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/)?.[0] ?? "";
  const colPr = sectionXml.match(/<hp:ctrl>\s*<hp:colPr\b[\s\S]*?<\/hp:ctrl>/)?.[0] ?? "";

  return `${secPr}${colPr}`;
}

function analyzeTemplate(sectionXml: string): HwpxTemplateAnalysis {
  const tableCount = sectionXml.match(/<hp:tbl\b/g)?.length ?? 0;
  const paragraphCount = sectionXml.match(/<hp:p\b/g)?.length ?? 0;
  const leadingTitleTableCount = countLeadingTitleTables(sectionXml);

  return {
    paragraphCount,
    tableCount,
    leadingTitleTableCount,
    bodyTableCount: Math.max(0, tableCount - leadingTitleTableCount)
  };
}

function countLeadingTitleTables(sectionXml: string): number {
  const sectionOpenMatch = sectionXml.match(/<hs:sec\b[^>]*>/);

  if (sectionOpenMatch?.index === undefined) {
    return 0;
  }

  const contentStart = sectionOpenMatch.index + sectionOpenMatch[0].length;
  const contentEnd = sectionXml.lastIndexOf("</hs:sec>");
  const contentXml = contentEnd > contentStart ? sectionXml.slice(contentStart, contentEnd) : "";
  const blocks = readTopLevelBlocks(contentXml);
  const firstTableIndex = blocks.findIndex((block) => block.xml.includes("<hp:tbl"));

  if (firstTableIndex < 0) {
    return 0;
  }

  let count = 0;

  for (let index = firstTableIndex; index < blocks.length; index += 1) {
    if (!blocks[index].xml.includes("<hp:tbl")) {
      break;
    }

    count += blocks[index].xml.match(/<hp:tbl\b/g)?.length ?? 0;
  }

  return count;
}

function readTopLevelBlocks(contentXml: string): Array<{ start: number; end: number; xml: string }> {
  const blocks: Array<{ start: number; end: number; xml: string }> = [];
  let cursor = 0;

  while (cursor < contentXml.length) {
    const paragraphStart = contentXml.indexOf("<hp:p", cursor);
    const tableStart = contentXml.indexOf("<hp:tbl", cursor);
    const starts = [paragraphStart, tableStart].filter((value) => value >= 0);

    if (starts.length === 0) {
      break;
    }

    const start = Math.min(...starts);
    const tagName = start === paragraphStart ? "hp:p" : "hp:tbl";
    const end = findElementEnd(contentXml, start, tagName);

    if (end === null) {
      break;
    }

    blocks.push({ start, end, xml: contentXml.slice(start, end) });
    cursor = end;
  }

  return blocks;
}

function findElementEnd(xml: string, start: number, tagName: string): number | null {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b|</${escapeRegExp(tagName)}>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;

      if (depth === 0) {
        return pattern.lastIndex;
      }
    } else {
      depth += 1;
    }
  }

  return null;
}

function extractStyleDetails(
  headerXml: string,
  styleMap: HwpxStyleMap
): Record<DocumentBlockRole, HwpxTextStyleSummary | null> {
  return Object.fromEntries(
    Object.entries(styleMap).map(([role, style]) => [role, extractTextStyleSummary(headerXml, style.charPrIDRef)])
  ) as Record<DocumentBlockRole, HwpxTextStyleSummary | null>;
}

function extractTextStyleSummary(headerXml: string, charPrIDRef: string): HwpxTextStyleSummary | null {
  const charPr = findCharPrXml(headerXml, charPrIDRef);

  if (charPr === null) {
    return null;
  }

  const height = readXmlAttribute(charPr, "height");
  const charSpacing = charPr.match(/<hh:spacing\b[^>]*\bhangul="(-?\d+)"/)?.[1] ?? null;

  return {
    fontSizePt: height === null ? null : Number.parseInt(height, 10) / 100,
    textColor: readXmlAttribute(charPr, "textColor"),
    charSpacing: charSpacing === null ? null : Number.parseInt(charSpacing, 10),
    bold: charPr.includes("<hh:bold")
  };
}

function findCharPrXml(headerXml: string, charPrIDRef: string): string | null {
  const match = headerXml.match(new RegExp(`<hh:charPr\\b[^>]*\\bid="${escapeRegExp(charPrIDRef)}"[\\s\\S]*?</hh:charPr>`));

  return match?.[0] ?? null;
}

function extractParagraphText(paragraphBody: string): string {
  const textMatches = paragraphBody.matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g);
  return Array.from(textMatches, (match) => stripXmlTags(match[1] ?? "")).join("");
}

function readFirstRunCharPr(paragraphBody: string): string | null {
  const runAttrs = paragraphBody.match(/<hp:run\b([^>]*)>/)?.[1];
  return runAttrs === undefined ? null : readXmlAttribute(runAttrs, "charPrIDRef");
}

function readXmlAttribute(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function stripXmlTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(data);
}

function extractAvailableFonts(headerXml: string): string[] {
  const fonts = new Set<string>();

  for (const match of headerXml.matchAll(/<hh:font\b[^>]*\bface="([^"]+)"/g)) {
    const face = match[1];

    if (face !== undefined && face.length > 0) {
      fonts.add(face);
    }
  }

  return Array.from(fonts).sort((a, b) => a.localeCompare(b, "ko"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
