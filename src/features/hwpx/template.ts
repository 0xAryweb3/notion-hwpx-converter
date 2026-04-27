import { strFromU8, unzipSync } from "fflate";
import { normalizeLinesToBlocks } from "../document/detect";
import type { DocumentBlockRole } from "../document/types";

export interface HwpxParagraphStyle {
  paraPrIDRef: string;
  charPrIDRef: string;
  styleIDRef: string;
}

export type HwpxStyleMap = Record<DocumentBlockRole, HwpxParagraphStyle>;

export interface HwpxTemplate {
  files: Record<string, Uint8Array>;
  sectionControlsXml: string;
  styleMap: HwpxStyleMap;
}

const fallbackStyleMap: HwpxStyleMap = {
  title: { paraPrIDRef: "58", charPrIDRef: "63", styleIDRef: "1" },
  noticeNumber: { paraPrIDRef: "38", charPrIDRef: "116", styleIDRef: "1" },
  body: { paraPrIDRef: "0", charPrIDRef: "29", styleIDRef: "0" },
  section: { paraPrIDRef: "53", charPrIDRef: "39", styleIDRef: "0" },
  koreanItem: { paraPrIDRef: "55", charPrIDRef: "57", styleIDRef: "19" },
  dashItem: { paraPrIDRef: "64", charPrIDRef: "9", styleIDRef: "0" },
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

  return {
    files,
    sectionControlsXml: extractSectionControls(sectionXml),
    styleMap: inferStyleMap(sectionXml)
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

  return inferred;
}

function extractSectionControls(sectionXml: string): string {
  const secPr = sectionXml.match(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/)?.[0] ?? "";
  const colPr = sectionXml.match(/<hp:ctrl>\s*<hp:colPr\b[\s\S]*?<\/hp:ctrl>/)?.[0] ?? "";

  return `${secPr}${colPr}`;
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
