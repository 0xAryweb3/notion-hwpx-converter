import { strToU8, zipSync } from "fflate";
import type { DocumentBlock } from "../document/types";
import type { HwpxParagraphStyle, HwpxTemplate } from "./template";
import { escapeXmlText } from "./xml";

const sectionNamespace =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" ' +
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ' +
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" ' +
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"';

export function generateHwpx(template: HwpxTemplate, blocks: DocumentBlock[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(template.files)) {
    files[path] = new Uint8Array(content);
  }

  files["Contents/section0.xml"] = new Uint8Array(strToU8(renderSectionXml(template, blocks)));
  files["Preview/PrvText.txt"] = new Uint8Array(strToU8(blocks.map((block) => block.text).join("\r\n")));

  return zipSync(files);
}

export function renderSectionXml(template: HwpxTemplate, blocks: DocumentBlock[]): string {
  const paragraphs = blocks.map((block, index) => renderParagraph(template, block, index)).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${sectionNamespace}>${paragraphs}</hs:sec>`;
}

function renderParagraph(template: HwpxTemplate, block: DocumentBlock, index: number): string {
  const style = template.styleMap[block.role];
  const controls = index === 0 ? template.sectionControlsXml : "";
  const text = escapeXmlText(block.text);
  const vertpos = index * 2200;

  return `<hp:p id="${index}" paraPrIDRef="${style.paraPrIDRef}" styleIDRef="${style.styleIDRef}" pageBreak="0" columnBreak="0" merged="0">` +
    `${renderRun(style, controls)}${renderRun(style, `<hp:t>${text}</hp:t>`)}` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertpos}" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="48192" flags="393216"/></hp:linesegarray>` +
    `</hp:p>`;
}

function renderRun(style: HwpxParagraphStyle, content: string): string {
  return `<hp:run charPrIDRef="${style.charPrIDRef}">${content}</hp:run>`;
}
