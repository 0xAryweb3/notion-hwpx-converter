import { strFromU8, unzipSync } from "fflate";
import { normalizeLinesToBlocks } from "../document/detect";
import type { DocumentBlock } from "../document/types";

export interface NotionSource {
  name: string;
  data: ArrayBuffer | Uint8Array;
}

const markdownExtensions = [".md", ".markdown"];
const htmlExtensions = [".html", ".htm"];
const zipExtensions = [".zip"];

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
    const { entryName, content } = selectZipEntry(bytes);
    return hasExtension(entryName.toLowerCase(), markdownExtensions)
      ? parseMarkdown(strFromU8(content))
      : parseHtml(strFromU8(content));
  }

  throw new Error(`Unsupported Notion source: ${source.name}`);
}

function parseMarkdown(markdown: string): DocumentBlock[] {
  const lines = markdown
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+/, ""));

  return normalizeLinesToBlocks(lines);
}

function parseHtml(html: string): DocumentBlock[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const root = document.body;
  const lines = collectHtmlLines(root);

  return normalizeLinesToBlocks(lines);
}

function collectHtmlLines(element: Element): string[] {
  const tag = element.tagName.toUpperCase();

  if (tag === "SCRIPT" || tag === "STYLE") {
    return [];
  }

  if (isBlockTextElement(tag)) {
    const text = collapseWhitespace(element.textContent ?? "");
    if (text.length === 0) {
      return [];
    }

    return [tag === "LI" && !startsWithListMarker(text) ? `- ${text}` : text];
  }

  return Array.from(element.children).flatMap((child) => collectHtmlLines(child));
}

function selectZipEntry(bytes: Uint8Array): { entryName: string; content: Uint8Array } {
  const entries = Object.entries(unzipSync(bytes)).filter(([entryName]) => !isIgnoredZipEntry(entryName));
  const markdown = entries.find(([entryName]) => hasExtension(entryName.toLowerCase(), markdownExtensions));

  if (markdown !== undefined) {
    return { entryName: markdown[0], content: markdown[1] };
  }

  const html = entries.find(([entryName]) => hasExtension(entryName.toLowerCase(), htmlExtensions));

  if (html !== undefined) {
    return { entryName: html[0], content: html[1] };
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
