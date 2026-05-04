import type { DocumentBlock } from "../document/types";
import { countTableGroups } from "./quality";
import type { HwpxStyleAssignment } from "./styleAssignment";

export type GeneratedOutputAuditSeverity = "error" | "warning" | "info";

export interface GeneratedOutputAuditIssue {
  severity: GeneratedOutputAuditSeverity;
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface GeneratedOutputAuditSummary {
  sourceBlocks: number;
  sourceTableGroups: number;
  outputParagraphs: number;
  outputTables: number;
  outputTitleTables: number;
  outputBodyTables: number;
  outputPictures: number;
  outputContainers: number;
  outputLineSegArrays: number;
  outputLineSegs: number;
  redRunCount: number;
  nonBlackGeneratedRunCount: number;
  badBulletIndentCount: number;
  badNonBulletIndentCount: number;
  badBulletStyleIndentCount: number;
  badNonBulletAutoHeadingCount: number;
  missingSourceTextCount: number;
  overflowRiskCount: number;
  pageOverflowCount: number;
}

export interface GeneratedOutputAudit {
  score: number;
  passed: boolean;
  summary: GeneratedOutputAuditSummary;
  issues: GeneratedOutputAuditIssue[];
}

export interface GeneratedOutputAuditInput {
  blocks: DocumentBlock[];
  assignments: HwpxStyleAssignment[];
  sectionXml: string;
  headerXml: string;
  titleTableCount: number;
  overflowLineThreshold?: number;
}

interface OutputParagraph {
  text: string;
  xml: string;
  paraPrIDRef: string | null;
  charPrIDs: string[];
  lineHorzPositions: number[];
  lines: OutputLine[];
  horzSize: number | null;
  textHeight: number | null;
}

interface OutputLine {
  vertPos: number;
  textHeight: number;
  spacing: number;
  horzPos: number;
}

interface OutputParagraphGeometry {
  text: string;
  pageIndex: number;
  lines: OutputLine[];
}

export function auditGeneratedHwpx(input: GeneratedOutputAuditInput): GeneratedOutputAudit {
  const paragraphs = extractOutputParagraphs(input.sectionXml);
  const topLevelGeometry = extractTopLevelParagraphGeometry(input.sectionXml);
  const outputText = normalizeText(paragraphs.map((paragraph) => paragraph.text).join("\n"));
  const outputTables = countMatches(input.sectionXml, /<hp:tbl\b/g);
  const outputBodyTables = Math.max(0, outputTables - input.titleTableCount);
  const redCharPrIDs = readRedCharPrIds(input.headerXml);
  const charColors = readCharColors(input.headerXml);
  const paragraphIntents = readParagraphIntents(input.headerXml);
  const paragraphHeadingTypes = readParagraphHeadingTypes(input.headerXml);
  const redRunCount = paragraphs.reduce(
    (sum, paragraph) => sum + paragraph.charPrIDs.filter((id) => redCharPrIDs.has(id)).length,
    0
  );
  const nonBlackGeneratedRunCount = countNonBlackGeneratedRuns(paragraphs, input.assignments, charColors);
  const sourceTableGroups = countTableGroups(input.blocks);
  const allowedStructureBodyTables = input.assignments.filter((assignment) =>
    assignment.type === "paragraph" && assignment.renderAs === "structureTable"
  ).length;
  const issues: GeneratedOutputAuditIssue[] = [];
  const badBulletIndentCount = countBadBulletIndents(paragraphs);
  const badNonBulletIndentCount = countBadNonBulletIndents(paragraphs, paragraphIntents);
  const badBulletStyleIndentCount = countBadBulletStyleIndents(paragraphs, paragraphIntents);
  const badNonBulletAutoHeadingCount = countBadNonBulletAutoHeadings(paragraphs, input.assignments, paragraphHeadingTypes);
  const missingAssignments = input.assignments.filter((assignment) =>
    assignment.type !== "image" &&
    coverageTextForAssignment(assignment).trim().length > 0 &&
    !outputText.includes(normalizeText(coverageTextForAssignment(assignment)))
  );
  const overflowRisks = findOverflowRisks(paragraphs, input.overflowLineThreshold ?? 12);
  const pageOverflows = findPageOverflows(topLevelGeometry, readPageContentHeight(input.sectionXml));

  if (sourceTableGroups === 0 && outputBodyTables > allowedStructureBodyTables) {
    issues.push({
      severity: "error",
      code: "unexpected-body-table",
      message: "입력에 표가 없는데 출력 본문 표가 생성되었습니다.",
      detail: { outputBodyTables, allowedStructureBodyTables }
    });
  }

  if (sourceTableGroups > 0 && outputBodyTables === 0) {
    issues.push({
      severity: "warning",
      code: "missing-body-table",
      message: "입력에 표가 있지만 출력 본문 표가 없습니다.",
      detail: { sourceTableGroups }
    });
  }

  if (countMatches(input.sectionXml, /<hp:container\b/g) > 0) {
    issues.push({
      severity: "error",
      code: "template-container-survived",
      message: "샘플 컨테이너 그래픽이 출력에 남아 있습니다."
    });
  }

  if (redRunCount > 0) {
    issues.push({
      severity: "error",
      code: "red-guide-style-used",
      message: "빨간 안내/가이드 스타일이 출력 본문에 사용되었습니다.",
      detail: { redRunCount }
    });
  }

  if (nonBlackGeneratedRunCount > 0) {
    issues.push({
      severity: "error",
      code: "non-black-generated-text",
      message: "생성 본문에 검정색이 아닌 글자 스타일이 사용되었습니다.",
      detail: { nonBlackGeneratedRunCount }
    });
  }

  if (badBulletIndentCount > 0) {
    issues.push({
      severity: "error",
      code: "bad-bullet-continuation-indent",
      message: "줄바꿈된 글머리 문단의 후속 줄 들여쓰기가 없습니다.",
      detail: { badBulletIndentCount }
    });
  }

  if (badNonBulletIndentCount > 0) {
    issues.push({
      severity: "error",
      code: "non-bullet-hanging-indent",
      message: "글머리 없는 문단에 내어쓰기 문단 스타일이 사용되었습니다.",
      detail: { badNonBulletIndentCount }
    });
  }

  if (badBulletStyleIndentCount > 0) {
    issues.push({
      severity: "error",
      code: "bullet-negative-indent-style",
      message: "글머리 문단이 출력용 들여쓰기 스타일 대신 음수 내어쓰기 문단 스타일을 사용했습니다.",
      detail: { badBulletStyleIndentCount }
    });
  }

  if (badNonBulletAutoHeadingCount > 0) {
    issues.push({
      severity: "error",
      code: "non-bullet-auto-heading",
      message: "글머리 없는 생성 문단에 한글 자동 글머리/개요 문단 스타일이 사용되었습니다.",
      detail: { badNonBulletAutoHeadingCount }
    });
  }

  for (const assignment of missingAssignments) {
    issues.push({
      severity: "error",
      code: "missing-source-text",
      message: "입력 문단이 출력 HWPX 텍스트에서 발견되지 않습니다.",
      detail: {
        assignmentId: assignment.id,
        text: coverageTextForAssignment(assignment),
        auditText: assignment.auditText
      }
    });
  }

  for (const risk of overflowRisks) {
    issues.push({
      severity: "warning",
      code: "paragraph-overflow-risk",
      message: "문단이 길어 한글 렌더링에서 겹침 또는 페이지 넘침 위험이 있습니다.",
      detail: {
        text: risk.text.slice(0, 120),
        estimatedLines: risk.estimatedLines
      }
    });
  }

  for (const overflow of pageOverflows) {
    issues.push({
      severity: "error",
      code: "page-line-overflow",
      message: "문단의 줄 배치가 실제 페이지 본문 높이를 넘어갑니다.",
      detail: {
        text: overflow.text.slice(0, 120),
        pageIndex: overflow.pageIndex,
        bottom: overflow.bottom,
        pageContentHeight: overflow.pageContentHeight
      }
    });
  }

  const summary: GeneratedOutputAuditSummary = {
    sourceBlocks: input.blocks.length,
    sourceTableGroups,
    outputParagraphs: countMatches(input.sectionXml, /<hp:p\b/g),
    outputTables,
    outputTitleTables: Math.min(input.titleTableCount, outputTables),
    outputBodyTables,
    outputPictures: countMatches(input.sectionXml, /<hp:pic\b/g),
    outputContainers: countMatches(input.sectionXml, /<hp:container\b/g),
    outputLineSegArrays: countMatches(input.sectionXml, /<hp:linesegarray\b/g),
    outputLineSegs: countMatches(input.sectionXml, /<hp:lineseg\b/g),
    redRunCount,
    nonBlackGeneratedRunCount,
    badBulletIndentCount,
    badNonBulletIndentCount,
    badBulletStyleIndentCount,
    badNonBulletAutoHeadingCount,
    missingSourceTextCount: missingAssignments.length,
    overflowRiskCount: overflowRisks.length,
    pageOverflowCount: pageOverflows.length
  };
  const score = scoreIssues(issues);

  return {
    score,
    passed: !issues.some((issue) => issue.severity === "error"),
    summary,
    issues
  };
}

function extractOutputParagraphs(sectionXml: string): OutputParagraph[] {
  return Array.from(sectionXml.matchAll(/<hp:p\b[^>]*>[\s\S]*?<\/hp:p>/g), (match) => {
    const xml = match[0];

    return {
      xml,
      text: extractParagraphText(xml),
      paraPrIDRef: readFirstStringAttribute(xml, "paraPrIDRef"),
      charPrIDs: Array.from(xml.matchAll(/<hp:run\b[^>]*\bcharPrIDRef="([^"]+)"/g), (runMatch) => runMatch[1] ?? ""),
      lineHorzPositions: Array.from(xml.matchAll(/<hp:lineseg\b[^>]*\bhorzpos="(-?\d+)"/g), (lineMatch) =>
        Number.parseInt(lineMatch[1] ?? "0", 10)
      ),
      lines: extractLines(xml),
      horzSize: readFirstNumberAttribute(xml, "horzsize"),
      textHeight: readFirstNumberAttribute(xml, "textheight")
    };
  });
}

function countBadBulletIndents(paragraphs: OutputParagraph[]): number {
  return paragraphs.filter((paragraph) =>
    isBulletText(paragraph.text) &&
    paragraph.lineHorzPositions.length > 1 &&
    paragraph.lineHorzPositions.slice(1).some((horzPos) => horzPos <= 0)
  ).length;
}

function countBadNonBulletIndents(paragraphs: OutputParagraph[], paragraphIntents: Map<string, number>): number {
  return paragraphs.filter((paragraph) => {
    if (
      paragraph.paraPrIDRef === null ||
      paragraph.text.trim().length === 0 ||
      /^\s*(?:○|[-–])\s+\S/u.test(paragraph.text)
    ) {
      return false;
    }

    return (paragraphIntents.get(paragraph.paraPrIDRef) ?? 0) < 0;
  }).length;
}

function countBadBulletStyleIndents(paragraphs: OutputParagraph[], paragraphIntents: Map<string, number>): number {
  return paragraphs.filter((paragraph) =>
    paragraph.paraPrIDRef !== null &&
    isBulletText(paragraph.text) &&
    (paragraphIntents.get(paragraph.paraPrIDRef) ?? 0) < 0
  ).length;
}

function countBadNonBulletAutoHeadings(
  paragraphs: OutputParagraph[],
  assignments: HwpxStyleAssignment[],
  paragraphHeadingTypes: Map<string, string>
): number {
  const generatedNonBulletTexts = new Set(assignments
    .filter((assignment) =>
      assignment.type === "paragraph" &&
      assignment.grammarRole !== "bullet" &&
      assignment.grammarRole !== "newsBullet" &&
      coverageTextForAssignment(assignment).trim().length > 0
    )
    .map((assignment) => normalizeText(coverageTextForAssignment(assignment))));

  return paragraphs.filter((paragraph) => {
    if (
      paragraph.paraPrIDRef === null ||
      paragraph.text.trim().length === 0 ||
      isBulletText(paragraph.text) ||
      !generatedNonBulletTexts.has(normalizeText(paragraph.text))
    ) {
      return false;
    }

    const headingType = paragraphHeadingTypes.get(paragraph.paraPrIDRef);

    return headingType !== undefined && headingType !== "NONE";
  }).length;
}

function countNonBlackGeneratedRuns(
  paragraphs: OutputParagraph[],
  assignments: HwpxStyleAssignment[],
  charColors: Map<string, string>
): number {
  const generatedBodyTexts = new Set(assignments
    .filter((assignment) =>
      assignment.type === "paragraph" &&
      assignment.grammarRole !== "title" &&
      assignment.grammarRole !== "issue" &&
      coverageTextForAssignment(assignment).trim().length > 0
    )
    .map((assignment) => normalizeText(coverageTextForAssignment(assignment))));

  return paragraphs.filter((paragraph) =>
    generatedBodyTexts.has(normalizeText(paragraph.text)) &&
    paragraph.charPrIDs.some((id) => (charColors.get(id) ?? "#000000").toUpperCase() !== "#000000")
  ).length;
}

function coverageTextForAssignment(assignment: HwpxStyleAssignment): string {
  return assignment.layoutFragment === undefined ? assignment.auditText ?? assignment.text : assignment.text;
}

function findOverflowRisks(
  paragraphs: OutputParagraph[],
  overflowLineThreshold: number
): Array<{ text: string; estimatedLines: number }> {
  return paragraphs
    .filter((paragraph) => paragraph.text.trim().length > 0)
    .map((paragraph) => ({
      text: paragraph.text,
      estimatedLines: estimateLineCount(paragraph)
    }))
    .filter((risk) => risk.estimatedLines > overflowLineThreshold);
}

function estimateLineCount(paragraph: OutputParagraph): number {
  const textHeight = paragraph.textHeight ?? 1000;
  const horzSize = paragraph.horzSize ?? 42520;
  const charsPerLine = Math.max(12, Math.floor(horzSize / Math.max(1, textHeight * 0.95)));

  return Math.max(1, Math.ceil(paragraph.text.trim().length / charsPerLine));
}

function readRedCharPrIds(headerXml: string): Set<string> {
  return new Set(Array.from(
    headerXml.matchAll(/<hh:charPr\b(?=[^>]*\bid="([^"]+)")(?=[^>]*\btextColor="#FF0000")[^>]*>/g),
    (match) => match[1] ?? ""
  ));
}

function readCharColors(headerXml: string): Map<string, string> {
  const colors = new Map<string, string>();

  for (const match of headerXml.matchAll(/<hh:charPr\b([^>]*)>/g)) {
    const attrs = match[1] ?? "";
    const id = readXmlAttribute(attrs, "id");
    const color = readXmlAttribute(attrs, "textColor");

    if (id !== null && color !== null) {
      colors.set(id, color);
    }
  }

  return colors;
}

function readParagraphIntents(headerXml: string): Map<string, number> {
  const intents = new Map<string, number>();

  for (const match of headerXml.matchAll(/<hh:paraPr\b(?=[^>]*\bid="([^"]+)")[^>]*>[\s\S]*?<\/hh:paraPr>/g)) {
    const id = match[1] ?? "";
    const paragraphXml = match[0];
    const parsed = Number.parseInt(
      paragraphXml.match(/<hc:intent\b[^>]*\bvalue="(-?\d+)"/)?.[1] ?? "",
      10
    );

    if (id.length > 0 && Number.isFinite(parsed)) {
      intents.set(id, parsed);
    }
  }

  return intents;
}

function readParagraphHeadingTypes(headerXml: string): Map<string, string> {
  const headingTypes = new Map<string, string>();

  for (const match of headerXml.matchAll(/<hh:paraPr\b(?=[^>]*\bid="([^"]+)")[^>]*>[\s\S]*?<\/hh:paraPr>/g)) {
    const id = match[1] ?? "";
    const paragraphXml = match[0];
    const headingType = paragraphXml.match(/<hh:heading\b[^>]*\btype="([^"]+)"/)?.[1];

    if (id.length > 0 && headingType !== undefined) {
      headingTypes.set(id, headingType);
    }
  }

  return headingTypes;
}

function extractTopLevelParagraphGeometry(sectionXml: string): OutputParagraphGeometry[] {
  const content = readSectionContent(sectionXml);
  const blocks = readTopLevelBlocks(content);
  const geometry: OutputParagraphGeometry[] = [];
  let pageIndex = 0;

  for (const block of blocks) {
    if (block.type !== "hp:p") {
      continue;
    }

    if (readXmlAttribute(block.attrs, "pageBreak") === "1") {
      pageIndex += 1;
    }

    const directXml = removeElements(block.xml, "hp:tbl");
    const text = extractParagraphText(directXml).trim();
    const lines = extractLines(directXml);

    if (text.length > 0 && lines.length > 0) {
      geometry.push({ text, pageIndex, lines });
    }
  }

  return geometry;
}

function findPageOverflows(
  paragraphs: OutputParagraphGeometry[],
  pageContentHeight: number
): Array<{ text: string; pageIndex: number; bottom: number; pageContentHeight: number }> {
  return paragraphs
    .map((paragraph) => ({
      text: paragraph.text,
      pageIndex: paragraph.pageIndex,
      bottom: Math.max(...paragraph.lines.map((line) => line.vertPos + line.textHeight + line.spacing), 0),
      pageContentHeight
    }))
    .filter((paragraph) => paragraph.bottom > pageContentHeight);
}

function readPageContentHeight(sectionXml: string): number {
  const pagePr = sectionXml.match(/<hp:pagePr\b([^>]*)>([\s\S]*?)<\/hp:pagePr>|<hp:pagePr\b([^>]*)\/>/);
  const pageAttrs = pagePr?.[1] ?? pagePr?.[3] ?? "";
  const marginAttrs = pagePr?.[2]?.match(/<hp:margin\b([^>]*)\/>/)?.[1] ?? "";
  const pageHeight = readNumberAttribute(pageAttrs, "height", 84186);
  const top = readNumberAttribute(marginAttrs, "top", 0);
  const bottom = readNumberAttribute(marginAttrs, "bottom", 0);

  return Math.max(1, pageHeight - top - bottom);
}

interface TopLevelBlock {
  type: "hp:p" | "hp:tbl";
  start: number;
  end: number;
  xml: string;
  attrs: string;
}

function readSectionContent(sectionXml: string): string {
  const sectionOpen = sectionXml.match(/<hs:sec\b[^>]*>/);

  if (sectionOpen?.index === undefined) {
    return sectionXml;
  }

  const start = sectionOpen.index + sectionOpen[0].length;
  const end = sectionXml.lastIndexOf("</hs:sec>");

  return end > start ? sectionXml.slice(start, end) : sectionXml.slice(start);
}

function readTopLevelBlocks(contentXml: string): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = [];
  let cursor = 0;

  while (cursor < contentXml.length) {
    const paragraphStart = contentXml.indexOf("<hp:p", cursor);
    const tableStart = contentXml.indexOf("<hp:tbl", cursor);
    const starts = [paragraphStart, tableStart].filter((value) => value >= 0);

    if (starts.length === 0) {
      break;
    }

    const start = Math.min(...starts);
    const type = start === paragraphStart ? "hp:p" : "hp:tbl";
    const opening = contentXml.slice(start, contentXml.indexOf(">", start) + 1);
    const end = findElementEnd(contentXml, start, type);

    if (end === null) {
      break;
    }

    blocks.push({
      type,
      start,
      end,
      xml: contentXml.slice(start, end),
      attrs: opening.match(/^<[^ ]+\s*([^>]*)>/)?.[1] ?? ""
    });
    cursor = end;
  }

  return blocks;
}

function removeElements(xml: string, tagName: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf(`<${tagName}`, cursor);

    if (start < 0) {
      result += xml.slice(cursor);
      break;
    }

    const end = findElementEnd(xml, start, tagName);

    if (end === null) {
      result += xml.slice(cursor);
      break;
    }

    result += xml.slice(cursor, start);
    cursor = end;
  }

  return result;
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

function extractLines(paragraphXml: string): OutputLine[] {
  return Array.from(paragraphXml.matchAll(/<hp:lineseg\b([^>]*)\/>/g), (match) => {
    const attrs = match[1] ?? "";

    return {
      vertPos: readNumberAttribute(attrs, "vertpos", 0),
      textHeight: readNumberAttribute(attrs, "textheight", 1000),
      spacing: readNumberAttribute(attrs, "spacing", 600),
      horzPos: readNumberAttribute(attrs, "horzpos", 0)
    };
  });
}

function extractParagraphText(paragraphXml: string): string {
  return Array.from(paragraphXml.matchAll(/<hp:t\b(?![^>]*\/>)[^>]*>([\s\S]*?)<\/hp:t>/g), (match) =>
    decodeXmlText(match[1] ?? "")
  ).join("");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function readFirstNumberAttribute(xml: string, name: string): number | null {
  const parsed = Number.parseInt(xml.match(new RegExp(`\\b${escapeRegExp(name)}="(-?\\d+)"`))?.[1] ?? "", 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function readNumberAttribute(xml: string, name: string, fallback: number): number {
  const parsed = Number.parseInt(readXmlAttribute(xml, name) ?? "", 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFirstStringAttribute(xml: string, name: string): string | null {
  return xml.match(new RegExp(`\\b${escapeRegExp(name)}="([^"]+)"`))?.[1] ?? null;
}

function readXmlAttribute(xml: string, name: string): string | null {
  return xml.match(new RegExp(`\\b${escapeRegExp(name)}="([^"]*)"`))?.[1] ?? null;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function scoreIssues(issues: GeneratedOutputAuditIssue[]): number {
  const deduction = issues.reduce((sum, issue) => {
    if (issue.severity === "error") {
      return sum + 25;
    }

    if (issue.severity === "warning") {
      return sum + 8;
    }

    return sum;
  }, 0);

  return Math.max(0, 100 - deduction);
}

function isBulletText(text: string): boolean {
  return /^\s*(?:○|[-–])\s+\S/u.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
