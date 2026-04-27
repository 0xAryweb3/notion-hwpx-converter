import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { generateHwpx } from "../features/hwpx/render";
import { loadHwpxTemplate } from "../features/hwpx/template";
import type { DocumentBlock } from "../features/document/types";

describe("HWPX rendering", () => {
  it("loads template files and infers paragraph styles", () => {
    const template = loadHwpxTemplate(createTemplateZip());

    expect(template.files["Contents/header.xml"]).toBeDefined();
    expect(template.styleMap.section).toEqual({ paraPrIDRef: "53", charPrIDRef: "39", styleIDRef: "0" });
    expect(template.styleMap.koreanItem).toEqual({ paraPrIDRef: "55", charPrIDRef: "57", styleIDRef: "19" });
  });

  it("generates a new HWPX while preserving non-section package files", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const blocks: DocumentBlock[] = [
      { id: "block-1", role: "title", text: "새 입찰 공고" },
      { id: "block-2", role: "section", text: "1. 새 입찰내용" },
      { id: "block-3", role: "koreanItem", text: "  가. 용역기간: 3개월" }
    ];

    const output = unzipSync(generateHwpx(template, blocks));

    expect(strFromU8(output["mimetype"])).toBe("application/hwp+zip");
    expect(strFromU8(output["Contents/header.xml"])).toBe("<head />");
    expect(strFromU8(output["Contents/section0.xml"])).toContain("새 입찰 공고");
    expect(strFromU8(output["Contents/section0.xml"])).toContain('paraPrIDRef="53"');
  });

  it("escapes XML text in generated paragraphs", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [{ id: "block-1", role: "body", text: "A & B <C>" }])
    );

    expect(strFromU8(output["Contents/section0.xml"])).toContain("A &amp; B &lt;C&gt;");
  });
});

function createTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(createTemplateSection()))
  });
}

function createTemplateSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="0" paraPrIDRef="38" styleIDRef="1" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="116"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="WIDELY" width="59528" height="84188"/></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1"/></hp:ctrl></hp:run>
    <hp:run charPrIDRef="116"><hp:t>환경부공고 제2025-436호</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="58" styleIDRef="1" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="63"><hp:t>입찰 공고</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="53" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="39"><hp:t>1. 입찰내용</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="55" styleIDRef="19" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="57"><hp:t>  가. 용역기간: 6개월</hp:t></hp:run>
  </hp:p>
</hs:sec>`;
}
