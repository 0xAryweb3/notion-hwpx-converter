import { strFromU8, unzipSync } from "fflate";
import { normalizeLinesToBlocks } from "../document/detect";
import type { DocumentBlock } from "../document/types";
import { cleanNotionLine } from "../notion-text/clean";

export interface NotionSource {
  name: string;
  data: ArrayBuffer | Uint8Array;
}

type ParsedSourceItem =
  | { kind: "text"; text: string }
  | { kind: "image"; altText: string; src: string; bytes?: Uint8Array; mimeType: string };

const markdownExtensions = [".md", ".markdown"];
const htmlExtensions = [".html", ".htm"];
const zipExtensions = [".zip"];
const markdownImagePattern = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/u;

export function parseNotionSource(source: NotionSource): DocumentBlock[] {
  const name = source.name.toLowerCase();
  const bytes = toUint8Array(source.data);

  if (hasExtension(name, markdownExtensions)) {
    return parseMarkdown(strFromU8(bytes));
  }

  if (hasExtension(name, htmlExtensions)) {
    return parseHtml(strFromU8(bytes));
  }

  if (hasExtension(name, zipExtensions)) {
    const { entryName, content, entries } = selectZipEntry(bytes);
    return hasExtension(entryName.toLowerCase(), markdownExtensions)
      ? parseMarkdown(strFromU8(content), entries, entryName)
      : parseHtml(strFromU8(content), entries, entryName);
  }

  throw new Error(`Unsupported Notion source: ${source.name}`);
}

function parseMarkdown(markdown: string, assetEntries = new Map<string, Uint8Array>(), baseEntryName = ""): DocumentBlock[] {
  const items = markdown
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line): ParsedSourceItem => {
      const image = line.match(markdownImagePattern);

      if (image !== null) {
        const altText = cleanNotionLine(image[1] ?? "");
        const src = normalizeImageSource(image[2] ?? "");

        return {
          kind: "image",
          altText,
          src,
          bytes: resolveAssetBytes(src, assetEntries, baseEntryName),
          mimeType: inferMimeType(src)
        };
      }

      return { kind: "text", text: cleanNotionLine(line) };
    });

  return itemsToBlocks(items);
}

function parseHtml(html: string, assetEntries = new Map<string, Uint8Array>(), baseEntryName = ""): DocumentBlock[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const root = document.body;
  const items = collectHtmlItems(root, assetEntries, baseEntryName);

  return itemsToBlocks(items);
}

function collectHtmlItems(
  element: Element,
  assetEntries: Map<string, Uint8Array>,
  baseEntryName: string
): ParsedSourceItem[] {
  const tag = element.tagName.toUpperCase();

  if (tag === "SCRIPT" || tag === "STYLE") {
    return [];
  }

  if (tag === "IMG") {
    const src = normalizeImageSource(element.getAttribute("src") ?? "");

    if (src.length === 0) {
      return [];
    }

    const altText = collapseWhitespace(element.getAttribute("alt") ?? "");

    return [{
      kind: "image",
      altText,
      src,
      bytes: resolveAssetBytes(src, assetEntries, baseEntryName),
      mimeType: inferMimeType(src)
    }];
  }

  if (tag === "TR") {
    const cells = Array.from(element.children)
      .filter((child) => child.tagName.toUpperCase() === "TH" || child.tagName.toUpperCase() === "TD")
      .map((child) => collapseWhitespace(child.textContent ?? ""))
      .filter((text) => text.length > 0);

    return cells.length === 0 ? [] : [{ kind: "text", text: cells.join("\t") }];
  }

  if (isBlockTextElement(tag)) {
    if (element.querySelector("img") !== null) {
      return Array.from(element.children).flatMap((child) => collectHtmlItems(child, assetEntries, baseEntryName));
    }

    const text = collapseWhitespace(element.textContent ?? "");
    if (text.length === 0) {
      return [];
    }

    return [{ kind: "text", text: tag === "LI" && !startsWithListMarker(text) ? `- ${text}` : text }];
  }

  return Array.from(element.children).flatMap((child) => collectHtmlItems(child, assetEntries, baseEntryName));
}

function itemsToBlocks(items: ParsedSourceItem[]): DocumentBlock[] {
  const textItems = items.filter((item): item is { kind: "text"; text: string } =>
    item.kind === "text" && item.text.trim().length > 0 && !isMarkdownTableDivider(item.text)
  );
  const textBlocks = normalizeLinesToBlocks(textItems.map((item) => item.text));
  const blocks: DocumentBlock[] = [];
  let textBlockIndex = 0;
  let assetIndex = 1;

  for (const item of items) {
    if (item.kind === "text") {
      if (item.text.trim().length === 0 || isMarkdownTableDivider(item.text)) {
        continue;
      }

      const textBlock = textBlocks[textBlockIndex];
      textBlockIndex += 1;

      if (textBlock !== undefined) {
        blocks.push({ ...textBlock, id: `block-${blocks.length + 1}` });
      }

      continue;
    }

    blocks.push({
      id: `block-${blocks.length + 1}`,
      role: "image",
      text: item.altText,
      asset: {
        id: `asset-${assetIndex}`,
        kind: "image",
        fileName: fileNameFromSource(item.src),
        mimeType: item.mimeType,
        bytes: item.bytes,
        url: item.src,
        altText: item.altText
      }
    });
    assetIndex += 1;
  }

  return blocks;
}

function selectZipEntry(bytes: Uint8Array): {
  entryName: string;
  content: Uint8Array;
  entries: Map<string, Uint8Array>;
} {
  const entries = Object.entries(unzipSync(bytes)).filter(([entryName]) => !isIgnoredZipEntry(entryName));
  const entryMap = new Map(entries);
  const markdown = entries.find(([entryName]) => hasExtension(entryName.toLowerCase(), markdownExtensions));

  if (markdown !== undefined) {
    return { entryName: markdown[0], content: markdown[1], entries: entryMap };
  }

  const html = entries.find(([entryName]) => hasExtension(entryName.toLowerCase(), htmlExtensions));

  if (html !== undefined) {
    return { entryName: html[0], content: html[1], entries: entryMap };
  }

  const entryNames = entries.map(([entryName]) => entryName).join(", ");
  throw new Error(`Notion export ZIP does not contain Markdown or HTML: ${entryNames}; bytes=${bytes.length}`);
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(data);
}

function hasExtension(name: string, extensions: string[]): boolean {
  return extensions.some((extension) => name.endsWith(extension));
}

function isIgnoredZipEntry(entryName: string): boolean {
  return entryName.endsWith("/") || entryName.startsWith("__MACOSX/");
}

function isBlockTextElement(tag: string): boolean {
  return ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI"].includes(tag);
}

function startsWithListMarker(text: string): boolean {
  return /^\s*(?:[-–]|\d+\.|[가-힣]\.)\s+/u.test(text);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isMarkdownTableDivider(text: string): boolean {
  if (!/^\s*\|.*\|\s*$/u.test(text)) {
    return false;
  }

  return text
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

function normalizeImageSource(src: string): string {
  return src.trim().replace(/^<|>$/gu, "");
}

function resolveAssetBytes(src: string, entries: Map<string, Uint8Array>, baseEntryName: string): Uint8Array | undefined {
  const sourcePath = stripUrlDecorations(src);
  const candidates = [
    sourcePath,
    decodeURIComponentSafe(sourcePath),
    joinZipPath(dirname(baseEntryName), sourcePath),
    joinZipPath(dirname(baseEntryName), decodeURIComponentSafe(sourcePath))
  ].filter((candidate, index, candidates) => candidate.length > 0 && candidates.indexOf(candidate) === index);

  for (const candidate of candidates) {
    const bytes = entries.get(candidate);

    if (bytes !== undefined) {
      return bytes;
    }
  }

  return undefined;
}

function stripUrlDecorations(src: string): string {
  return src.split("#")[0]?.split("?")[0] ?? "";
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function joinZipPath(base: string, relativePath: string): string {
  if (relativePath.startsWith("/") || /^[a-z]+:/iu.test(relativePath)) {
    return relativePath.replace(/^\//u, "");
  }

  return base.length === 0 ? relativePath : `${base}/${relativePath}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileNameFromSource(src: string): string {
  const cleanSrc = stripUrlDecorations(src);
  const name = decodeURIComponentSafe(cleanSrc.split("/").filter(Boolean).pop() ?? "image");

  return name.length === 0 ? "image" : name;
}

function inferMimeType(src: string): string {
  const extension = fileNameFromSource(src).split(".").pop()?.toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "png":
    default:
      return "image/png";
  }
}
