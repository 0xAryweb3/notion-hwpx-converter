import { strFromU8, strToU8, zipSync } from "fflate";
import type { DocumentBlock } from "../document/types";
import type { HwpxParagraphStyle, HwpxTemplate } from "./template";
import { applyLayoutSafety } from "./layoutSafety";
import { buildHwpxSourceStructure } from "./sourceStructure";
import { assignHwpxStyles } from "./styleAssignment";
import type { HwpxStyleAssignment } from "./styleAssignment";
import { escapeXmlText } from "./xml";

export type HwpxRenderMode = "auto" | "flat" | "preserveTemplate";

export interface TableTextStyleOverride {
  fontFamily?: string;
  fontSizePt?: number;
  charSpacing?: number;
  bold?: boolean;
}

export interface TableStyleOverrides {
  title?: TableTextStyleOverride;
  body?: TableTextStyleOverride;
}

export interface HwpxAssetPolicy {
  templateGraphics?: "drop" | "keep";
  sourceImages?: "place" | "skip";
}

export interface GenerateHwpxOptions {
  mode?: HwpxRenderMode;
  tableStyles?: TableStyleOverrides;
  assetPolicy?: HwpxAssetPolicy;
}

interface NormalizedAssetPolicy {
  templateGraphics: "drop" | "keep";
  sourceImages: "place" | "skip";
}

interface HwpxPackageAsset {
  id: string;
  path: string;
  mediaType: string;
  bytes: Uint8Array;
}

const sectionNamespace =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" ' +
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ' +
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" ' +
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"';
const pageBottomHeadroomReserve = 4000;
const sourceImageBottomHeadroomReserve = 4000;

export function generateHwpx(template: HwpxTemplate, blocks: DocumentBlock[], options: GenerateHwpxOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(template.files)) {
    files[path] = new Uint8Array(content);
  }

  const assetPolicy = normalizeAssetPolicy(options.assetPolicy);
  const sourceImageAssets = collectSourceImageAssets(blocks, assetPolicy);
  const tableStyleContext = createTableStyleContext(template.headerXml, options.tableStyles);
  const sectionXml = renderHybridSectionXml(
    template,
    blocks,
    tableStyleContext,
    options.mode ?? "auto",
    assetPolicy,
    sourceImageAssets
  );

  files["Contents/section0.xml"] = new Uint8Array(strToU8(sectionXml));
  files["Contents/header.xml"] = new Uint8Array(strToU8(tableStyleContext.headerXml));
  files["Preview/PrvText.txt"] = new Uint8Array(strToU8(blocks.map((block) => block.text).join("\r\n")));
  addSourceImageAssetsToPackage(files, sourceImageAssets);
  pruneUnreferencedBinData(files, sectionXml);

  return zipSync(files);
}

function normalizeAssetPolicy(policy: HwpxAssetPolicy | undefined): NormalizedAssetPolicy {
  return {
    templateGraphics: policy?.templateGraphics ?? "drop",
    sourceImages: policy?.sourceImages ?? "place"
  };
}

function collectSourceImageAssets(blocks: DocumentBlock[], policy: NormalizedAssetPolicy): HwpxPackageAsset[] {
  if (policy.sourceImages === "skip") {
    return [];
  }

  return blocks
    .filter((block) => block.role === "image" && block.asset?.bytes !== undefined)
    .map((block, index) => {
      const mediaType = block.asset?.mimeType ?? "image/png";
      const extension = extensionFromMimeType(mediaType);
      const id = `source-image-${index + 1}`;

      return {
        id,
        path: `BinData/${id}.${extension}`,
        mediaType,
        bytes: block.asset?.bytes ?? new Uint8Array()
      };
    });
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

function addSourceImageAssetsToPackage(files: Record<string, Uint8Array>, assets: HwpxPackageAsset[]): void {
  if (assets.length === 0) {
    return;
  }

  for (const asset of assets) {
    files[asset.path] = new Uint8Array(asset.bytes);
  }

  addSourceImageManifestItems(files, assets);
}

function addSourceImageManifestItems(files: Record<string, Uint8Array>, assets: HwpxPackageAsset[]): void {
  const contentPath = "Contents/content.hpf";
  const content = files[contentPath];
  const items = assets
    .map((asset) => `<opf:item id="${asset.id}" href="${asset.path}" media-type="${asset.mediaType}" isEmbeded="1"/>`)
    .join("");

  if (content === undefined) {
    files[contentPath] = new Uint8Array(strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf"><opf:manifest>${items}<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest></opf:package>`
    ));
    return;
  }

  const contentXml = strFromU8(content);
  const withoutExisting = assets.reduce(
    (xml, asset) => xml.replace(new RegExp(`<opf:item\\b(?=[^>]*\\bid="${escapeRegExp(asset.id)}")[^>]*\\/>`, "g"), ""),
    contentXml
  );
  const updated = withoutExisting.includes("</opf:manifest>")
    ? withoutExisting.replace("</opf:manifest>", `${items}</opf:manifest>`)
    : `${withoutExisting}${items}`;

  files[contentPath] = new Uint8Array(strToU8(updated));
}

function pruneUnreferencedBinData(files: Record<string, Uint8Array>, sectionXml: string): void {
  const usedBinaryIds = new Set(Array.from(
    sectionXml.matchAll(/binaryItemIDRef="([^"]+)"/g),
    (match) => match[1] ?? ""
  ));

  for (const path of Object.keys(files)) {
    if (!path.startsWith("BinData/")) {
      continue;
    }

    const binaryId = path.split("/").pop()?.replace(/\.[^.]+$/u, "");

    if (binaryId !== undefined && !usedBinaryIds.has(binaryId)) {
      delete files[path];
    }
  }

  const contentPath = "Contents/content.hpf";
  const content = files[contentPath];

  if (content === undefined) {
    return;
  }

  const contentXml = strFromU8(content).replace(/<opf:item\b[^>]*\/>/g, (item) => {
    const href = readXmlAttributeFromElement(item, "href");
    const id = readXmlAttributeFromElement(item, "id");

    if (href !== null && href.startsWith("BinData/") && (id === null || !usedBinaryIds.has(id))) {
      return "";
    }

    return item;
  });

  files[contentPath] = new Uint8Array(strToU8(contentXml));
}

function readXmlAttributeFromElement(elementXml: string, name: string): string | null {
  return readXmlAttribute(elementXml, name);
}

export function renderSectionXml(template: HwpxTemplate, blocks: DocumentBlock[]): string {
  const layoutState = createLineLayoutState(template.sectionXml, template.headerXml);
  const paragraphs = blocks
    .map((block, index) => renderParagraph(template, block, index, true, layoutState, paragraphLayoutOptions(block, blocks[index + 1])))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${sectionNamespace}>${paragraphs}</hs:sec>`;
}

function renderParagraph(
  template: HwpxTemplate,
  block: DocumentBlock,
  index: number,
  includeControls = true,
  layoutState?: LineLayoutState,
  layoutOptions?: ParagraphLayoutOptions
): string {
  const style = template.styleMap[block.role];
  const controls = includeControls && index === 0 ? template.sectionControlsXml : "";

  return renderParagraphWithStyle(style, block.text, index, controls, layoutState, layoutOptions);
}

function renderParagraphWithStyle(
  style: HwpxParagraphStyle,
  rawText: string,
  index: number,
  controls = "",
  layoutState?: LineLayoutState,
  layoutOptions?: ParagraphLayoutOptions
): string {
  const text = escapeXmlText(rawText);
  const linesegarray = layoutState === undefined ? "" : renderLineSegArray(layoutState, style, rawText, layoutOptions);
  const pageBreak = layoutState?.lastParagraphPageBreak === true ? "1" : "0";

  return `<hp:p id="${index}" paraPrIDRef="${style.paraPrIDRef}" styleIDRef="${style.styleIDRef}" pageBreak="${pageBreak}" columnBreak="0" merged="0">` +
    `${renderRun(style, controls)}${renderRun(style, `<hp:t>${text}</hp:t>`)}` +
    `${linesegarray}` +
    `</hp:p>`;
}

function renderRun(style: HwpxParagraphStyle, content: string): string {
  return `<hp:run charPrIDRef="${style.charPrIDRef}">${content}</hp:run>`;
}

function renderPageBreakParagraph(style: HwpxParagraphStyle, index: number): string {
  return `<hp:p id="${index}" paraPrIDRef="${style.paraPrIDRef}" styleIDRef="${style.styleIDRef}" pageBreak="1" columnBreak="0" merged="0">` +
    `${renderRun(style, "")}` +
    `</hp:p>`;
}

interface LineLayoutState {
  currentVertPos: number;
  pageContentHeight: number;
  pageContentWidth: number;
  lastParagraphPageBreak: boolean;
  defaultMetrics: LineMetrics;
  styleMetrics: Map<string, LineMetrics>;
  charHeights: Map<string, number>;
  paragraphMargins: Map<string, ParagraphMargins>;
}

interface LineMetrics {
  horzPos: number;
  horzSize: number;
  textHeight: number;
  baseline: number;
  spacing: number;
  firstFlags: string;
  continuationFlags: string;
  hasExplicitTextHeight: boolean;
}

interface ParagraphMargins {
  intent: number;
  left: number;
  prev: number;
  next: number;
}

interface ParagraphLayoutOptions {
  extraAfterLines?: number;
}

function createLineLayoutState(
  sourceXml: string,
  headerXml: string,
  pageSourceXml = sourceXml,
  initialVertPos?: number
): LineLayoutState {
  const firstLineSeg = sourceXml.match(/<hp:lineseg\b([^>]*)\/>/)?.[1] ?? "";
  const defaultMetrics = readLineMetrics(firstLineSeg, {
    horzPos: 0,
    horzSize: 48192,
    textHeight: 1000,
    baseline: 850,
    spacing: 600,
    firstFlags: "393216",
    continuationFlags: "1441792",
    hasExplicitTextHeight: false
  });
  const charHeights = readCharHeights(headerXml);

  return {
    currentVertPos: initialVertPos ?? readNumberAttribute(firstLineSeg, "vertpos", 0),
    pageContentHeight: readPageContentHeight(pageSourceXml),
    pageContentWidth: readPageContentWidth(pageSourceXml, defaultMetrics.horzSize),
    lastParagraphPageBreak: false,
    defaultMetrics,
    styleMetrics: readStyleLineMetrics(sourceXml, defaultMetrics),
    charHeights,
    paragraphMargins: readParagraphMargins(headerXml)
  };
}

function renderLineSegArray(
  layoutState: LineLayoutState,
  style: HwpxParagraphStyle,
  rawText: string,
  options: ParagraphLayoutOptions = {}
): string {
  const metrics = resolveLineMetrics(layoutState, style);
  const paragraphMargins = layoutState.paragraphMargins.get(style.paraPrIDRef) ?? { intent: 0, left: 0, prev: 0, next: 0 };
  const isBullet = isRoundOrDashBulletText(rawText);
  const leftIndent = Math.max(0, paragraphMargins.left);
  const legacyHangingIndent = isBullet && leftIndent === 0
    ? Math.max(0, -paragraphMargins.intent)
    : 0;
  const firstLineIndent = leftIndent > 0 ? Math.max(0, leftIndent + paragraphMargins.intent) : 0;
  const bulletTextOffset = isBullet && leftIndent > 0 && paragraphMargins.intent >= 0
    ? estimateBulletTextOffset(metrics.textHeight)
    : 0;
  const continuationIndent = (leftIndent > 0 ? leftIndent : legacyHangingIndent) + bulletTextOffset;
  const lineStep = metrics.textHeight + metrics.spacing;
  const firstHorzSize = Math.max(1, metrics.horzSize - firstLineIndent);
  const firstCharsPerLine = estimateCharsPerLine(firstHorzSize, metrics.textHeight);
  const continuationHorzSize = Math.max(1, metrics.horzSize - continuationIndent);
  const continuationCharsPerLine = estimateCharsPerLine(continuationHorzSize, metrics.textHeight);
  const lineTextPositions = computeLineTextPositions(rawText, firstCharsPerLine, continuationCharsPerLine);
  const lineCount = lineTextPositions.length;
  const lines: string[] = [];
  const tentativeStartVertPos = layoutState.currentVertPos + paragraphMargins.prev;
  const lineBlockHeight = lineCount * lineStep;
  const tentativeBottom = tentativeStartVertPos + lineBlockHeight;
  const startsNewPage = layoutState.currentVertPos > 0 &&
    (
      tentativeBottom > layoutState.pageContentHeight ||
      tentativeBottom > layoutState.pageContentHeight - pageBottomHeadroomReserve
    );
  const startVertPos = startsNewPage ? 0 : tentativeStartVertPos;

  layoutState.lastParagraphPageBreak = startsNewPage;

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const textPos = lineTextPositions[lineIndex] ?? 0;
    const horzPos = lineIndex === 0 ? metrics.horzPos + firstLineIndent : metrics.horzPos + continuationIndent;
    const horzSize = lineIndex === 0 ? firstHorzSize : continuationHorzSize;

    lines.push(
      `<hp:lineseg textpos="${textPos}" ` +
      `vertpos="${startVertPos + lineIndex * lineStep}" ` +
      `vertsize="${metrics.textHeight}" textheight="${metrics.textHeight}" ` +
      `baseline="${metrics.baseline}" spacing="${metrics.spacing}" ` +
      `horzpos="${horzPos}" horzsize="${horzSize}" ` +
      `flags="${lineIndex === 0 ? metrics.firstFlags : metrics.continuationFlags}"/>`
    );
  }

  layoutState.currentVertPos = startVertPos + lineCount * lineStep + paragraphMargins.next + (options.extraAfterLines ?? 0) * lineStep;

  return `<hp:linesegarray>${lines.join("")}</hp:linesegarray>`;
}

function estimateCharsPerLine(horzSize: number, textHeight: number): number {
  return Math.max(12, Math.floor(horzSize / Math.max(1, textHeight * 0.75)));
}

function computeLineTextPositions(rawText: string, firstCharsPerLine: number, continuationCharsPerLine: number): number[] {
  const textLength = Math.max(rawText.trimEnd().length, rawText.length === 0 ? 1 : 0);

  if (textLength <= firstCharsPerLine) {
    return [0];
  }

  const positions = [0];
  let current = 0;
  let capacity = firstCharsPerLine;

  while (current + capacity < textLength) {
    let next = findWhitespaceBreak(rawText, current, current + capacity) ?? current + capacity;

    if (next <= current) {
      next = Math.min(textLength, current + capacity);
    }

    while (next < textLength && /\s/u.test(rawText[next] ?? "")) {
      next += 1;
    }

    if (textLength - next < minimumFinalLineChars()) {
      break;
    }

    if (next >= textLength) {
      break;
    }

    positions.push(next);
    current = next;
    capacity = continuationCharsPerLine;
  }

  return positions;
}

function minimumFinalLineChars(): number {
  return 9;
}

function findWhitespaceBreak(text: string, start: number, preferredEnd: number): number | undefined {
  const end = Math.min(text.length, preferredEnd);
  const minimum = start + Math.max(4, Math.floor((end - start) * 0.45));

  for (let index = end; index > minimum; index -= 1) {
    if (/\s/u.test(text[index - 1] ?? "")) {
      return index;
    }
  }

  return undefined;
}

function estimateBulletTextOffset(textHeight: number): number {
  return Math.max(1000, Math.round(textHeight * 1.45));
}

function isRoundOrDashBulletText(text: string): boolean {
  return /^\s*(?:○|[-–])\s*\S/u.test(text);
}

function readStyleLineMetrics(sourceXml: string, defaultMetrics: LineMetrics): Map<string, LineMetrics> {
  const metrics = new Map<string, LineMetrics>();

  for (const match of sourceXml.matchAll(/<hp:p\b([^>]*)>([\s\S]*?)<\/hp:p>/g)) {
    const paragraphAttrs = match[1] ?? "";
    const paragraphBody = match[2] ?? "";
    const paraPrIDRef = readXmlAttribute(paragraphAttrs, "paraPrIDRef");
    const styleIDRef = readXmlAttribute(paragraphAttrs, "styleIDRef");
    const charPrIDRef = readFirstRunCharPr(paragraphBody);
    const firstLineSeg = paragraphBody.match(/<hp:lineseg\b([^>]*)\/>/)?.[1];
    const text = extractParagraphText(paragraphBody).trim();

    if (
      text.length === 0 ||
      paraPrIDRef === null ||
      styleIDRef === null ||
      charPrIDRef === null ||
      firstLineSeg === undefined
    ) {
      continue;
    }

    const lineMetrics = readLineMetrics(firstLineSeg, defaultMetrics);
    setMetricIfMissing(metrics, styleLineMetricKey({ paraPrIDRef, styleIDRef, charPrIDRef }), lineMetrics);
    setMetricIfMissing(metrics, `para:${paraPrIDRef}`, lineMetrics);
    setMetricIfMissing(metrics, `char:${charPrIDRef}`, lineMetrics);
  }

  return metrics;
}

function setMetricIfMissing(metrics: Map<string, LineMetrics>, key: string, value: LineMetrics): void {
  if (!metrics.has(key)) {
    metrics.set(key, value);
  }
}

function resolveLineMetrics(layoutState: LineLayoutState, style: HwpxParagraphStyle): LineMetrics {
  const sourceMetrics =
    layoutState.styleMetrics.get(styleLineMetricKey(style)) ??
    layoutState.styleMetrics.get(`para:${style.paraPrIDRef}`) ??
    layoutState.styleMetrics.get(`char:${style.charPrIDRef}`);
  const charHeight = layoutState.charHeights.get(style.charPrIDRef);
  const normalizedSourceMetrics = sourceMetrics === undefined
    ? undefined
    : normalizeNarrowLineMetrics(layoutState, sourceMetrics);

  if (normalizedSourceMetrics !== undefined) {
    return charHeight === undefined || normalizedSourceMetrics.textHeight >= charHeight
      ? normalizedSourceMetrics
      : withTextHeight(normalizedSourceMetrics, charHeight);
  }

  const defaultMetrics = normalizeNarrowLineMetrics(layoutState, layoutState.defaultMetrics);

  return charHeight === undefined ? defaultMetrics : withTextHeight(defaultMetrics, charHeight);
}

function readPageContentHeight(sourceXml: string): number {
  const pagePr = sourceXml.match(/<hp:pagePr\b([^>]*)>([\s\S]*?)<\/hp:pagePr>|<hp:pagePr\b([^>]*)\/>/);
  const pageAttrs = pagePr?.[1] ?? pagePr?.[3] ?? "";
  const marginAttrs = pagePr?.[2]?.match(/<hp:margin\b([^>]*)\/>/)?.[1] ?? "";
  const pageHeight = readNumberAttribute(pageAttrs, "height", 84186);
  const top = readNumberAttribute(marginAttrs, "top", 0);
  const bottom = readNumberAttribute(marginAttrs, "bottom", 0);

  return Math.max(1, pageHeight - top - bottom);
}

function readPageContentWidth(sourceXml: string, fallback: number): number {
  const pagePr = sourceXml.match(/<hp:pagePr\b([^>]*)>([\s\S]*?)<\/hp:pagePr>|<hp:pagePr\b([^>]*)\/>/);

  if (pagePr === null) {
    return fallback;
  }

  const pageAttrs = pagePr?.[1] ?? pagePr?.[3] ?? "";
  const marginAttrs = pagePr?.[2]?.match(/<hp:margin\b([^>]*)\/>/)?.[1] ?? "";
  const pageWidth = readNumberAttribute(pageAttrs, "width", fallback);
  const left = readNumberAttribute(marginAttrs, "left", 0);
  const right = readNumberAttribute(marginAttrs, "right", 0);

  return Math.max(1, pageWidth - left - right);
}

function normalizeNarrowLineMetrics(layoutState: LineLayoutState, metrics: LineMetrics): LineMetrics {
  const availableWidth = Math.max(1, layoutState.pageContentWidth - Math.max(0, metrics.horzPos));

  if (metrics.horzSize >= availableWidth * 0.75) {
    return metrics;
  }

  return {
    ...metrics,
    horzSize: Math.max(metrics.horzSize, availableWidth)
  };
}

function styleLineMetricKey(style: HwpxParagraphStyle): string {
  return `style:${style.paraPrIDRef}:${style.styleIDRef}:${style.charPrIDRef}`;
}

function withTextHeight(metrics: LineMetrics, textHeight: number): LineMetrics {
  if (metrics.textHeight === textHeight) {
    return metrics;
  }

  return {
    ...metrics,
    textHeight,
    baseline: Math.round(textHeight * 0.85),
    spacing: Math.round(textHeight * 0.6)
  };
}

function readLineMetrics(attrs: string, fallback: LineMetrics): LineMetrics {
  const explicitTextHeight = readOptionalNumberAttribute(attrs, "textheight");
  const textHeight = explicitTextHeight ?? fallback.textHeight;

  return {
    horzPos: readNumberAttribute(attrs, "horzpos", fallback.horzPos),
    horzSize: readNumberAttribute(attrs, "horzsize", fallback.horzSize),
    textHeight,
    baseline: readNumberAttribute(attrs, "baseline", Math.round(textHeight * 0.85)),
    spacing: readNumberAttribute(attrs, "spacing", Math.round(textHeight * 0.6)),
    firstFlags: readXmlAttribute(attrs, "flags") ?? fallback.firstFlags,
    continuationFlags: fallback.continuationFlags,
    hasExplicitTextHeight: explicitTextHeight !== undefined
  };
}

function readNumberAttribute(attrs: string, name: string, fallback: number): number {
  return readOptionalNumberAttribute(attrs, name) ?? fallback;
}

function readOptionalNumberAttribute(attrs: string, name: string): number | undefined {
  const parsed = Number.parseInt(readXmlAttribute(attrs, name) ?? "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readCharHeights(headerXml: string): Map<string, number> {
  const heights = new Map<string, number>();

  for (const match of headerXml.matchAll(/<hh:charPr\b([^>]*)>/g)) {
    const attrs = match[1] ?? "";
    const id = readXmlAttribute(attrs, "id");
    const height = Number.parseInt(readXmlAttribute(attrs, "height") ?? "", 10);

    if (id !== null && Number.isFinite(height)) {
      heights.set(id, height);
    }
  }

  return heights;
}

function readParagraphMargins(headerXml: string): Map<string, ParagraphMargins> {
  const margins = new Map<string, ParagraphMargins>();

  for (const match of headerXml.matchAll(/<hh:paraPr\b([^>]*)>([\s\S]*?)<\/hh:paraPr>/g)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const id = readXmlAttribute(attrs, "id");

    if (id === null) {
      continue;
    }

    margins.set(id, {
      intent: readParagraphMarginValue(body, "intent"),
      left: readParagraphMarginValue(body, "left"),
      prev: readParagraphMarginValue(body, "prev"),
      next: readParagraphMarginValue(body, "next")
    });
  }

  return margins;
}

function readParagraphMarginValue(paraPrBody: string, name: string): number {
  const match = paraPrBody.match(new RegExp(`<hc:${escapeRegExp(name)}\\b[^>]*\\bvalue="(-?\\d+)"`));
  const parsed = Number.parseInt(match?.[1] ?? "", 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function renderHybridSectionXml(
  template: HwpxTemplate,
  blocks: DocumentBlock[],
  tableStyleContext: TableStyleContext,
  mode: HwpxRenderMode,
  assetPolicy: NormalizedAssetPolicy,
  sourceImageAssets: HwpxPackageAsset[]
): string {
  if (mode === "preserveTemplate") {
    return renderPreservedTemplateSectionXml(
      template.sectionXml,
      blocks,
      tableStyleContext,
      assetPolicy,
      sourceImageAssets,
      template.styleMap.body
    );
  }

  const titleRegion = extractLeadingTitleRegion(template.sectionXml);

  if (titleRegion === null) {
    return appendSourceImageParagraphs(renderSectionXml(template, blocks), sourceImageAssets, template.styleMap.body);
  }

  const replacements = buildTemplateReplacementTexts(blocks);
  const renderedTitle = renderTitleRegion(titleRegion.xml, replacements, tableStyleContext);
  const bodyTableTemplates = mode === "flat" ? [] : extractTableTemplates(titleRegion.bodyTemplateXml);
  const structureTableTemplates = mode === "flat"
    ? []
    : extractStructureTableTemplates(titleRegion.bodyTemplateXml, template.analysis.leadingTitleTableCount);
  const bodyBlocks = blocks.slice(Math.max(1, renderedTitle.consumedSourceBlocks));
  const assignments = applyLayoutSafety(
    assignHwpxStyles(template.formatGrammar, buildHwpxSourceStructure(bodyBlocks), template.styleMap)
  );
  const renderAssignments = prepareGeneratedParagraphStyles(assignments, tableStyleContext);
  const fallbackBodyStartVertPos = titleRegion.bodyTemplateXml.includes("<hp:lineseg")
    ? undefined
    : readDirectLineBottom(titleRegion.xml) + 1000;
  const bodyParagraphs = renderAssignedHybridBodyBlocks(
    template,
    renderAssignments,
    bodyTableTemplates,
    structureTableTemplates,
    tableStyleContext,
    createLineLayoutState(
      titleRegion.bodyTemplateXml,
      tableStyleContext.headerXml,
      template.sectionXml,
      fallbackBodyStartVertPos
    )
  );

  return appendSourceImageParagraphs(
    `${titleRegion.before}${renderedTitle.xml}${bodyParagraphs}${titleRegion.after}`,
    sourceImageAssets,
    template.styleMap.body
  );
}

function renderAssignedHybridBodyBlocks(
  template: HwpxTemplate,
  assignments: HwpxStyleAssignment[],
  bodyTableTemplates: TableTemplate[],
  structureTableTemplates: TableTemplate[],
  tableStyleContext: TableStyleContext,
  layoutState: LineLayoutState
): string {
  let xml = "";
  let paragraphIndex = 0;

  assignments.forEach((assignment, assignmentIndex) => {
    if (assignment.type === "image") {
      return;
    }

    if (assignment.type === "table") {
      const rows = assignment.rows ?? [];
      xml += renderTableRows(rows, bodyTableTemplates, template.styleMap.tableRow, paragraphIndex, layoutState);
      paragraphIndex += Math.max(1, rows.length);
      return;
    }

    if (assignment.style === undefined) {
      return;
    }

    const structureTable = assignment.renderAs === "structureTable"
      ? selectStructureTableTemplate(structureTableTemplates, assignment)
      : undefined;

    if (structureTable !== undefined) {
      if (shouldStartTableOnNewPage(layoutState, structureTable.xml)) {
        xml += renderPageBreakParagraph(assignment.style, paragraphIndex);
        resetLayoutStateToNewPage(layoutState);
        paragraphIndex += 1;
      }

      xml += renderStructureTable(structureTable, assignment.text, tableStyleContext);
      reserveTableLayoutSpace(layoutState, structureTable.xml);
      paragraphIndex += 1;
      return;
    }

    xml += renderParagraphWithStyle(
      assignment.style,
      assignment.text,
      paragraphIndex,
      "",
      layoutState
    );
    paragraphIndex += 1;

    if (shouldAddBreakAfterAssignment(assignment, findNextMeaningfulAssignment(assignments, assignmentIndex))) {
      xml += renderParagraphWithStyle(assignment.style, "", paragraphIndex, "", layoutState);
      paragraphIndex += 1;
    }
  });

  return xml;
}

function prepareGeneratedParagraphStyles(
  assignments: HwpxStyleAssignment[],
  context: TableStyleContext
): HwpxStyleAssignment[] {
  return assignments.map((assignment) => {
    if (assignment.type !== "paragraph" || assignment.style === undefined) {
      return assignment;
    }

    const isBullet = assignment.grammarRole === "bullet" || assignment.grammarRole === "newsBullet";
    let style = assignment.style;
    let paragraphMargins = assignment.paragraphMargins;
    const reasons: string[] = [];

    if (isBullet && assignment.paragraphMargins.intent < 0) {
      const leftIndent = Math.max(assignment.paragraphMargins.left, Math.abs(assignment.paragraphMargins.intent));
      const paraPrIDRef = ensureGeneratedBulletParaPr(context, style.paraPrIDRef, leftIndent);

      if (paraPrIDRef !== null) {
        style = {
          ...style,
          paraPrIDRef
        };
        paragraphMargins = {
          ...paragraphMargins,
          intent: 0,
          left: leftIndent
        };
        reasons.push("generated positive bullet indent");
      }
    }

    const leftAlignedParaPrIDRef = ensureGeneratedLeftAlignParaPr(context, style.paraPrIDRef);

    if (leftAlignedParaPrIDRef !== null) {
      style = {
        ...style,
        paraPrIDRef: leftAlignedParaPrIDRef
      };
      reasons.push("generated left alignment");
    }

    const plainParaPrIDRef = ensureGeneratedPlainParaPr(context, style.paraPrIDRef);

    if (plainParaPrIDRef !== null) {
      style = {
        ...style,
        paraPrIDRef: plainParaPrIDRef
      };
      reasons.push("removed automatic paragraph heading");
    }

    if (reasons.length === 0) {
      return assignment;
    }

    return {
      ...assignment,
      style,
      paragraphMargins,
      reason: `${assignment.reason}; ${reasons.join("; ")}`
    };
  });
}

function shouldAddBreakAfterAssignment(
  assignment: HwpxStyleAssignment,
  nextAssignment: HwpxStyleAssignment | undefined
): boolean {
  return (
    (assignment.grammarRole === "bullet" || assignment.grammarRole === "newsBullet") &&
    nextAssignment !== undefined &&
    nextAssignment.grammarRole !== "bullet" &&
    nextAssignment.grammarRole !== "newsBullet" &&
    nextAssignment.type !== "image" &&
    nextAssignment.type !== "table"
  );
}

function findNextMeaningfulAssignment(
  assignments: HwpxStyleAssignment[],
  index: number
): HwpxStyleAssignment | undefined {
  for (let current = index + 1; current < assignments.length; current += 1) {
    const assignment = assignments[current];

    if (assignment !== undefined && assignment.text.trim().length > 0) {
      return assignment;
    }
  }

  return undefined;
}

function renderPreservedTemplateSectionXml(
  sectionXml: string,
  blocks: DocumentBlock[],
  tableStyleContext: TableStyleContext,
  assetPolicy: NormalizedAssetPolicy,
  sourceImageAssets: HwpxPackageAsset[],
  imageStyle: HwpxParagraphStyle
): string {
  const editableSectionXml = assetPolicy.templateGraphics === "drop"
    ? removePreservedTemplateGraphics(sectionXml)
    : sectionXml;
  const sourceHasTables = blocks.some((block) => block.role === "tableRow");
  const structuralSectionXml = sourceHasTables ? editableSectionXml : removeBodyTables(editableSectionXml);
  const assignments = buildPreservedSlotAssignments(structuralSectionXml, blocks);
  const replacedXml = replacePreservedTextSlots(structuralSectionXml, assignments);

  return appendSourceImageParagraphs(
    removeLineSegArrays(remapPreservedTemplateTableStyles(replacedXml, tableStyleContext)),
    sourceImageAssets,
    imageStyle
  );
}

function removeBodyTables(sectionXml: string): string {
  const titleRegion = extractLeadingTitleRegion(sectionXml);

  if (titleRegion === null) {
    return removeXmlElementsByTagName(sectionXml, "hp:tbl");
  }

  return `${titleRegion.before}${titleRegion.xml}${removeXmlElementsByTagName(titleRegion.bodyTemplateXml, "hp:tbl")}${titleRegion.after}`;
}

function replacePreservedTextSlots(sectionXml: string, assignments: Map<number, ReplacementBlock>): string {
  const slots = extractTemplateTextSlots(sectionXml);
  let replacedXml = sectionXml;

  for (const slot of [...slots].reverse()) {
    const replacementBlock = assignments.get(slot.ordinal);
    const replacement = replacementBlock === undefined ? "" : adaptBlockTextForTemplateSlot(replacementBlock, slot.body);
    const replacedSlotXml = slot.xml.replace(slot.body, replaceParagraphTextNodes(slot.body, replacement));

    replacedXml = `${replacedXml.slice(0, slot.start)}${replacedSlotXml}${replacedXml.slice(slot.end)}`;
  }

  return replacedXml;
}

function removePreservedTemplateGraphics(sectionXml: string): string {
  return removeXmlElementsByTagName(removeXmlElementsByTagName(sectionXml, "hp:container"), "hp:pic");
}

function removeXmlElementsByTagName(xml: string, tagName: string): string {
  const ranges = findXmlElementRanges(xml, tagName);
  let strippedXml = xml;

  for (const range of ranges.reverse()) {
    strippedXml = strippedXml.slice(0, range.start) + strippedXml.slice(range.end);
  }

  return strippedXml;
}

function findXmlElementRanges(xml: string, tagName: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>|</${escapeRegExp(tagName)}>`, "g");
  let depth = 0;
  let rangeStart: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const token = match[0];

    if (token.startsWith("</")) {
      if (depth === 0) {
        continue;
      }

      depth -= 1;

      if (depth === 0 && rangeStart !== null) {
        ranges.push({ start: rangeStart, end: pattern.lastIndex });
        rangeStart = null;
      }

      continue;
    }

    if (depth === 0) {
      rangeStart = match.index;
    }

    if (/\/\s*>$/.test(token)) {
      if (depth === 0 && rangeStart !== null) {
        ranges.push({ start: rangeStart, end: pattern.lastIndex });
        rangeStart = null;
      }

      continue;
    }

    depth += 1;
  }

  return ranges;
}

function appendSourceImageParagraphs(
  sectionXml: string,
  assets: HwpxPackageAsset[],
  style: HwpxParagraphStyle
): string {
  if (assets.length === 0) {
    return sectionXml;
  }

  const sectionWithNamespace = ensureCoreNamespace(sectionXml);
  const pageContentHeight = readPageContentHeight(sectionWithNamespace);
  let currentBottom = readCurrentPageLineBottom(sectionWithNamespace);
  const imageParagraphs = assets.map((asset, index) => {
    const imageBlockHeight = sourceImageDisplayHeight() + 600;
    let vertPos = currentBottom + 1000;
    let pageBreak = false;

    if (currentBottom > 0 && vertPos + imageBlockHeight > pageContentHeight - sourceImageBottomHeadroomReserve) {
      pageBreak = true;
      vertPos = 0;
    }

    currentBottom = vertPos + imageBlockHeight;

    return renderSourceImageParagraph(asset, style, index, vertPos, pageBreak);
  }).join("");
  const closeIndex = sectionWithNamespace.lastIndexOf("</hs:sec>");

  if (closeIndex < 0) {
    return `${sectionWithNamespace}${imageParagraphs}`;
  }

  return `${sectionWithNamespace.slice(0, closeIndex)}${imageParagraphs}${sectionWithNamespace.slice(closeIndex)}`;
}

function ensureCoreNamespace(sectionXml: string): string {
  if (sectionXml.includes("xmlns:hc=")) {
    return sectionXml;
  }

  return sectionXml.replace(
    /<hs:sec\b([^>]*)>/u,
    `<hs:sec$1 xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">`
  );
}

function readCurrentPageLineBottom(sectionXml: string): number {
  const sectionContent = readSectionContent(sectionXml);
  const blocks = readTopLevelBlocks(sectionContent);
  let bottom = 0;

  for (const block of blocks) {
    if (!block.xml.startsWith("<hp:p")) {
      continue;
    }

    if (readXmlAttribute(block.xml.match(/^<hp:p\b([^>]*)>/)?.[1] ?? "", "pageBreak") === "1") {
      bottom = 0;
    }

    const directXml = removeXmlElementsByTagName(block.xml, "hp:tbl");
    bottom = Math.max(bottom, readLineSegBottom(directXml));
  }

  return bottom;
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

function readDirectLineBottom(xml: string): number {
  return readTopLevelBlocks(xml).reduce((bottom, block) => {
    if (!block.xml.startsWith("<hp:p")) {
      return bottom;
    }

    return Math.max(bottom, readLineSegBottom(removeXmlElementsByTagName(block.xml, "hp:tbl")));
  }, 0);
}

function readLineSegBottom(xml: string): number {
  let bottom = 0;

  for (const match of xml.matchAll(/<hp:lineseg\b([^>]*)\/>/g)) {
    const attrs = match[1] ?? "";
    const vertPos = readNumberAttribute(attrs, "vertpos", 0);
    const vertSize = readNumberAttribute(attrs, "vertsize", readNumberAttribute(attrs, "textheight", 1000));
    const spacing = readNumberAttribute(attrs, "spacing", 600);

    bottom = Math.max(bottom, vertPos + vertSize + spacing);
  }

  return bottom;
}

function sourceImageDisplayHeight(): number {
  return 24000;
}

function renderSourceImageParagraph(
  asset: HwpxPackageAsset,
  style: HwpxParagraphStyle,
  index: number,
  vertPos: number,
  pageBreak: boolean
): string {
  const paragraphId = 900000000 + index;
  const width = 42520;
  const height = sourceImageDisplayHeight();

  return `<hp:p id="${paragraphId}" paraPrIDRef="${style.paraPrIDRef}" styleIDRef="${style.styleIDRef}" pageBreak="${pageBreak ? "1" : "0"}" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${style.charPrIDRef}">` +
    `<hp:pic id="${paragraphId}" zOrder="${100 + index}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${paragraphId}" reverse="0">` +
    `<hp:offset x="0" y="0"/><hp:orgSz width="${width}" height="${height}"/><hp:curSz width="${width}" height="${height}"/>` +
    `<hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(width / 2)}" centerY="${Math.round(height / 2)}" rotateimage="1"/>` +
    `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
    `<hc:img binaryItemIDRef="${asset.id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${width}" y="0"/><hc:pt2 x="${width}" y="${height}"/><hc:pt3 x="0" y="${height}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${width}" top="0" bottom="${height}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${width}" dimheight="${height}"/><hp:effects/>` +
    `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `</hp:pic></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertPos}" vertsize="${height}" textheight="${height}" baseline="${Math.round(height * 0.85)}" spacing="600" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>` +
    `</hp:p>`;
}

interface TemplateTextSlot {
  ordinal: number;
  text: string;
  start: number;
  end: number;
  body: string;
  xml: string;
}

interface ReplacementBlock {
  sourceIndex: number;
  block: DocumentBlock;
  sourceBlocks: DocumentBlock[];
}

function buildPreservedSlotAssignments(sectionXml: string, blocks: DocumentBlock[]): Map<number, ReplacementBlock> {
  const sourceBlocks = buildTemplateReplacementBlocks(blocks);
  const templateSlots = extractTemplateTextSlots(sectionXml);
  const assignments = new Map<number, ReplacementBlock>();

  if (sourceBlocks.length === 0 || templateSlots.length === 0) {
    return assignments;
  }

  const anchors = ["탄소중립 정보공유", "센터 소식"];
  const sharedAnchors = anchors
    .map((anchor) => ({
      sourceIndex: findBlockIndexByText(sourceBlocks, anchor),
      slotOrdinal: findSlotOrdinalByText(templateSlots, anchor)
    }))
    .filter((anchor): anchor is { sourceIndex: number; slotOrdinal: number } =>
      anchor.sourceIndex !== undefined && anchor.slotOrdinal !== undefined
    );

  const sourceBoundaries = [0, ...sharedAnchors.map((anchor) => anchor.sourceIndex), sourceBlocks.length];
  const slotBoundaries = [0, ...sharedAnchors.map((anchor) => anchor.slotOrdinal), templateSlots.length];

  for (let segmentIndex = 0; segmentIndex < sourceBoundaries.length - 1; segmentIndex += 1) {
    assignReplacementSegment(
      assignments,
      templateSlots,
      sourceBlocks,
      sourceBoundaries[segmentIndex],
      sourceBoundaries[segmentIndex + 1],
      slotBoundaries[segmentIndex],
      slotBoundaries[segmentIndex + 1]
    );
  }

  return assignments;
}

function assignReplacementSegment(
  assignments: Map<number, ReplacementBlock>,
  templateSlots: TemplateTextSlot[],
  sourceBlocks: DocumentBlock[],
  sourceStart: number,
  sourceEnd: number,
  slotStart: number,
  slotEnd: number
): void {
  let slotCursor = slotStart;

  for (let sourceIndex = sourceStart; sourceIndex < sourceEnd && slotCursor < slotEnd; sourceIndex += 1) {
    const sourceBlock = sourceBlocks[sourceIndex];
    const slot = findNextCompatibleSlot(templateSlots, sourceBlock, sourceBlocks, sourceIndex, slotCursor, slotEnd);

    if (slot === undefined) {
      break;
    }

    assignments.set(slot.ordinal, { sourceIndex, block: sourceBlock, sourceBlocks });
    slotCursor = slot.ordinal + 1;
  }
}

function findNextCompatibleSlot(
  templateSlots: TemplateTextSlot[],
  sourceBlock: DocumentBlock,
  sourceBlocks: DocumentBlock[],
  sourceIndex: number,
  slotStart: number,
  slotEnd: number
): TemplateTextSlot | undefined {
  for (let slotOrdinal = slotStart; slotOrdinal < slotEnd; slotOrdinal += 1) {
    const slot = templateSlots[slotOrdinal];

    if (slot !== undefined && isCompatibleReplacementSlot(sourceBlock, sourceBlocks, sourceIndex, slot)) {
      return slot;
    }
  }

  for (let slotOrdinal = slotStart; slotOrdinal < slotEnd; slotOrdinal += 1) {
    const slot = templateSlots[slotOrdinal];

    if (slot !== undefined && isFallbackFillableSlot(sourceBlock, slot)) {
      return slot;
    }
  }

  return undefined;
}

function isCompatibleReplacementSlot(
  sourceBlock: DocumentBlock,
  sourceBlocks: DocumentBlock[],
  sourceIndex: number,
  slot: TemplateTextSlot
): boolean {
  const sourceText = normalizeWhitespace(sourceBlock.text);
  const slotText = normalizeWhitespace(slot.text);

  if (sourceText === slotText) {
    return true;
  }

  if (isTemplateInstructionText(slotText) || isTemplateUtilityText(slotText)) {
    return false;
  }

  if (sourceBlock.role === "dashItem") {
    const stripped = stripDashMarker(sourceText);
    const shouldBecomeNewsTitle = isInBriefNewsSection(sourceBlocks, sourceIndex) &&
      isLikelyGeneratedNewsTitle(stripped, sourceBlocks, sourceIndex);

    if (shouldBecomeNewsTitle) {
      return isPlainHeadingSlot(slotText);
    }

    return slotText.startsWith("○") || slotText.startsWith("-") || slotText.startsWith("–");
  }

  if (sourceBlock.role === "section") {
    return isPlainHeadingSlot(slotText);
  }

  if (isBriefPageHeading(sourceText) || isBriefCategoryHeading(sourceText)) {
    return isPlainHeadingSlot(slotText);
  }

  return !slotText.startsWith("○") && !slotText.startsWith("-") && !slotText.startsWith("–");
}

function isPlainHeadingSlot(text: string): boolean {
  return (
    text.length > 0 &&
    !text.startsWith("○") &&
    !text.startsWith("-") &&
    !text.startsWith("–") &&
    !text.startsWith("*") &&
    !isTemplateUtilityText(text)
  );
}

function isTemplateUtilityText(text: string): boolean {
  return (
    text.startsWith("http") ||
    text.includes("자세히보기") ||
    text.includes("자세히 보기") ||
    text.startsWith("작성자:") ||
    text === "구분" ||
    text === "기준" ||
    text === "달성" ||
    text === "정상추진" ||
    text === "지연" ||
    text === "미달성"
  );
}

function isFallbackFillableSlot(sourceBlock: DocumentBlock, slot: TemplateTextSlot): boolean {
  const slotText = normalizeWhitespace(slot.text);

  if (normalizeWhitespace(sourceBlock.text) === slotText) {
    return true;
  }

  return !isTemplateInstructionText(slotText) && !isTemplateUtilityText(slotText);
}

function extractTemplateTextSlots(sectionXml: string): TemplateTextSlot[] {
  const slots: TemplateTextSlot[] = [];

  for (const paragraph of readAllXmlElements(sectionXml, "hp:p")) {
    if (paragraph.xml.includes("<hp:tbl")) {
      continue;
    }

    const text = extractParagraphText(paragraph.body).trim();

    if (text.length > 0) {
      slots.push({
        ordinal: slots.length,
        text,
        start: paragraph.start,
        end: paragraph.end,
        body: paragraph.body,
        xml: paragraph.xml
      });
    }
  }

  return slots;
}

function findBlockIndexByText(blocks: DocumentBlock[], text: string): number | undefined {
  const index = blocks.findIndex((block) => normalizeWhitespace(block.text) === text);
  return index < 0 ? undefined : index;
}

function findSlotOrdinalByText(slots: TemplateTextSlot[], text: string): number | undefined {
  return slots.find((slot) => normalizeWhitespace(slot.text) === text)?.ordinal;
}

function replaceParagraphTextNodes(paragraphBody: string, replacementText: string): string {
  let replacementUsed = false;
  const escapedReplacement = escapeXmlText(replacementText);

  return paragraphBody.replace(
    /<hp:t\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/hp:t>/g,
    (match, attrs: string, text: string) => {
      if (stripXmlText(text).trim().length === 0) {
        return match;
      }

      if (!replacementUsed) {
        replacementUsed = true;
        return `<hp:t${attrs}>${escapedReplacement}</hp:t>`;
      }

      return `<hp:t${attrs}></hp:t>`;
    }
  );
}

function remapPreservedTemplateTableStyles(sectionXml: string, context: TableStyleContext): string {
  let tableIndex = 0;

  return sectionXml.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, (tableXml) => {
    const tableGroup: TableStyleGroup = tableIndex === 0 ? "title" : "body";
    tableIndex += 1;
    return remapTableRunStyles(tableXml, tableGroup, context);
  });
}

interface HybridBodyStyleHints {
  articleHeading?: HwpxParagraphStyle;
  articleBullet?: HwpxParagraphStyle;
  pageHeading?: HwpxParagraphStyle;
  categoryHeading?: HwpxParagraphStyle;
  centerHeading?: HwpxParagraphStyle;
  newsTitle?: HwpxParagraphStyle;
  newsBullet?: HwpxParagraphStyle;
  body?: HwpxParagraphStyle;
  bodyTables: TableTemplate[];
  charHeights: Map<string, number>;
}

interface ParagraphCandidate {
  style: HwpxParagraphStyle;
  text: string;
  charHeight?: number;
}

interface TableTemplate {
  xml: string;
  rowCount: number;
  colCount: number;
  order: number;
  text?: string;
}

function inferHybridBodyStyleHints(bodyTemplateXml: string, headerXml: string, includeBodyTables = true): HybridBodyStyleHints {
  const charHeights = readCharHeights(headerXml);
  const candidates = extractParagraphCandidates(bodyTemplateXml, charHeights);
  const hints: HybridBodyStyleHints = {
    bodyTables: includeBodyTables ? extractTableTemplates(bodyTemplateXml) : [],
    charHeights
  };
  let categoryHeadingSeen = false;

  for (const candidate of candidates) {
    const text = normalizeWhitespace(candidate.text);

    if (text.length === 0 || isTemplateInstructionText(text)) {
      continue;
    }

    if (hints.pageHeading === undefined && text === "탄소중립 정보공유") {
      hints.pageHeading = candidate.style;
      continue;
    }

    if (hints.categoryHeading === undefined && isBriefCategoryHeading(text)) {
      hints.categoryHeading = candidate.style;
      categoryHeadingSeen = true;
      continue;
    }

    if (hints.centerHeading === undefined && text === "센터 소식" && isReadableHeadingCandidate(candidate)) {
      hints.centerHeading = candidate.style;
      continue;
    }

    if (text.startsWith("○")) {
      if (categoryHeadingSeen && hints.newsBullet === undefined) {
        hints.newsBullet = candidate.style;
      }

      if (hints.articleBullet === undefined) {
        hints.articleBullet = candidate.style;
      }

      continue;
    }

    if (categoryHeadingSeen && hints.newsTitle === undefined && isLikelyNewsTitle(text)) {
      hints.newsTitle = candidate.style;
      continue;
    }

    if (hints.articleHeading === undefined && isLikelyArticleHeading(text)) {
      hints.articleHeading = candidate.style;
      continue;
    }

    if (hints.body === undefined) {
      hints.body = candidate.style;
    }
  }

  return hints;
}

function extractParagraphCandidates(xml: string, charHeights: Map<string, number>): ParagraphCandidate[] {
  const candidates: ParagraphCandidate[] = [];

  for (const match of xml.matchAll(/<hp:p\b([^>]*)>([\s\S]*?)<\/hp:p>/g)) {
    const paragraphAttrs = match[1] ?? "";
    const paragraphBody = match[2] ?? "";
    const text = extractParagraphText(paragraphBody).trim();
    const paraPrIDRef = readXmlAttribute(paragraphAttrs, "paraPrIDRef");
    const styleIDRef = readXmlAttribute(paragraphAttrs, "styleIDRef");
    const charPrIDRef = readFirstRunCharPr(paragraphBody);

    if (text.length > 0 && paraPrIDRef !== null && styleIDRef !== null && charPrIDRef !== null) {
      candidates.push({ style: { paraPrIDRef, styleIDRef, charPrIDRef }, text, charHeight: charHeights.get(charPrIDRef) });
    }
  }

  return candidates;
}

function isReadableHeadingCandidate(candidate: ParagraphCandidate): boolean {
  return candidate.charHeight === undefined || candidate.charHeight >= 800;
}

function renderHybridBodyBlocks(
  template: HwpxTemplate,
  blocks: DocumentBlock[],
  hints: HybridBodyStyleHints,
  layoutState: LineLayoutState
): string {
  let xml = "";
  let paragraphIndex = 0;
  let blockIndex = 0;

  while (blockIndex < blocks.length) {
    const block = blocks[blockIndex];

    if (block?.role === "image") {
      blockIndex += 1;
      continue;
    }

    if (block?.role === "tableRow") {
      const tableRows: string[][] = [];

      while (blocks[blockIndex]?.role === "tableRow") {
        tableRows.push(splitTableRow(blocks[blockIndex]?.text ?? ""));
        blockIndex += 1;
      }

      xml += renderTableRows(tableRows, hints.bodyTables, template.styleMap.tableRow, paragraphIndex, layoutState);
      paragraphIndex += Math.max(1, tableRows.length);
      continue;
    }

    if (block !== undefined) {
      xml += renderHybridBodyParagraph(template, block, paragraphIndex, blockIndex, blocks, hints, layoutState);
      paragraphIndex += 1;
    }

    blockIndex += 1;
  }

  return xml;
}

function renderHybridBodyParagraph(
  template: HwpxTemplate,
  block: DocumentBlock,
  paragraphIndex: number,
  blockIndex: number,
  blocks: DocumentBlock[],
  hints: HybridBodyStyleHints,
  layoutState: LineLayoutState
): string {
  const resolved = resolveHybridBodyStyle(template, block, blocks, blockIndex, hints);

  return renderParagraphWithStyle(
    resolved.style,
    resolved.text,
    paragraphIndex,
    "",
    layoutState,
    paragraphLayoutOptions(block, findNextMeaningfulBlock(blocks, blockIndex))
  );
}

function paragraphLayoutOptions(block: DocumentBlock, nextBlock: DocumentBlock | undefined): ParagraphLayoutOptions {
  return shouldAddBreakAfterBlock(block, nextBlock) ? { extraAfterLines: 1 } : {};
}

function shouldAddBreakAfterBlock(block: DocumentBlock, nextBlock: DocumentBlock | undefined): boolean {
  return (
    block.role === "dashItem" &&
    nextBlock !== undefined &&
    nextBlock.role !== "dashItem" &&
    nextBlock.role !== "image" &&
    nextBlock.role !== "tableRow"
  );
}

function resolveHybridBodyStyle(
  template: HwpxTemplate,
  block: DocumentBlock,
  blocks: DocumentBlock[],
  index: number,
  hints: HybridBodyStyleHints
): { style: HwpxParagraphStyle; text: string } {
  const text = block.text.trim();

  if (block.role === "section") {
    return { style: hints.articleHeading ?? template.styleMap.section, text };
  }

  if (isBriefPageHeading(text)) {
    return { style: hints.pageHeading ?? hints.articleHeading ?? template.styleMap.body, text };
  }

  if (isBriefCategoryHeading(text)) {
    const style = text === "센터 소식"
      ? firstReadableStyle(hints, hints.centerHeading, hints.categoryHeading, hints.pageHeading, hints.articleHeading)
      : hints.categoryHeading;
    return { style: style ?? hints.articleHeading ?? template.styleMap.body, text };
  }

  if (block.role === "dashItem") {
    const stripped = stripDashMarker(text);
    const isNewsSection = isInBriefNewsSection(blocks, index);

    if (isNewsSection && isLikelyGeneratedNewsTitle(stripped, blocks, index)) {
      const currentCategory = findCurrentBriefCategory(blocks, index);
      const style = currentCategory === "센터 소식"
        ? firstReadableStyle(hints, hints.articleHeading, hints.categoryHeading, hints.newsTitle)
        : hints.newsTitle ?? hints.articleHeading;

      return { style: style ?? template.styleMap.body, text: stripped };
    }

    return {
      style: isNewsSection
        ? hints.newsBullet ?? hints.articleBullet ?? template.styleMap.dashItem
        : hints.articleBullet ?? template.styleMap.dashItem,
      text: `○ ${stripped}`
    };
  }

  if (isLikelyArticleHeading(text)) {
    return { style: hints.articleHeading ?? template.styleMap.body, text };
  }

  return { style: hints.body ?? hints.articleBullet ?? template.styleMap[block.role], text };
}

function firstReadableStyle(
  hints: HybridBodyStyleHints,
  ...styles: Array<HwpxParagraphStyle | undefined>
): HwpxParagraphStyle | undefined {
  return styles.find((style) => style !== undefined && isReadableStyle(hints, style));
}

function isReadableStyle(hints: HybridBodyStyleHints, style: HwpxParagraphStyle): boolean {
  const height = hints.charHeights.get(style.charPrIDRef);
  return height === undefined || height >= 800;
}

function renderTableRows(
  rows: string[][],
  tableTemplates: TableTemplate[],
  fallbackStyle: HwpxParagraphStyle,
  startIndex: number,
  layoutState: LineLayoutState
): string {
  if (rows.length === 0) {
    return "";
  }

  const tableTemplate = selectTableTemplate(tableTemplates, rows);

  if (tableTemplate === undefined) {
    return rows
      .map((row, rowIndex) =>
        renderParagraphWithStyle(fallbackStyle, row.join("    "), startIndex + rowIndex, "", layoutState)
      )
      .join("");
  }

  const tableTemplateXml = tableTemplate.xml;
  const templateRows = readElements(tableTemplateXml, "hp:tr");

  if (templateRows.length === 0) {
    return rows
      .map((row, rowIndex) =>
        renderParagraphWithStyle(fallbackStyle, row.join("    "), startIndex + rowIndex, "", layoutState)
      )
      .join("");
  }

  const renderedRows = rows
    .map((row, rowIndex) => renderTableRow(templateRows[Math.min(rowIndex, templateRows.length - 1)].xml, row, rowIndex))
    .join("");
  const firstRow = templateRows[0];
  const lastRow = templateRows[templateRows.length - 1];
  const maxColCount = Math.max(...rows.map((row) => row.length));
  const renderedTable = `${tableTemplateXml.slice(0, firstRow.start)}${renderedRows}${tableTemplateXml.slice(lastRow.end)}`;

  return replaceXmlAttributeInOpeningTag(
    replaceXmlAttributeInOpeningTag(renderedTable, "rowCnt", String(rows.length)),
    "colCnt",
    String(maxColCount)
  );
}

function renderTableRow(rowTemplateXml: string, cells: string[], rowIndex: number): string {
  const cellElements = readElements(rowTemplateXml, "hp:tc");

  if (cellElements.length === 0) {
    return rowTemplateXml;
  }

  const targetCellCount = Math.max(cells.length, cellElements.length);
  let renderedRow = "";
  let cursor = 0;

  cellElements.forEach((cell, cellIndex) => {
    renderedRow += rowTemplateXml.slice(cursor, cell.start);
    renderedRow += replaceTableCellText(cell.xml, cells[cellIndex] ?? "");
    cursor = cell.end;
  });

  const tail = rowTemplateXml.slice(cursor);

  for (let cellIndex = cellElements.length; cellIndex < targetCellCount; cellIndex += 1) {
    const sourceCell = cellElements[cellElements.length - 1];
    renderedRow += replaceTableCellText(sourceCell.xml, cells[cellIndex] ?? "");
  }

  renderedRow += tail;

  return renderedRow
    .replace(/\browAddr="[^"]*"/g, `rowAddr="${rowIndex}"`)
    .replace(/\bcolAddr="[^"]*"/g, (_match, offset: number) => {
      const prefix = renderedRow.slice(0, offset);
      const cellIndex = Math.max(0, (prefix.match(/<hp:tc\b/g) ?? []).length - 1);
      return `colAddr="${cellIndex}"`;
    });
}

function replaceTableCellText(cellXml: string, text: string): string {
  let replacementUsed = false;
  const escapedText = escapeXmlText(text);
  const replaced = cellXml.replace(
    /<hp:t\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/hp:t>|<hp:t\b([^>]*)\/>/g,
    (match, normalAttrs: string | undefined, _text: string | undefined, selfClosingAttrs: string | undefined) => {
      const attrs = normalAttrs ?? selfClosingAttrs ?? "";

      if (!replacementUsed) {
        replacementUsed = true;
        return `<hp:t${attrs}>${escapedText}</hp:t>`;
      }

      return `<hp:t${attrs}></hp:t>`;
    }
  );

  return replaced;
}

function splitTableRow(text: string): string[] {
  return text
    .split("\t")
    .map((cell) => cell.trim())
    .filter((cell, index, cells) => cell.length > 0 || index < cells.length - 1);
}

function extractTableTemplates(xml: string): TableTemplate[] {
  return readElements(xml, "hp:tbl")
    .map((table, order) => {
      const rows = readElements(table.xml, "hp:tr");
      const colCount = Math.max(0, ...rows.map((row) => readElements(row.xml, "hp:tc").length));

      return {
        xml: table.xml,
        rowCount: rows.length,
        colCount,
        order,
        text: extractParagraphText(table.xml).trim()
      };
    })
    .filter((table) => table.colCount > 1);
}

function extractStructureTableTemplates(xml: string, globalOrderOffset: number): TableTemplate[] {
  return readElements(xml, "hp:tbl")
    .map((table, order) => {
      const rows = readElements(table.xml, "hp:tr");
      const colCount = Math.max(0, ...rows.map((row) => readElements(row.xml, "hp:tc").length));

      return {
        xml: table.xml,
        rowCount: rows.length,
        colCount,
        order: globalOrderOffset + order,
        text: extractParagraphText(table.xml).trim()
      };
    })
    .filter((table) =>
      table.colCount === 1 &&
      table.rowCount <= 2 &&
      (table.text?.length ?? 0) > 0
    );
}

function selectStructureTableTemplate(
  templates: TableTemplate[],
  assignment: HwpxStyleAssignment
): TableTemplate | undefined {
  if (assignment.structureTable === undefined) {
    return undefined;
  }

  return templates.find((template) => template.order === assignment.structureTable?.order);
}

function renderStructureTable(template: TableTemplate, text: string, tableStyleContext: TableStyleContext): string {
  let replacementUsed = false;
  const escapedText = escapeXmlText(text);

  const xmlWithText = template.xml.replace(
    /<hp:t\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/hp:t>|<hp:t\b([^>]*)\/>/g,
    (_match, normalAttrs: string | undefined, _text: string | undefined, selfClosingAttrs: string | undefined) => {
      const attrs = normalAttrs ?? selfClosingAttrs ?? "";

      if (!replacementUsed) {
        replacementUsed = true;
        return `<hp:t${attrs}>${escapedText}</hp:t>`;
      }

      return `<hp:t${attrs}></hp:t>`;
    }
  );

  return sanitizeGeneratedTableParagraphStyles(xmlWithText, tableStyleContext);
}

function sanitizeGeneratedTableParagraphStyles(tableXml: string, tableStyleContext: TableStyleContext): string {
  return tableXml.replace(/<hp:p\b[^>]*>/g, (paragraphTag) => {
    const paraPrIDRef = readXmlAttribute(paragraphTag, "paraPrIDRef");

    if (paraPrIDRef === null) {
      return paragraphTag;
    }

    const plainParaPrIDRef = ensureGeneratedPlainParaPr(tableStyleContext, paraPrIDRef);

    return plainParaPrIDRef === null
      ? paragraphTag
      : paragraphTag.replace(/\bparaPrIDRef="[^"]*"/, `paraPrIDRef="${plainParaPrIDRef}"`);
  });
}

function shouldStartTableOnNewPage(layoutState: LineLayoutState, tableXml: string): boolean {
  const tentativeBottom = layoutState.currentVertPos + readTableLayoutReserveHeight(layoutState, tableXml);

  return layoutState.currentVertPos > 0 &&
    (
      tentativeBottom > layoutState.pageContentHeight ||
      tentativeBottom > layoutState.pageContentHeight - pageBottomHeadroomReserve
    );
}

function resetLayoutStateToNewPage(layoutState: LineLayoutState): void {
  layoutState.currentVertPos = 0;
  layoutState.lastParagraphPageBreak = false;
}

function reserveTableLayoutSpace(layoutState: LineLayoutState, tableXml: string): void {
  layoutState.currentVertPos += readTableLayoutReserveHeight(layoutState, tableXml);
  layoutState.lastParagraphPageBreak = false;
}

function readTableLayoutReserveHeight(layoutState: LineLayoutState, tableXml: string): number {
  const height = readTableHeight(tableXml) ??
    layoutState.defaultMetrics.textHeight + layoutState.defaultMetrics.spacing;
  const lineStep = layoutState.defaultMetrics.textHeight + layoutState.defaultMetrics.spacing;

  return Math.max(height, lineStep) + Math.floor(lineStep / 2);
}

function readTableHeight(tableXml: string): number | null {
  const sizeAttrs = tableXml.match(/<hp:sz\b([^>]*)\/>/)?.[1] ?? "";
  const tableHeight = readOptionalNumberAttribute(sizeAttrs, "height");

  if (tableHeight !== undefined) {
    return tableHeight;
  }

  const cellHeights = Array.from(tableXml.matchAll(/<hp:cellSz\b([^>]*)\/>/g), (match) =>
    readOptionalNumberAttribute(match[1] ?? "", "height") ?? 0
  );
  const maxCellHeight = Math.max(0, ...cellHeights);

  return maxCellHeight > 0 ? maxCellHeight : null;
}

function selectTableTemplate(tableTemplates: TableTemplate[], rows: string[][]): TableTemplate | undefined {
  if (tableTemplates.length === 0) {
    return undefined;
  }

  const targetColCount = Math.max(0, ...rows.map((row) => row.length));
  const targetRowCount = rows.length;

  return [...tableTemplates].sort((left, right) => {
    const leftScore = scoreTableTemplate(left, targetColCount, targetRowCount);
    const rightScore = scoreTableTemplate(right, targetColCount, targetRowCount);

    return leftScore - rightScore || left.order - right.order;
  })[0];
}

function scoreTableTemplate(template: TableTemplate, targetColCount: number, targetRowCount: number): number {
  return Math.abs(template.colCount - targetColCount) * 100 + Math.abs(template.rowCount - targetRowCount) * 3;
}

function readElements(xml: string, tagName: string): TopLevelBlock[] {
  const elements: TopLevelBlock[] = [];
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

    elements.push({ start, end, xml: xml.slice(start, end) });
    cursor = end;
  }

  return elements;
}

function renderTitleRegion(
  titleXml: string,
  replacements: string[],
  tableStyleContext: TableStyleContext
): { xml: string; consumedSourceBlocks: number } {
  let replacementIndex = 0;
  const replacedXml = titleXml.replace(
    /<hp:t\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/hp:t>/g,
    (match, attrs: string, text: string) => {
    if (stripXmlText(text).trim().length === 0) {
      return match;
    }

    const replacement = replacements[replacementIndex] ?? "";
    replacementIndex += 1;

    return `<hp:t${attrs}>${escapeXmlText(replacement)}</hp:t>`;
    }
  );

  return {
    xml: remapTitleRegionTableStyles(replacedXml, tableStyleContext),
    consumedSourceBlocks: Math.max(0, replacementIndex - 1)
  };
}

function remapTitleRegionTableStyles(titleXml: string, context: TableStyleContext): string {
  let tableIndex = 0;

  return titleXml.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, (tableXml) => {
    const tableGroup: TableStyleGroup = tableIndex === 0 ? "title" : "body";
    tableIndex += 1;
    return remapTableRunStyles(tableXml, tableGroup, context);
  });
}

function buildTemplateReplacementTexts(blocks: DocumentBlock[]): string[] {
  return buildTemplateReplacementBlocks(blocks).map((block) => adaptBlockTextForTemplate(block));
}

function buildTemplateReplacementBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const textBlocks = blocks.filter((block) => block.role !== "image");

  if (textBlocks.length === 0) {
    return [];
  }

  const [firstBlock, ...remainingBlocks] = textBlocks;
  const splitTitle = splitBriefTitle(firstBlock.text);
  const sourceBlocks =
    splitTitle === null
      ? textBlocks
      : [
          { ...firstBlock, text: splitTitle.title },
          { ...firstBlock, role: "body" as const, text: splitTitle.issue },
          ...remainingBlocks
        ];

  return sourceBlocks;
}

function adaptBlockTextForTemplate(block: DocumentBlock): string {
  const text = block.text.trim();

  if (block.role === "dashItem") {
    return text.replace(/^\s*[-–]\s*/u, "○ ");
  }

  return text;
}

function adaptBlockTextForTemplateSlot(
  replacement: ReplacementBlock,
  paragraphBody: string
): string {
  const block = replacement.block;
  const text = block.text.trim();

  if (block.role !== "dashItem") {
    return text;
  }

  const stripped = stripDashMarker(text);
  const sampleText = extractParagraphText(paragraphBody).trim();
  const shouldBecomeNewsTitle = isInBriefNewsSection(replacement.sourceBlocks, replacement.sourceIndex) &&
    isLikelyGeneratedNewsTitle(stripped, replacement.sourceBlocks, replacement.sourceIndex);

  if (shouldBecomeNewsTitle && !sampleText.startsWith("○")) {
    return stripped;
  }

  if (sampleText.startsWith("○")) {
    return `○ ${stripped}`;
  }

  if (sampleText.startsWith("-") || sampleText.startsWith("–")) {
    return `- ${stripped}`;
  }

  return `○ ${stripped}`;
}

function splitBriefTitle(text: string): { title: string; issue: string } | null {
  const match = text.trim().match(/^(.*?\bBRIEF)\s+(통권\s+제?\d+호\([^)]+\))$/u);

  if (match === null) {
    return null;
  }

  return { title: match[1] ?? "", issue: match[2] ?? "" };
}

interface TitleRegion {
  before: string;
  xml: string;
  after: string;
  bodyTemplateXml: string;
}

function extractLeadingTitleRegion(sectionXml: string): TitleRegion | null {
  const sectionOpenMatch = sectionXml.match(/<hs:sec\b[^>]*>/);

  if (sectionOpenMatch?.index === undefined) {
    return null;
  }

  const contentStart = sectionOpenMatch.index + sectionOpenMatch[0].length;
  const contentEnd = sectionXml.lastIndexOf("</hs:sec>");

  if (contentEnd < contentStart) {
    return null;
  }

  const contentXml = sectionXml.slice(contentStart, contentEnd);
  const blocks = readTopLevelBlocks(contentXml);
  const firstTableBlockIndex = blocks.findIndex((block) => block.xml.includes("<hp:tbl"));

  if (firstTableBlockIndex < 0) {
    return null;
  }

  let lastTitleBlockIndex = firstTableBlockIndex;

  for (let index = firstTableBlockIndex + 1; index < blocks.length; index += 1) {
    if (!blocks[index].xml.includes("<hp:tbl")) {
      break;
    }

    lastTitleBlockIndex = index;
  }

  const start = blocks[0].start;
  const end = blocks[lastTitleBlockIndex].end;

  return {
    before: sectionXml.slice(0, contentStart) + contentXml.slice(0, start),
    xml: contentXml.slice(start, end),
    after: sectionXml.slice(contentEnd),
    bodyTemplateXml: contentXml.slice(end)
  };
}

function extractParagraphText(paragraphBody: string): string {
  return Array.from(
    paragraphBody.matchAll(/<hp:t\b(?![^>]*\/>)[^>]*>([\s\S]*?)<\/hp:t>/g),
    (match) => stripXmlText(match[1] ?? "")
  ).join("");
}

function readFirstRunCharPr(paragraphBody: string): string | null {
  const runAttrs = paragraphBody.match(/<hp:run\b([^>]*)>/)?.[1];
  return runAttrs === undefined ? null : readXmlAttribute(runAttrs, "charPrIDRef");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isTemplateInstructionText(text: string): boolean {
  return text.startsWith("<") && text.endsWith(">");
}

function isLikelyArticleHeading(text: string): boolean {
  if (text.startsWith("○") || text.startsWith("-") || text.startsWith("–")) {
    return false;
  }

  return text.length > 0 && text.length <= 40;
}

function isBriefPageHeading(text: string): boolean {
  return text === "탄소중립 정보공유";
}

function isBriefCategoryHeading(text: string): boolean {
  return text === "전국 소식" || text === "울산 소식" || text === "센터 소식";
}

function isLikelyNewsTitle(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= 80 &&
    !text.startsWith("○") &&
    !text.startsWith("http") &&
    !text.includes("자세히")
  );
}

function isLikelyGeneratedNewsTitle(text: string, blocks: DocumentBlock[], index: number): boolean {
  const previousMeaningfulBlock = findPreviousMeaningfulBlock(blocks, index);
  const nextMeaningfulBlock = findNextMeaningfulBlock(blocks, index);

  if (previousMeaningfulBlock !== undefined && isBriefCategoryHeading(previousMeaningfulBlock.text.trim())) {
    return true;
  }

  if (text.length > 60 || text.includes(":") || text.endsWith("함") || text.endsWith("임")) {
    return false;
  }

  return nextMeaningfulBlock?.role === "dashItem";
}

function isInBriefNewsSection(blocks: DocumentBlock[], index: number): boolean {
  return findCurrentBriefCategory(blocks, index) !== undefined;
}

function findCurrentBriefCategory(blocks: DocumentBlock[], index: number): string | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const text = blocks[current]?.text.trim() ?? "";

    if (isBriefCategoryHeading(text) || isBriefPageHeading(text)) {
      return text;
    }

    if (blocks[current]?.role === "section") {
      return undefined;
    }
  }

  return undefined;
}

function findPreviousMeaningfulBlock(blocks: DocumentBlock[], index: number): DocumentBlock | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const block = blocks[current];

    if (block !== undefined && block.text.trim().length > 0) {
      return block;
    }
  }

  return undefined;
}

function findNextMeaningfulBlock(blocks: DocumentBlock[], index: number): DocumentBlock | undefined {
  for (let current = index + 1; current < blocks.length; current += 1) {
    const block = blocks[current];

    if (block !== undefined && block.text.trim().length > 0) {
      return block;
    }
  }

  return undefined;
}

function stripDashMarker(text: string): string {
  return text.replace(/^\s*[-–]\s*/u, "").trim();
}

function removeLineSegArrays(sectionXml: string): string {
  return sectionXml.replace(/<hp:linesegarray\b[\s\S]*?<\/hp:linesegarray>/g, "");
}

interface TopLevelBlock {
  start: number;
  end: number;
  xml: string;
}

interface XmlElementRange {
  start: number;
  end: number;
  xml: string;
  body: string;
  attrs: string;
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

function readAllXmlElements(xml: string, tagName: string): XmlElementRange[] {
  const elements: XmlElementRange[] = [];
  const stack: Array<{ start: number; attrs: string }> = [];
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)>|</${escapeRegExp(tagName)}>`, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    if (match[0].startsWith("</")) {
      const opening = stack.pop();

      if (opening !== undefined) {
        const openingEnd = xml.indexOf(">", opening.start) + 1;
        const end = pattern.lastIndex;

        elements.push({
          start: opening.start,
          end,
          xml: xml.slice(opening.start, end),
          body: xml.slice(openingEnd, match.index),
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
        body: "",
        attrs: match[1] ?? ""
      });
      continue;
    }

    stack.push({ start: match.index, attrs: match[1] ?? "" });
  }

  return elements.sort((left, right) => left.start - right.start);
}

function findElementEnd(xml: string, start: number, tagName: string): number | null {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b|</${escapeRegExp(tagName)}>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    if (match[0].startsWith(`</`)) {
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

type TableStyleGroup = "title" | "body";

interface TableRange {
  start: number;
  end: number;
  group: TableStyleGroup;
}

interface TableStyleContext {
  headerXml: string;
  nextCharPrId: number;
  nextParaPrId: number;
  clonedCharPrIds: Map<string, string>;
  clonedParaPrIds: Map<string, string>;
  tableStyles?: TableStyleOverrides;
}

function createTableStyleContext(headerXml: string, tableStyles: TableStyleOverrides | undefined): TableStyleContext {
  return {
    headerXml,
    nextCharPrId: readNextCharPrId(headerXml),
    nextParaPrId: readNextParaPrId(headerXml),
    clonedCharPrIds: new Map(),
    clonedParaPrIds: new Map(),
    tableStyles
  };
}

function ensureGeneratedBulletParaPr(
  context: TableStyleContext,
  sourceParaPrId: string,
  leftIndent: number
): string | null {
  const key = `bullet:${sourceParaPrId}:${leftIndent}`;
  const existing = context.clonedParaPrIds.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const sourceParaPr = findParaPrXml(context.headerXml, sourceParaPrId);

  if (sourceParaPr === null) {
    return null;
  }

  const newParaPrId = String(context.nextParaPrId);
  context.nextParaPrId += 1;
  const clonedParaPr = applyGeneratedBulletParaPr(sourceParaPr, newParaPrId, leftIndent);
  context.headerXml = insertParaPr(context.headerXml, clonedParaPr);
  context.clonedParaPrIds.set(key, newParaPrId);

  return newParaPrId;
}

function ensureGeneratedLeftAlignParaPr(
  context: TableStyleContext,
  sourceParaPrId: string
): string | null {
  const sourceParaPr = findParaPrXml(context.headerXml, sourceParaPrId);

  if (sourceParaPr === null || readParaPrHorizontalAlign(sourceParaPr) !== "JUSTIFY") {
    return null;
  }

  const key = `align-left:${sourceParaPrId}`;
  const existing = context.clonedParaPrIds.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const newParaPrId = String(context.nextParaPrId);
  context.nextParaPrId += 1;
  const clonedParaPr = applyGeneratedLeftAlignParaPr(sourceParaPr, newParaPrId);
  context.headerXml = insertParaPr(context.headerXml, clonedParaPr);
  context.clonedParaPrIds.set(key, newParaPrId);

  return newParaPrId;
}

function ensureGeneratedPlainParaPr(
  context: TableStyleContext,
  sourceParaPrId: string
): string | null {
  const sourceParaPr = findParaPrXml(context.headerXml, sourceParaPrId);

  if (sourceParaPr === null || !hasAutomaticParagraphHeading(sourceParaPr)) {
    return null;
  }

  const key = `plain-heading:${sourceParaPrId}`;
  const existing = context.clonedParaPrIds.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const newParaPrId = String(context.nextParaPrId);
  context.nextParaPrId += 1;
  const clonedParaPr = forceNoAutomaticParagraphHeading(sourceParaPr.replace(/\bid="[^"]*"/, `id="${newParaPrId}"`));
  context.headerXml = insertParaPr(context.headerXml, clonedParaPr);
  context.clonedParaPrIds.set(key, newParaPrId);

  return newParaPrId;
}

function applyGeneratedBulletParaPr(sourceParaPr: string, newParaPrId: string, leftIndent: number): string {
  return forceNoAutomaticParagraphHeading(forceLeftHorizontalAlign(replaceMarginValue(
    replaceMarginValue(sourceParaPr.replace(/\bid="[^"]*"/, `id="${newParaPrId}"`), "intent", 0),
    "left",
    leftIndent
  )));
}

function applyGeneratedLeftAlignParaPr(sourceParaPr: string, newParaPrId: string): string {
  return forceNoAutomaticParagraphHeading(forceLeftHorizontalAlign(sourceParaPr.replace(/\bid="[^"]*"/, `id="${newParaPrId}"`)));
}

function forceLeftHorizontalAlign(paraPr: string): string {
  if (paraPr.includes("<hh:align")) {
    return paraPr.replace(/<hh:align\b[^>]*\bhorizontal="[^"]*"/, (alignTag) =>
      alignTag.replace(/\bhorizontal="[^"]*"/, 'horizontal="LEFT"')
    );
  }

  return paraPr.replace(/(<hh:paraPr\b[^>]*>)/, '$1<hh:align horizontal="LEFT" vertical="BASELINE"/>');
}

function hasAutomaticParagraphHeading(paraPr: string): boolean {
  const headingType = readParaPrHeadingType(paraPr);

  return headingType !== null && headingType !== "NONE";
}

function forceNoAutomaticParagraphHeading(paraPr: string): string {
  const plainHeading = '<hh:heading type="NONE" idRef="0" level="0"/>';

  if (paraPr.includes("<hh:heading")) {
    return paraPr.replace(/<hh:heading\b[^>]*\/>/, plainHeading);
  }

  return paraPr.replace(/(<hh:align\b[^>]*\/>)/, `$1${plainHeading}`);
}

function readParaPrHorizontalAlign(paraPr: string): string | null {
  return paraPr.match(/<hh:align\b[^>]*\bhorizontal="([^"]+)"/)?.[1] ?? null;
}

function readParaPrHeadingType(paraPr: string): string | null {
  return paraPr.match(/<hh:heading\b[^>]*\btype="([^"]+)"/)?.[1] ?? null;
}

function replaceMarginValue(paraPr: string, name: string, value: number): string {
  const pattern = new RegExp(`(<hc:${escapeRegExp(name)}\\b[^>]*\\bvalue=")-?\\d+(")`, "g");

  return paraPr.replace(pattern, `$1${value}$2`);
}

function insertParaPr(headerXml: string, paraPr: string): string {
  const updatedHeaderXml = headerXml.replace(/<hh:paraProperties\b([^>]*)>/, (match, attrs: string) => {
    const itemCount = Number.parseInt(readXmlAttribute(attrs, "itemCnt") ?? "0", 10);
    return match.replace(/\bitemCnt="[^"]*"/, `itemCnt="${itemCount + 1}"`);
  });

  return updatedHeaderXml.replace("</hh:paraProperties>", `${paraPr}</hh:paraProperties>`);
}

function findParaPrXml(headerXml: string, paraPrId: string): string | null {
  const escapedId = escapeRegExp(paraPrId);
  const match = headerXml.match(new RegExp(`<hh:paraPr\\b[^>]*\\bid="${escapedId}"[\\s\\S]*?</hh:paraPr>`));

  return match?.[0] ?? null;
}

function remapTableRunStyles(
  xml: string,
  tableGroup: TableStyleGroup,
  context: TableStyleContext
): string {
  const style = context.tableStyles?.[tableGroup];

  if (style === undefined || isEmptyStyleOverride(style)) {
    return xml;
  }

  return xml.replace(/<hp:run\b([^>]*)>/g, (match, attrs: string) => {
    const sourceCharPrId = readXmlAttribute(attrs, "charPrIDRef");

    if (sourceCharPrId === null) {
      return match;
    }

    const targetCharPrId = ensureClonedCharPr(context, sourceCharPrId, tableGroup, style);

    if (targetCharPrId === null) {
      return match;
    }

    return `<hp:run${replaceXmlAttribute(attrs, "charPrIDRef", targetCharPrId)}>`;
  });
}

function ensureClonedCharPr(
  context: TableStyleContext,
  sourceCharPrId: string,
  tableGroup: TableStyleGroup,
  style: TableTextStyleOverride
): string | null {
  const key = `${tableGroup}:${sourceCharPrId}:${JSON.stringify(style)}`;
  const existing = context.clonedCharPrIds.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const sourceCharPr = findCharPrXml(context.headerXml, sourceCharPrId);

  if (sourceCharPr === null) {
    return null;
  }

  const newCharPrId = String(context.nextCharPrId);
  context.nextCharPrId += 1;
  const clonedCharPr = applyTextStyleToCharPr(sourceCharPr, newCharPrId, style, context.headerXml);
  context.headerXml = insertCharPr(context.headerXml, clonedCharPr);
  context.clonedCharPrIds.set(key, newCharPrId);

  return newCharPrId;
}

function applyTextStyleToCharPr(
  sourceCharPr: string,
  newCharPrId: string,
  style: TableTextStyleOverride,
  headerXml: string
): string {
  let charPr = sourceCharPr.replace(/\bid="[^"]*"/, `id="${newCharPrId}"`);

  if (style.fontSizePt !== undefined) {
    charPr = replaceXmlAttribute(charPr, "height", String(Math.round(style.fontSizePt * 100)));
  }

  if (style.charSpacing !== undefined) {
    const charSpacing = style.charSpacing;
    charPr = charPr.replace(/<hh:spacing\b[^>]*\/>/, (spacingTag) =>
      replaceRepeatedXmlAttributes(spacingTag, String(Math.round(charSpacing)))
    );
  }

  if (style.fontFamily !== undefined && style.fontFamily.length > 0) {
    charPr = updateFontRef(charPr, headerXml, style.fontFamily);
  }

  if (style.bold === true && !charPr.includes("<hh:bold")) {
    charPr = charPr.includes("<hh:underline")
      ? charPr.replace("<hh:underline", "<hh:bold/><hh:underline")
      : charPr.replace("</hh:charPr>", "<hh:bold/></hh:charPr>");
  }

  if (style.bold === false) {
    charPr = charPr.replace(/<hh:bold\b[^>]*\/>/g, "");
  }

  return charPr;
}

function updateFontRef(charPr: string, headerXml: string, fontFamily: string): string {
  const fontRefs = readFontRefsByFamily(headerXml, fontFamily);

  if (fontRefs.size === 0) {
    return charPr;
  }

  return charPr.replace(/<hh:fontRef\b[^>]*\/>/, (fontRef) => {
    let updatedFontRef = fontRef;

    for (const [attribute, value] of fontRefs.entries()) {
      updatedFontRef = replaceXmlAttribute(updatedFontRef, attribute, value);
    }

    return updatedFontRef;
  });
}

function readFontRefsByFamily(headerXml: string, fontFamily: string): Map<string, string> {
  const refs = new Map<string, string>();
  const languageToAttribute = new Map([
    ["HANGUL", "hangul"],
    ["LATIN", "latin"],
    ["HANJA", "hanja"],
    ["JAPANESE", "japanese"],
    ["OTHER", "other"],
    ["SYMBOL", "symbol"],
    ["USER", "user"]
  ]);

  for (const fontface of headerXml.matchAll(/<hh:fontface\b([^>]*)>([\s\S]*?)<\/hh:fontface>/g)) {
    const language = readXmlAttribute(fontface[1] ?? "", "lang");
    const attribute = language === null ? undefined : languageToAttribute.get(language);

    if (attribute === undefined) {
      continue;
    }

    const font = Array.from((fontface[2] ?? "").matchAll(/<hh:font\b([^>]*)/g)).find(
      (candidate) => readXmlAttribute(candidate[1] ?? "", "face") === fontFamily
    );
    const fontId = font === undefined ? null : readXmlAttribute(font[1] ?? "", "id");

    if (fontId !== null) {
      refs.set(attribute, fontId);
    }
  }

  return refs;
}

function insertCharPr(headerXml: string, charPr: string): string {
  const updatedHeaderXml = headerXml.replace(/<hh:charProperties\b([^>]*)>/, (match, attrs: string) => {
    const itemCount = Number.parseInt(readXmlAttribute(attrs, "itemCnt") ?? "0", 10);
    return match.replace(/\bitemCnt="[^"]*"/, `itemCnt="${itemCount + 1}"`);
  });

  return updatedHeaderXml.replace("</hh:charProperties>", `${charPr}</hh:charProperties>`);
}

function findCharPrXml(headerXml: string, charPrId: string): string | null {
  const escapedId = escapeRegExp(charPrId);
  const match = headerXml.match(new RegExp(`<hh:charPr\\b[^>]*\\bid="${escapedId}"[\\s\\S]*?</hh:charPr>`));

  return match?.[0] ?? null;
}

function readNextCharPrId(headerXml: string): number {
  const ids = Array.from(headerXml.matchAll(/<hh:charPr\b[^>]*\bid="(\d+)"/g), (match) =>
    Number.parseInt(match[1] ?? "0", 10)
  );

  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

function readNextParaPrId(headerXml: string): number {
  const ids = Array.from(headerXml.matchAll(/<hh:paraPr\b[^>]*\bid="(\d+)"/g), (match) =>
    Number.parseInt(match[1] ?? "0", 10)
  );

  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

function readXmlAttribute(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function stripXmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function replaceXmlAttribute(xml: string, name: string, value: string): string {
  const pattern = new RegExp(`\\b${name}="[^"]*"`);

  if (pattern.test(xml)) {
    return xml.replace(pattern, `${name}="${escapeXmlText(value)}"`);
  }

  return xml.replace(/\/?>$/, (ending) => ` ${name}="${escapeXmlText(value)}"${ending}`);
}

function replaceXmlAttributeInOpeningTag(xml: string, name: string, value: string): string {
  const openingTagEnd = xml.indexOf(">");

  if (openingTagEnd < 0) {
    return xml;
  }

  const openingTag = xml.slice(0, openingTagEnd + 1);
  const updatedOpeningTag = replaceXmlAttribute(openingTag, name, value);

  return `${updatedOpeningTag}${xml.slice(openingTagEnd + 1)}`;
}

function replaceRepeatedXmlAttributes(xml: string, value: string): string {
  return xml.replace(
    /\b(hangul|latin|hanja|japanese|other|symbol|user)="[^"]*"/g,
    (_match, name: string) => `${name}="${escapeXmlText(value)}"`
  );
}

function isEmptyStyleOverride(style: TableTextStyleOverride): boolean {
  return (
    style.fontFamily === undefined &&
    style.fontSizePt === undefined &&
    style.charSpacing === undefined &&
    style.bold === undefined
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
