export type VisualDogfoodSeverity = "error" | "warning" | "info";

export interface VisualDogfoodIssue {
  severity: VisualDogfoodSeverity;
  code: string;
  message: string;
  paragraphIndex?: number;
  text?: string;
  detail?: Record<string, unknown>;
}

export interface VisualDogfoodParagraph {
  index: number;
  text: string;
  insideTable: boolean;
  topLevel: boolean;
  pageIndex: number;
  paraPrIDRef: string | null;
  charPrIDRef: string | null;
  fontSizePt: number | null;
  textColor: string | null;
  alignHorizontal: string | null;
  margin: VisualDogfoodParagraphMargin;
  lines: VisualDogfoodLine[];
}

export interface VisualDogfoodParagraphMargin {
  intent: number;
  left: number;
  right: number;
  prev: number;
  next: number;
}

export interface VisualDogfoodLine {
  textPos: number;
  vertPos: number;
  textHeight: number;
  spacing: number;
  horzPos: number;
  horzSize: number;
}

export interface VisualDogfoodTable {
  index: number;
  text: string;
  rowCount: number;
  colCount: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
  insideAnchor: boolean;
  pageIndex: number;
}

export interface VisualDogfoodReport {
  paragraphs: VisualDogfoodParagraph[];
  tables: VisualDogfoodTable[];
  issues: VisualDogfoodIssue[];
  summary: {
    paragraphs: number;
    nonEmptyParagraphs: number;
    tables: number;
    nonEmptyTables: number;
    nonBlackGeneratedTextCount: number;
    bulletNegativeIndentStyleCount: number;
    bulletContinuationIndentRiskCount: number;
    justifySpacingRiskCount: number;
    missingBlankAfterBulletGroupCount: number;
    verticalOverlapRiskCount: number;
    pageOverflowRiskCount: number;
    pageBottomTightRiskCount: number;
    shortWrappedTailRiskCount: number;
    tableParagraphGapRiskCount: number;
    pageCount: number;
    pageContentHeight: number;
  };
}

interface CharacterStyle {
  fontSizePt: number | null;
  textColor: string | null;
}

const emptyMargin: VisualDogfoodParagraphMargin = {
  intent: 0,
  left: 0,
  right: 0,
  prev: 0,
  next: 0
};
const pageBottomHeadroomWarningThreshold = 2000;
const minimumFinalWrappedLineChars = 9;
const minimumTableParagraphGap = 1200;

export function analyzeHwpxVisualDogfood(headerXml: string, sectionXml: string): VisualDogfoodReport {
  const characterStyles = readCharacterStyles(headerXml);
  const paragraphMargins = readParagraphMargins(headerXml);
  const paragraphAligns = readParagraphAligns(headerXml);
  const pageContentHeight = readPageContentHeight(sectionXml);
  const paragraphs = extractVisualParagraphs(sectionXml, characterStyles, paragraphMargins, paragraphAligns);
  const tables = extractVisualTables(sectionXml);
  const issues = collectIssues(paragraphs, tables, pageContentHeight);

  return {
    paragraphs,
    tables,
    issues,
    summary: {
      paragraphs: paragraphs.length,
      nonEmptyParagraphs: paragraphs.filter((paragraph) => paragraph.text.trim().length > 0).length,
      tables: tables.length,
      nonEmptyTables: tables.filter((table) => table.text.trim().length > 0).length,
      nonBlackGeneratedTextCount: issues.filter((issue) => issue.code === "non-black-generated-text").length,
      bulletNegativeIndentStyleCount: issues.filter((issue) => issue.code === "bullet-negative-indent-style").length,
      bulletContinuationIndentRiskCount: issues.filter((issue) => issue.code === "bullet-continuation-indent-risk").length,
      justifySpacingRiskCount: issues.filter((issue) => issue.code === "justify-spacing-risk").length,
      missingBlankAfterBulletGroupCount: issues.filter((issue) => issue.code === "missing-blank-after-bullet-group").length,
      verticalOverlapRiskCount: issues.filter((issue) => issue.code === "vertical-overlap-risk").length,
      pageOverflowRiskCount: issues.filter((issue) => issue.code === "page-overflow-risk").length,
      pageBottomTightRiskCount: issues.filter((issue) => issue.code === "page-bottom-tight-risk").length,
      shortWrappedTailRiskCount: issues.filter((issue) => issue.code === "short-wrapped-tail-risk").length,
      tableParagraphGapRiskCount: issues.filter((issue) => issue.code === "table-paragraph-gap-risk").length,
      pageCount: Math.max(1, ...paragraphs.map((paragraph) => paragraph.pageIndex + 1)),
      pageContentHeight
    }
  };
}

export function renderVisualDogfoodSvg(report: VisualDogfoodReport): string {
  const scale = 0.018;
  const margin = 36;
  const pageWidth = 1050;
  const tablePanelWidth = 430;
  const maxBottom = Math.max(
    8000,
    ...report.paragraphs.flatMap((paragraph) =>
      paragraph.lines.map((line) => absoluteLineTop(report, paragraph, line) + line.textHeight + line.spacing)
    )
  );
  const width = pageWidth + tablePanelWidth;
  const tablePanelMinHeight = margin * 2 + 42 + Math.min(report.tables.length, 18) * 92;
  const height = Math.ceil(Math.max(maxBottom * scale + margin * 2, tablePanelMinHeight));
  const issueParagraphs = new Set(
    report.issues
      .filter((issue) => issue.paragraphIndex !== undefined)
      .map((issue) => issue.paragraphIndex)
  );
  const labels = report.paragraphs.flatMap((paragraph) => {
    if (paragraph.insideTable || paragraph.text.trim().length === 0) {
      return "";
    }

    const lines = paragraph.lines.length > 0 ? paragraph.lines : [{
      horzPos: 0,
      horzSize: 42520,
      textHeight: 1000,
      vertPos: paragraph.index * 1800,
      spacing: 600,
      textPos: 0
    }];

    return lines.map((line, lineIndex) => {
      const nextLine = lines[lineIndex + 1];
      const textStart = Math.min(paragraph.text.length, line.textPos);
      const textEnd = nextLine === undefined
        ? paragraph.text.length
        : Math.min(paragraph.text.length, Math.max(textStart, nextLine.textPos));
      const text = paragraph.text.slice(textStart, textEnd);
      const x = margin + Math.max(0, line.horzPos) * scale;
      const y = margin + absoluteLineTop(report, paragraph, line) * scale;
      const fontSize = Math.max(8, (paragraph.fontSizePt ?? line.textHeight / 100) * 1.35);
      const fill = paragraph.textColor ?? "#000000";
      const marker = issueParagraphs.has(paragraph.index) && lineIndex === 0
        ? `<rect class="visual-dogfood-issue" x="${x - 6}" y="${y - fontSize}" width="${Math.max(280, line.horzSize * scale)}" height="${fontSize + 10}" fill="#fff2b8" stroke="#d97706" stroke-width="1"/>`
        : "";

      return `${marker}<text x="${x}" y="${y}" font-size="${fontSize}" fill="${escapeXml(fill)}">${escapeXml(text || "·")}</text>`;
    }).join("");
  }).join("");
  const tablePanel = renderTablePanel(report, pageWidth, margin, height);
  const issueList = report.issues
    .slice(0, 12)
    .map((issue, index) =>
      `<text x="36" y="${height - 18 * (12 - index)}" font-size="12" fill="${issue.severity === "error" ? "#b91c1c" : "#92400e"}">${escapeXml(`${issue.severity}: ${issue.code} ${issue.text ?? ""}`)}</text>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<rect x="18" y="18" width="${pageWidth - 36}" height="${height - 36}" fill="none" stroke="#d1d5db"/>` +
    labels +
    tablePanel +
    issueList +
    `</svg>`;
}

function renderTablePanel(
  report: VisualDogfoodReport,
  pageWidth: number,
  margin: number,
  height: number
): string {
  const panelX = pageWidth + 18;
  const panelWidth = 394;
  const cardGap = 10;
  let y = margin;
  const cards: string[] = [
    `<rect x="${panelX}" y="18" width="${panelWidth}" height="${height - 36}" fill="#f8fafc" stroke="#d1d5db"/>`,
    `<text x="${panelX + 16}" y="${y}" font-size="15" font-weight="700" fill="#111827">Table motifs (${report.summary.tables})</text>`
  ];
  y += 18;

  for (const table of report.tables) {
    const lines = splitTableText(table.text);
    const cardHeight = 48 + Math.max(1, lines.length) * 17;

    if (y + cardHeight > height - 24) {
      cards.push(`<text x="${panelX + 16}" y="${y + 20}" font-size="12" fill="#64748b">+ ${report.tables.length - table.index} more tables</text>`);
      break;
    }

    const label = `${table.index + 1}. ${table.rowCount}x${table.colCount}${table.insideAnchor ? " anchor" : " block"} p${table.pageIndex + 1}`;
    cards.push(
      `<rect x="${panelX + 12}" y="${y}" width="${panelWidth - 24}" height="${cardHeight}" rx="4" fill="#ffffff" stroke="#cbd5e1"/>`,
      `<text x="${panelX + 24}" y="${y + 18}" font-size="11" fill="#64748b">${escapeXml(label)}</text>`
    );

    lines.forEach((line, index) => {
      cards.push(`<text x="${panelX + 24}" y="${y + 38 + index * 17}" font-size="13" fill="#111827">${escapeXml(line)}</text>`);
    });

    y += cardHeight + cardGap;
  }

  return cards.join("");
}

function collectIssues(
  paragraphs: VisualDogfoodParagraph[],
  tables: VisualDogfoodTable[],
  pageContentHeight: number
): VisualDogfoodIssue[] {
  const issues: VisualDogfoodIssue[] = [];

  for (const paragraph of paragraphs) {
    const text = paragraph.text.trim();

    if (text.length === 0 || paragraph.insideTable || !paragraph.topLevel) {
      continue;
    }

    if ((paragraph.textColor ?? "#000000").toUpperCase() !== "#000000") {
      issues.push({
        severity: "error",
        code: "non-black-generated-text",
        message: "Generated body text uses a non-black character style.",
        paragraphIndex: paragraph.index,
        text,
        detail: { color: paragraph.textColor }
      });
    }

    if (isBulletText(text) && paragraph.margin.intent < 0) {
      issues.push({
        severity: "error",
        code: "bullet-negative-indent-style",
        message: "Generated bullet paragraph still uses a negative hanging-indent paragraph style.",
        paragraphIndex: paragraph.index,
        text,
        detail: { intent: paragraph.margin.intent, left: paragraph.margin.left }
      });
    }

    if (isBulletText(text) && paragraph.lines.length > 1) {
      const firstHorzPos = paragraph.lines[0]?.horzPos ?? 0;
      const badContinuation = paragraph.lines.slice(1).find((line) => line.horzPos <= firstHorzPos);

      if (badContinuation !== undefined) {
        issues.push({
          severity: "warning",
          code: "bullet-continuation-indent-risk",
          message: "A wrapped bullet continuation line starts at the bullet marker instead of the body text indent.",
          paragraphIndex: paragraph.index,
          text,
          detail: { firstHorzPos, continuationHorzPos: badContinuation.horzPos }
        });
      }
    }

    if (paragraph.alignHorizontal === "JUSTIFY" && /\S\s+\S/u.test(text)) {
      issues.push({
        severity: "warning",
        code: "justify-spacing-risk",
        message: "Generated paragraph uses JUSTIFY alignment, which can stretch spaces between Korean word groups in Hancom.",
        paragraphIndex: paragraph.index,
        text,
        detail: { alignHorizontal: paragraph.alignHorizontal }
      });
    }

    if (paragraph.lines.length > 1) {
      const lastLine = paragraph.lines.at(-1);
      const lastTextPos = lastLine?.textPos ?? text.length;
      const tailLength = Math.max(0, text.length - lastTextPos);

      if (tailLength > 0 && tailLength < minimumFinalWrappedLineChars) {
        issues.push({
          severity: "warning",
          code: "short-wrapped-tail-risk",
          message: "A wrapped generated paragraph ends with a very short final line, which often looks like an accidental line break in Hancom.",
          paragraphIndex: paragraph.index,
          text,
          detail: { tailLength, minimumFinalWrappedLineChars }
        });
      }
    }
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];

    if (paragraph.insideTable || !paragraph.topLevel || !isBulletText(paragraph.text.trim())) {
      continue;
    }

    const nextMeaningfulIndex = findNextMeaningfulParagraphIndex(paragraphs, index);
    const nextMeaningful = nextMeaningfulIndex === undefined ? undefined : paragraphs[nextMeaningfulIndex];
    const hasBlankBeforeNext = nextMeaningfulIndex !== undefined &&
      paragraphs.slice(index + 1, nextMeaningfulIndex).some((item) =>
        item.topLevel && !item.insideTable && item.text.trim().length === 0
      );

    if (
      nextMeaningful !== undefined &&
      !isBulletText(nextMeaningful.text.trim()) &&
      !hasBlankBeforeNext
    ) {
      issues.push({
        severity: "warning",
        code: "missing-blank-after-bullet-group",
        message: "A bullet group is followed by a non-bullet paragraph without a real blank paragraph.",
        paragraphIndex: paragraph.index,
        text: paragraph.text.trim()
      });
    }
  }

  const nonEmptyOutsideTable = paragraphs.filter((paragraph) =>
    !paragraph.insideTable && paragraph.topLevel && paragraph.text.trim().length > 0 && paragraph.lines.length > 0
  );

  for (let index = 1; index < nonEmptyOutsideTable.length; index += 1) {
    const previous = nonEmptyOutsideTable[index - 1];
    const current = nonEmptyOutsideTable[index];

    if (previous.pageIndex !== current.pageIndex) {
      continue;
    }

    const previousBottom = paragraphBottom(previous);
    const currentTop = current.lines[0]?.vertPos ?? previousBottom;

    if (currentTop - previousBottom < 0) {
      issues.push({
        severity: "warning",
        code: "vertical-overlap-risk",
        message: "A paragraph starts before the previous paragraph line box ends.",
        paragraphIndex: current.index,
        text: current.text.trim(),
        detail: { previousText: previous.text.trim(), gap: currentTop - previousBottom }
      });
    }
  }

  for (const paragraph of nonEmptyOutsideTable) {
    const bottom = paragraphBottom(paragraph);

    if (bottom > pageContentHeight) {
      issues.push({
        severity: "warning",
        code: "page-overflow-risk",
        message: "A paragraph line box exceeds the page content height.",
        paragraphIndex: paragraph.index,
        text: paragraph.text.trim(),
        detail: { bottom, pageContentHeight, pageIndex: paragraph.pageIndex }
      });
    }
  }

  for (const table of tables.filter((item) => item.text.trim().length > 0)) {
    if (table.bottom > pageContentHeight) {
      issues.push({
        severity: "warning",
        code: "page-overflow-risk",
        message: "A table box exceeds the page content height.",
        text: table.text.trim(),
        detail: {
          bottom: table.bottom,
          pageContentHeight,
          pageIndex: table.pageIndex,
          tableIndex: table.index
        }
      });
    }
  }

  for (const [pageIndex, pageBottom] of readPageBottoms(nonEmptyOutsideTable, tables)) {
    const headroom = pageContentHeight - pageBottom;

    if (headroom >= 0 && headroom < pageBottomHeadroomWarningThreshold) {
      issues.push({
        severity: "warning",
        code: "page-bottom-tight-risk",
        message: "A page has very little bottom headroom, so Hancom font/table reflow may push content to an extra page.",
        detail: { pageIndex, pageBottom, pageContentHeight, headroom }
      });
    }
  }

  for (const table of tables.filter((item) => item.text.trim().length > 0)) {
    const nextParagraph = findNextTopLevelParagraphAfterTable(table, paragraphs);

    if (nextParagraph === undefined) {
      continue;
    }

    const nextTop = nextParagraph.lines[0]?.vertPos ?? table.bottom;
    const gap = nextTop - table.bottom;

    if (gap >= 0 && gap < minimumTableParagraphGap) {
      issues.push({
        severity: "warning",
        code: "table-paragraph-gap-risk",
        message: "A table is too close to the following paragraph, so Hancom reflow may make the page look crowded or overlapping.",
        paragraphIndex: nextParagraph.index,
        text: nextParagraph.text.trim(),
        detail: { tableIndex: table.index, gap, minimumTableParagraphGap, pageIndex: table.pageIndex }
      });
    }
  }

  return issues;
}

function readPageBottoms(
  paragraphs: VisualDogfoodParagraph[],
  tables: VisualDogfoodTable[]
): Map<number, number> {
  const pageBottoms = new Map<number, number>();

  for (const paragraph of paragraphs) {
    pageBottoms.set(
      paragraph.pageIndex,
      Math.max(pageBottoms.get(paragraph.pageIndex) ?? 0, paragraphBottom(paragraph))
    );
  }

  for (const table of tables) {
    pageBottoms.set(
      table.pageIndex,
      Math.max(pageBottoms.get(table.pageIndex) ?? 0, table.bottom)
    );
  }

  return pageBottoms;
}

function findNextTopLevelParagraphAfterTable(
  table: VisualDogfoodTable,
  paragraphs: VisualDogfoodParagraph[]
): VisualDogfoodParagraph | undefined {
  return paragraphs
    .filter((paragraph) =>
      paragraph.topLevel &&
      !paragraph.insideTable &&
      paragraph.pageIndex === table.pageIndex &&
      paragraph.text.trim().length > 0 &&
      paragraph.lines.length > 0 &&
      (paragraph.lines[0]?.vertPos ?? 0) >= table.bottom
    )
    .sort((left, right) => (left.lines[0]?.vertPos ?? 0) - (right.lines[0]?.vertPos ?? 0))[0];
}

function findNextMeaningfulParagraphIndex(
  paragraphs: VisualDogfoodParagraph[],
  index: number
): number | undefined {
  for (let current = index + 1; current < paragraphs.length; current += 1) {
    const paragraph = paragraphs[current];

    if (
      paragraph !== undefined &&
      paragraph.topLevel &&
      !paragraph.insideTable &&
      paragraph.text.trim().length !== 0
    ) {
      return current;
    }
  }

  return undefined;
}

function paragraphBottom(paragraph: VisualDogfoodParagraph): number {
  return Math.max(
    ...paragraph.lines.map((line) => line.vertPos + line.textHeight + line.spacing),
    0
  );
}

function absoluteLineTop(
  report: VisualDogfoodReport,
  paragraph: VisualDogfoodParagraph,
  line: VisualDogfoodLine
): number {
  return paragraph.pageIndex * report.summary.pageContentHeight + line.vertPos;
}

function extractVisualParagraphs(
  sectionXml: string,
  characterStyles: Map<string, CharacterStyle>,
  paragraphMargins: Map<string, VisualDogfoodParagraphMargin>,
  paragraphAligns: Map<string, string | null>
): VisualDogfoodParagraph[] {
  const contentXml = readSectionContent(sectionXml);
  const blocks = readTopLevelBlocks(contentXml);
  const paragraphs: VisualDogfoodParagraph[] = [];
  let pageIndex = 0;

  for (const block of blocks) {
    if (block.type === "hp:p" && readXmlAttribute(block.attrs, "pageBreak") === "1") {
      pageIndex += 1;
    }

    if (block.type === "hp:tbl") {
      for (const nested of extractParagraphElements(block.xml)) {
        paragraphs.push(createVisualParagraph(
          nested.xml,
          nested.attrs,
          paragraphs.length,
          true,
          false,
          pageIndex,
          characterStyles,
          paragraphMargins,
          paragraphAligns
        ));
      }
      continue;
    }

    for (const tableXml of extractElementXmls(block.xml, "hp:tbl")) {
      for (const nested of extractParagraphElements(tableXml)) {
        paragraphs.push(createVisualParagraph(
          nested.xml,
          nested.attrs,
          paragraphs.length,
          true,
          false,
          pageIndex,
          characterStyles,
          paragraphMargins,
          paragraphAligns
        ));
      }
    }

    const directXml = removeElements(block.xml, "hp:tbl");
    const directLines = extractLines(directXml);
    const directText = extractParagraphText(directXml);

    if (directText.trim().length > 0 || directLines.length > 0) {
      paragraphs.push(createVisualParagraph(
        directXml,
        block.attrs,
        paragraphs.length,
        false,
        true,
        pageIndex,
        characterStyles,
        paragraphMargins,
        paragraphAligns
      ));
    }
  }

  return paragraphs;
}

function extractVisualTables(sectionXml: string): VisualDogfoodTable[] {
  const contentXml = readSectionContent(sectionXml);
  const blocks = readTopLevelBlocks(contentXml);
  const tables: VisualDogfoodTable[] = [];
  let pageIndex = 0;
  const flowBottomByPage = new Map<number, number>();

  for (const block of blocks) {
    if (block.type === "hp:p" && readXmlAttribute(block.attrs, "pageBreak") === "1") {
      pageIndex += 1;
    }

    if (block.type === "hp:tbl") {
      const top = Math.max(readPageFlowBottom(flowBottomByPage, pageIndex), readTableVertOffset(block.xml));
      const table = createVisualTable(block.xml, tables.length, false, pageIndex, top);
      tables.push(table);
      updatePageFlowBottom(flowBottomByPage, pageIndex, table.bottom);
      continue;
    }

    const directXml = removeElements(block.xml, "hp:tbl");
    const directBounds = readLineBounds(extractLines(directXml));
    const anchorTop = directBounds?.top ?? readPageFlowBottom(flowBottomByPage, pageIndex);

    for (const tableXml of extractElementXmls(block.xml, "hp:tbl")) {
      const table = createVisualTable(
        tableXml,
        tables.length,
        true,
        pageIndex,
        anchorTop + readTableVertOffset(tableXml)
      );
      tables.push(table);
      updatePageFlowBottom(flowBottomByPage, pageIndex, table.bottom);
    }

    if (directBounds !== null) {
      updatePageFlowBottom(flowBottomByPage, pageIndex, directBounds.bottom);
    }
  }

  return tables;
}

function createVisualTable(
  xml: string,
  index: number,
  insideAnchor: boolean,
  pageIndex: number,
  top: number
): VisualDogfoodTable {
  const attrs = xml.match(/^<hp:tbl\b([^>]*)>/)?.[1] ?? "";
  const sizeAttrs = xml.match(/<hp:sz\b([^>]*)\/>/)?.[1] ?? "";
  const height = readNumberAttribute(sizeAttrs, "height", 0);
  const outMargin = readTableOutMargin(xml);
  const bottom = top + height + outMargin.top + outMargin.bottom;

  return {
    index,
    text: extractTableText(xml),
    rowCount: readNumberAttribute(attrs, "rowCnt", countTableRows(xml)),
    colCount: readNumberAttribute(attrs, "colCnt", countTableColumns(xml)),
    width: readNumberAttribute(sizeAttrs, "width", 0),
    height,
    top,
    bottom,
    insideAnchor,
    pageIndex
  };
}

function readPageFlowBottom(flowBottomByPage: Map<number, number>, pageIndex: number): number {
  return flowBottomByPage.get(pageIndex) ?? 0;
}

function updatePageFlowBottom(
  flowBottomByPage: Map<number, number>,
  pageIndex: number,
  bottom: number
): void {
  flowBottomByPage.set(pageIndex, Math.max(readPageFlowBottom(flowBottomByPage, pageIndex), bottom));
}

function readLineBounds(lines: VisualDogfoodLine[]): { top: number; bottom: number } | null {
  if (lines.length === 0) {
    return null;
  }

  return {
    top: Math.min(...lines.map((line) => line.vertPos)),
    bottom: Math.max(...lines.map((line) => line.vertPos + line.textHeight + line.spacing))
  };
}

function readTableVertOffset(tableXml: string): number {
  const posAttrs = tableXml.match(/<hp:pos\b([^>]*)\/>/)?.[1] ?? "";

  return readNumberAttribute(posAttrs, "vertOffset", 0);
}

function readTableOutMargin(tableXml: string): { top: number; bottom: number } {
  const marginAttrs = tableXml.match(/<hp:outMargin\b([^>]*)\/>/)?.[1] ?? "";

  return {
    top: readNumberAttribute(marginAttrs, "top", 0),
    bottom: readNumberAttribute(marginAttrs, "bottom", 0)
  };
}

function createVisualParagraph(
  xml: string,
  attrs: string,
  index: number,
  insideTable: boolean,
  topLevel: boolean,
  pageIndex: number,
  characterStyles: Map<string, CharacterStyle>,
  paragraphMargins: Map<string, VisualDogfoodParagraphMargin>,
  paragraphAligns: Map<string, string | null>
): VisualDogfoodParagraph {
  const paraPrIDRef = readXmlAttribute(attrs, "paraPrIDRef");
  const charPrIDRef = xml.match(/<hp:run\b[^>]*\bcharPrIDRef="([^"]+)"/)?.[1] ?? null;
  const charStyle = charPrIDRef === null ? undefined : characterStyles.get(charPrIDRef);

  return {
    index,
    text: extractParagraphText(xml),
    insideTable,
    topLevel,
    pageIndex,
    paraPrIDRef,
    charPrIDRef,
    fontSizePt: charStyle?.fontSizePt ?? null,
    textColor: charStyle?.textColor ?? null,
    alignHorizontal: paraPrIDRef === null ? null : paragraphAligns.get(paraPrIDRef) ?? null,
    margin: paraPrIDRef === null ? emptyMargin : paragraphMargins.get(paraPrIDRef) ?? emptyMargin,
    lines: extractLines(xml)
  };
}

interface TopLevelBlock {
  type: "hp:p" | "hp:tbl";
  start: number;
  end: number;
  xml: string;
  attrs: string;
}

interface ParagraphElement {
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

function extractParagraphElements(xml: string): ParagraphElement[] {
  return extractElementXmls(xml, "hp:p").map((paragraphXml) => ({
    xml: paragraphXml,
    attrs: paragraphXml.match(/^<hp:p\b([^>]*)>/)?.[1] ?? ""
  }));
}

function extractElementXmls(xml: string, tagName: string): string[] {
  const elements: string[] = [];
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf(`<${tagName}`, cursor);

    if (start < 0) {
      break;
    }

    const end = findElementEnd(xml, start, tagName);

    if (end === null) {
      break;
    }

    elements.push(xml.slice(start, end));
    cursor = end;
  }

  return elements;
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

function readPageContentHeight(sectionXml: string): number {
  const pagePr = sectionXml.match(/<hp:pagePr\b([^>]*)>([\s\S]*?)<\/hp:pagePr>|<hp:pagePr\b([^>]*)\/>/);
  const pageAttrs = pagePr?.[1] ?? pagePr?.[3] ?? "";
  const marginAttrs = pagePr?.[2]?.match(/<hp:margin\b([^>]*)\/>/)?.[1] ?? "";
  const pageHeight = readNumberAttribute(pageAttrs, "height", 84186);
  const top = readNumberAttribute(marginAttrs, "top", 0);
  const bottom = readNumberAttribute(marginAttrs, "bottom", 0);

  return Math.max(1, pageHeight - top - bottom);
}

function extractLines(paragraphXml: string): VisualDogfoodLine[] {
  return Array.from(paragraphXml.matchAll(/<hp:lineseg\b([^>]*)\/>/g), (match) => {
    const attrs = match[1] ?? "";

    return {
      textPos: readNumberAttribute(attrs, "textpos", 0),
      vertPos: readNumberAttribute(attrs, "vertpos", 0),
      textHeight: readNumberAttribute(attrs, "textheight", 1000),
      spacing: readNumberAttribute(attrs, "spacing", 600),
      horzPos: readNumberAttribute(attrs, "horzpos", 0),
      horzSize: readNumberAttribute(attrs, "horzsize", 42520)
    };
  });
}

function readCharacterStyles(headerXml: string): Map<string, CharacterStyle> {
  const styles = new Map<string, CharacterStyle>();

  for (const match of headerXml.matchAll(/<hh:charPr\b([^>]*)>/g)) {
    const attrs = match[1] ?? "";
    const id = readXmlAttribute(attrs, "id");
    const height = readOptionalNumberAttribute(attrs, "height");

    if (id !== null) {
      styles.set(id, {
        fontSizePt: height === undefined ? null : height / 100,
        textColor: readXmlAttribute(attrs, "textColor")
      });
    }
  }

  return styles;
}

function readParagraphMargins(headerXml: string): Map<string, VisualDogfoodParagraphMargin> {
  const styles = new Map<string, VisualDogfoodParagraphMargin>();

  for (const match of headerXml.matchAll(/<hh:paraPr\b([^>]*)>[\s\S]*?<\/hh:paraPr>/g)) {
    const id = readXmlAttribute(match[1] ?? "", "id");
    const xml = match[0];

    if (id !== null) {
      styles.set(id, {
        intent: readMarginValue(xml, "intent"),
        left: readMarginValue(xml, "left"),
        right: readMarginValue(xml, "right"),
        prev: readMarginValue(xml, "prev"),
        next: readMarginValue(xml, "next")
      });
    }
  }

  return styles;
}

function readParagraphAligns(headerXml: string): Map<string, string | null> {
  const aligns = new Map<string, string | null>();

  for (const match of headerXml.matchAll(/<hh:paraPr\b([^>]*)>[\s\S]*?<\/hh:paraPr>/g)) {
    const id = readXmlAttribute(match[1] ?? "", "id");
    const alignAttrs = match[0].match(/<hh:align\b([^>]*)\/?>/)?.[1] ?? "";

    if (id !== null) {
      aligns.set(id, readXmlAttribute(alignAttrs, "horizontal"));
    }
  }

  return aligns;
}

function readMarginValue(xml: string, name: string): number {
  const parsed = Number.parseInt(
    xml.match(new RegExp(`<hc:${escapeRegExp(name)}\\b[^>]*\\bvalue="(-?\\d+)"`))?.[1] ?? "",
    10
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function findElementRanges(xml: string, tagName: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>|</${escapeRegExp(tagName)}>`, "g");
  let depth = 0;
  let start: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const token = match[0];

    if (token.startsWith("</")) {
      depth -= 1;

      if (depth === 0 && start !== null) {
        ranges.push({ start, end: pattern.lastIndex });
        start = null;
      }
      continue;
    }

    if (depth === 0) {
      start = match.index;
    }

    if (!/\/\s*>$/u.test(token)) {
      depth += 1;
    } else if (depth === 0 && start !== null) {
      ranges.push({ start, end: pattern.lastIndex });
      start = null;
    }
  }

  return ranges;
}

function extractParagraphText(paragraphXml: string): string {
  return Array.from(
    paragraphXml.matchAll(/<hp:t\b(?![^>]*\/>)[^>]*>([\s\S]*?)<\/hp:t>/g),
    (match) => decodeXmlText(match[1] ?? "")
  ).join("");
}

function extractTableText(tableXml: string): string {
  return extractParagraphElements(tableXml)
    .map((paragraph) => extractParagraphText(paragraph.xml).trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

function countTableRows(tableXml: string): number {
  return extractElementXmls(tableXml, "hp:tr").length;
}

function countTableColumns(tableXml: string): number {
  const counts = extractElementXmls(tableXml, "hp:tr").map((rowXml) =>
    extractElementXmls(rowXml, "hp:tc").length
  );

  return Math.max(0, ...counts);
}

function splitTableText(text: string): string[] {
  const normalized = text.replace(/\s+/gu, " ").trim();

  if (normalized.length === 0) {
    return ["(empty table text)"];
  }

  const lines: string[] = [];
  let remaining = normalized;

  while (remaining.length > 0 && lines.length < 3) {
    if (remaining.length <= 26) {
      lines.push(remaining);
      remaining = "";
      break;
    }

    const slice = remaining.slice(0, 26);
    const splitAt = Math.max(slice.lastIndexOf(" "), 14);
    lines.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    const last = lines.at(-1) ?? "";
    lines[lines.length - 1] = `${last.replace(/\s*…?$/u, "")}…`;
  }

  return lines;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function isBulletText(text: string): boolean {
  return /^\s*(?:○|[-–])\s+\S/u.test(text);
}

function readNumberAttribute(attrs: string, name: string, fallback: number): number {
  return readOptionalNumberAttribute(attrs, name) ?? fallback;
}

function readOptionalNumberAttribute(attrs: string, name: string): number | undefined {
  const parsed = Number.parseInt(readXmlAttribute(attrs, name) ?? "", 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function readXmlAttribute(attrs: string, name: string): string | null {
  return attrs.match(new RegExp(`\\b${escapeRegExp(name)}="([^"]*)"`))?.[1] ?? null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
