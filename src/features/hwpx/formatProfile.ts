export interface HwpxFormatProfile {
  page: HwpxPageProfile | null;
  counts: HwpxFormatCounts;
  paragraphStyles: HwpxParagraphProfile[];
  characterStyles: HwpxCharacterProfile[];
  tables: HwpxTableProfile[];
  textSlots: HwpxTextSlotProfile[];
  paragraphSamples: HwpxParagraphSample[];
}

export interface HwpxFormatCounts {
  paragraphStyles: number;
  characterStyles: number;
  borderFills: number;
  tables: number;
  cells: number;
  textSlots: number;
  images: number;
}

export interface HwpxBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface HwpxPageMargins extends HwpxBox {
  header: number;
  footer: number;
  gutter: number;
}

export interface HwpxPageProfile {
  landscape: string | null;
  width: number;
  height: number;
  margins: HwpxPageMargins;
  contentWidth: number;
  contentHeight: number;
}

export interface HwpxCharacterProfile {
  id: string;
  fontFace: string | null;
  fontSizePt: number | null;
  charSpacing: number | null;
  widthRatio: number | null;
  bold: boolean;
  textColor: string | null;
}

export interface HwpxParagraphProfile {
  id: string;
  tabPrIDRef: string | null;
  borderFillIDRef: string | null;
  align: {
    horizontal: string | null;
    vertical: string | null;
  };
  margins: HwpxParagraphMargins;
  lineSpacing: {
    type: string | null;
    value: number | null;
  };
}

export interface HwpxParagraphMargins {
  intent: number;
  left: number;
  right: number;
  prev: number;
  next: number;
}

export interface HwpxTableProfile {
  order: number;
  rowCount: number;
  colCount: number;
  text: string;
  paragraphCount: number;
  width: number | null;
  height: number | null;
  cellCount: number;
  borderFillIDRef: string | null;
  inMargin: HwpxBox | null;
  outMargin: HwpxBox | null;
  firstCell: HwpxCellProfile | null;
}

export interface HwpxCellProfile {
  width: number | null;
  height: number | null;
  margin: HwpxBox | null;
  borderFillIDRef: string | null;
}

export interface HwpxTextSlotProfile {
  ordinal: number;
  text: string;
  paraPrIDRef: string | null;
  styleIDRef: string | null;
  charPrIDRef: string | null;
  insideTable: boolean;
  line: HwpxLineProfile | null;
}

export interface HwpxParagraphSample {
  ordinal: number;
  id: string | null;
  text: string;
  paraPrIDRef: string | null;
  styleIDRef: string | null;
  charPrIDRef: string | null;
  insideTable: boolean;
  tableOrdinal: number | null;
  line: HwpxLineProfile | null;
}

export interface HwpxLineProfile {
  textHeight: number | null;
  baseline: number | null;
  spacing: number | null;
  horzPos: number | null;
  horzSize: number | null;
}

interface XmlElementRange {
  start: number;
  end: number;
  xml: string;
  attrs: string;
}

export function analyzeHwpxFormatProfile(headerXml: string, sectionXml: string): HwpxFormatProfile {
  const paragraphStyles = extractParagraphProfiles(headerXml);
  const characterStyles = extractCharacterProfiles(headerXml);
  const tables = extractTableProfiles(sectionXml);
  const textSlots = extractTextSlots(sectionXml);
  const paragraphSamples = extractParagraphSamples(sectionXml);

  return {
    page: extractPageProfile(sectionXml),
    counts: {
      paragraphStyles: paragraphStyles.length,
      characterStyles: characterStyles.length,
      borderFills: countMatches(headerXml, /<hh:borderFill\b/g),
      tables: tables.length,
      cells: tables.reduce((sum, table) => sum + table.cellCount, 0),
      textSlots: textSlots.length,
      images: countMatches(sectionXml, /<hp:(?:pic|container)\b/g)
    },
    paragraphStyles,
    characterStyles,
    tables,
    textSlots,
    paragraphSamples
  };
}

function extractPageProfile(sectionXml: string): HwpxPageProfile | null {
  const page = readElements(sectionXml, "hp:pagePr")[0];

  if (page === undefined) {
    return null;
  }

  const marginAttrs = page.xml.match(/<hp:margin\b([^>]*)\/>/)?.[1] ?? "";
  const width = readNumberAttribute(page.attrs, "width", 0);
  const height = readNumberAttribute(page.attrs, "height", 0);
  const margins = {
    header: readNumberAttribute(marginAttrs, "header", 0),
    footer: readNumberAttribute(marginAttrs, "footer", 0),
    gutter: readNumberAttribute(marginAttrs, "gutter", 0),
    left: readNumberAttribute(marginAttrs, "left", 0),
    right: readNumberAttribute(marginAttrs, "right", 0),
    top: readNumberAttribute(marginAttrs, "top", 0),
    bottom: readNumberAttribute(marginAttrs, "bottom", 0)
  };

  return {
    landscape: readXmlAttribute(page.attrs, "landscape"),
    width,
    height,
    margins,
    contentWidth: Math.max(0, width - margins.left - margins.right - margins.gutter),
    contentHeight: Math.max(0, height - margins.top - margins.bottom)
  };
}

function extractCharacterProfiles(headerXml: string): HwpxCharacterProfile[] {
  const fontFaces = extractHangulFontFaces(headerXml);

  return readElements(headerXml, "hh:charPr")
    .map((charPr) => {
      const fontRefAttrs = charPr.xml.match(/<hh:fontRef\b([^>]*)\/>/)?.[1] ?? "";
      const fontId = readXmlAttribute(fontRefAttrs, "hangul");
      const spacingAttrs = charPr.xml.match(/<hh:spacing\b([^>]*)\/>/)?.[1] ?? "";
      const ratioAttrs = charPr.xml.match(/<hh:ratio\b([^>]*)\/>/)?.[1] ?? "";
      const height = readOptionalNumberAttribute(charPr.attrs, "height");

      return {
        id: readXmlAttribute(charPr.attrs, "id") ?? "",
        fontFace: fontId === null ? null : fontFaces.get(fontId) ?? null,
        fontSizePt: height === undefined ? null : height / 100,
        charSpacing: readNullableNumberAttribute(spacingAttrs, "hangul"),
        widthRatio: readNullableNumberAttribute(ratioAttrs, "hangul"),
        bold: charPr.xml.includes("<hh:bold"),
        textColor: readXmlAttribute(charPr.attrs, "textColor")
      };
    })
    .filter((style) => style.id.length > 0);
}

function extractParagraphProfiles(headerXml: string): HwpxParagraphProfile[] {
  return readElements(headerXml, "hh:paraPr")
    .map((paraPr) => {
      const alignAttrs = paraPr.xml.match(/<hh:align\b([^>]*)\/>/)?.[1] ?? "";
      const lineSpacingAttrs = paraPr.xml.match(/<hh:lineSpacing\b([^>]*)\/>/)?.[1] ?? "";
      const borderAttrs = paraPr.xml.match(/<hh:border\b([^>]*)\/>/)?.[1] ?? "";

      return {
        id: readXmlAttribute(paraPr.attrs, "id") ?? "",
        tabPrIDRef: readXmlAttribute(paraPr.attrs, "tabPrIDRef"),
        borderFillIDRef: readXmlAttribute(borderAttrs, "borderFillIDRef"),
        align: {
          horizontal: readXmlAttribute(alignAttrs, "horizontal"),
          vertical: readXmlAttribute(alignAttrs, "vertical")
        },
        margins: readParagraphMargins(paraPr.xml),
        lineSpacing: {
          type: readXmlAttribute(lineSpacingAttrs, "type"),
          value: readNullableNumberAttribute(lineSpacingAttrs, "value")
        }
      };
    })
    .filter((style) => style.id.length > 0);
}

function readParagraphMargins(paraPrXml: string): HwpxParagraphMargins {
  const marginXml = paraPrXml.match(/<hh:margin\b[\s\S]*?<\/hh:margin>/)?.[0] ?? "";

  return {
    intent: readMarginValue(marginXml, "intent"),
    left: readMarginValue(marginXml, "left"),
    right: readMarginValue(marginXml, "right"),
    prev: readMarginValue(marginXml, "prev"),
    next: readMarginValue(marginXml, "next")
  };
}

function readMarginValue(marginXml: string, name: string): number {
  const match = marginXml.match(new RegExp(`<hc:${escapeRegExp(name)}\\b[^>]*\\bvalue="(-?\\d+)"`));
  const parsed = Number.parseInt(match?.[1] ?? "", 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function extractTableProfiles(sectionXml: string): HwpxTableProfile[] {
  return readElements(sectionXml, "hp:tbl").map((table, order) => {
    const sizeAttrs = table.xml.match(/<hp:sz\b([^>]*)\/>/)?.[1] ?? "";
    const cells = readElements(table.xml, "hp:tc");
    const paragraphs = readAllElements(table.xml, "hp:p").filter((paragraph) => !paragraph.xml.includes("<hp:tbl"));
    const tableText = paragraphs
      .map((paragraph) => extractParagraphText(paragraph.xml).trim())
      .filter((text) => text.length > 0)
      .join("\n");

    return {
      order,
      rowCount: readNumberAttribute(table.attrs, "rowCnt", readElements(table.xml, "hp:tr").length),
      colCount: readNumberAttribute(table.attrs, "colCnt", Math.max(0, ...readElements(table.xml, "hp:tr").map((row) => readElements(row.xml, "hp:tc").length))),
      text: tableText,
      paragraphCount: paragraphs.filter((paragraph) => extractParagraphText(paragraph.xml).trim().length > 0).length,
      width: readNullableNumberAttribute(sizeAttrs, "width"),
      height: readNullableNumberAttribute(sizeAttrs, "height"),
      cellCount: cells.length,
      borderFillIDRef: readXmlAttribute(table.attrs, "borderFillIDRef"),
      inMargin: readBoxFromSelfClosingTag(table.xml, "hp:inMargin"),
      outMargin: readBoxFromSelfClosingTag(table.xml, "hp:outMargin"),
      firstCell: cells[0] === undefined ? null : extractCellProfile(cells[0])
    };
  });
}

function extractCellProfile(cell: XmlElementRange): HwpxCellProfile {
  const sizeAttrs = cell.xml.match(/<hp:cellSz\b([^>]*)\/>/)?.[1] ?? "";

  return {
    width: readNullableNumberAttribute(sizeAttrs, "width"),
    height: readNullableNumberAttribute(sizeAttrs, "height"),
    margin: readBoxFromSelfClosingTag(cell.xml, "hp:cellMargin"),
    borderFillIDRef: readXmlAttribute(cell.attrs, "borderFillIDRef")
  };
}

function extractTextSlots(sectionXml: string): HwpxTextSlotProfile[] {
  const tableRanges = readElements(sectionXml, "hp:tbl").map((table) => ({ start: table.start, end: table.end }));
  const paragraphs = readAllElements(sectionXml, "hp:p");
  const slots: HwpxTextSlotProfile[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.xml.includes("<hp:tbl")) {
      continue;
    }

    const text = extractParagraphText(paragraph.xml).trim();

    if (text.length === 0) {
      continue;
    }

    slots.push({
      ordinal: slots.length,
      text,
      paraPrIDRef: readXmlAttribute(paragraph.attrs, "paraPrIDRef"),
      styleIDRef: readXmlAttribute(paragraph.attrs, "styleIDRef"),
      charPrIDRef: readFirstRunCharPr(paragraph.xml),
      insideTable: tableRanges.some((range) => paragraph.start > range.start && paragraph.end < range.end),
      line: readLineProfile(paragraph.xml)
    });
  }

  return slots;
}

function extractParagraphSamples(sectionXml: string): HwpxParagraphSample[] {
  const tableRanges = readElements(sectionXml, "hp:tbl").map((table, tableOrdinal) => ({
    start: table.start,
    end: table.end,
    tableOrdinal
  }));
  const samples: HwpxParagraphSample[] = [];

  for (const paragraph of readAllElements(sectionXml, "hp:p")) {
    if (paragraph.xml.includes("<hp:tbl")) {
      continue;
    }

    const text = extractParagraphText(paragraph.xml).trim();

    if (text.length === 0) {
      continue;
    }

    const containingTable = tableRanges.find((range) => paragraph.start > range.start && paragraph.end < range.end);

    samples.push({
      ordinal: samples.length,
      id: readXmlAttribute(paragraph.attrs, "id"),
      text,
      paraPrIDRef: readXmlAttribute(paragraph.attrs, "paraPrIDRef"),
      styleIDRef: readXmlAttribute(paragraph.attrs, "styleIDRef"),
      charPrIDRef: readFirstRunCharPr(paragraph.xml),
      insideTable: containingTable !== undefined,
      tableOrdinal: containingTable?.tableOrdinal ?? null,
      line: readLineProfile(paragraph.xml)
    });
  }

  return samples;
}

function readLineProfile(paragraphXml: string): HwpxLineProfile | null {
  const attrs = paragraphXml.match(/<hp:lineseg\b([^>]*)\/>/)?.[1];

  if (attrs === undefined) {
    return null;
  }

  return {
    textHeight: readNullableNumberAttribute(attrs, "textheight"),
    baseline: readNullableNumberAttribute(attrs, "baseline"),
    spacing: readNullableNumberAttribute(attrs, "spacing"),
    horzPos: readNullableNumberAttribute(attrs, "horzpos"),
    horzSize: readNullableNumberAttribute(attrs, "horzsize")
  };
}

function readBoxFromSelfClosingTag(xml: string, tagName: string): HwpxBox | null {
  const attrs = xml.match(new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)/>`))?.[1];

  if (attrs === undefined) {
    return null;
  }

  return {
    left: readNumberAttribute(attrs, "left", 0),
    right: readNumberAttribute(attrs, "right", 0),
    top: readNumberAttribute(attrs, "top", 0),
    bottom: readNumberAttribute(attrs, "bottom", 0)
  };
}

function extractHangulFontFaces(headerXml: string): Map<string, string> {
  const faces = new Map<string, string>();
  const hangulFace = headerXml.match(/<hh:fontface\b(?=[^>]*\blang="HANGUL")[^>]*>[\s\S]*?<\/hh:fontface>/)?.[0] ?? "";

  for (const match of hangulFace.matchAll(/<hh:font\b([^>]*)\/>/g)) {
    const attrs = match[1] ?? "";
    const id = readXmlAttribute(attrs, "id");
    const face = readXmlAttribute(attrs, "face");

    if (id !== null && face !== null) {
      faces.set(id, face);
    }
  }

  return faces;
}

function readElements(xml: string, tagName: string): XmlElementRange[] {
  const elements: XmlElementRange[] = [];
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)>|</${escapeRegExp(tagName)}>`, "g");
  let depth = 0;
  let start = -1;
  let attrs = "";
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    if (match[0].startsWith("</")) {
      if (depth === 0) {
        continue;
      }

      depth -= 1;

      if (depth === 0 && start >= 0) {
        elements.push({ start, end: pattern.lastIndex, xml: xml.slice(start, pattern.lastIndex), attrs });
        start = -1;
        attrs = "";
      }

      continue;
    }

    if (depth === 0) {
      start = match.index;
      attrs = match[1] ?? "";
    }

    if (/\/\s*>$/.test(match[0])) {
      if (depth === 0 && start >= 0) {
        elements.push({ start, end: pattern.lastIndex, xml: xml.slice(start, pattern.lastIndex), attrs });
        start = -1;
        attrs = "";
      }

      continue;
    }

    depth += 1;
  }

  return elements;
}

function readAllElements(xml: string, tagName: string): XmlElementRange[] {
  const elements: XmlElementRange[] = [];
  const stack: Array<{ start: number; attrs: string }> = [];
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)>|</${escapeRegExp(tagName)}>`, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    if (match[0].startsWith("</")) {
      const opening = stack.pop();

      if (opening !== undefined) {
        elements.push({
          start: opening.start,
          end: pattern.lastIndex,
          xml: xml.slice(opening.start, pattern.lastIndex),
          attrs: opening.attrs
        });
      }

      continue;
    }

    if (/\/\s*>$/.test(match[0])) {
      elements.push({
        start: match.index,
        end: pattern.lastIndex,
        xml: xml.slice(match.index, pattern.lastIndex),
        attrs: match[1] ?? ""
      });
      continue;
    }

    stack.push({ start: match.index, attrs: match[1] ?? "" });
  }

  return elements.sort((left, right) => left.start - right.start);
}

function readFirstRunCharPr(paragraphXml: string): string | null {
  const runAttrs = paragraphXml.match(/<hp:run\b([^>]*)>/)?.[1];
  return runAttrs === undefined ? null : readXmlAttribute(runAttrs, "charPrIDRef");
}

function extractParagraphText(paragraphXml: string): string {
  return Array.from(
    paragraphXml.matchAll(/<hp:t\b(?![^>]*\/>)[^>]*>([\s\S]*?)<\/hp:t>/g),
    (match) => decodeXmlText(match[1] ?? "")
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

function readNumberAttribute(attrs: string, name: string, fallback: number): number {
  return readOptionalNumberAttribute(attrs, name) ?? fallback;
}

function readNullableNumberAttribute(attrs: string, name: string): number | null {
  return readOptionalNumberAttribute(attrs, name) ?? null;
}

function readOptionalNumberAttribute(attrs: string, name: string): number | undefined {
  const value = readXmlAttribute(attrs, name);

  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function readXmlAttribute(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${escapeRegExp(name)}="([^"]*)"`));
  return match?.[1] ?? null;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
