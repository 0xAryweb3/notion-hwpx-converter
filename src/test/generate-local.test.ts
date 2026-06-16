import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import type { DocumentBlock } from "../features/document/types";
import { buildGeneratedHwpxConsoleSummary, generateHwpxReport } from "../features/hwpx/generationReport";
import { loadHwpxTemplate } from "../features/hwpx/template";
import { publicNotionBlocksToDocumentBlocks } from "../features/notion-link/publicBlocks";

describe("generate-local source normalization", () => {
  it("preserves public Notion image blocks between text blocks", () => {
    const blocks = publicNotionBlocksToDocumentBlocks([
      { kind: "text", text: "BRIEF 9" },
      {
        kind: "image",
        text: "차트",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "https://example.com/chart.png",
          altText: "차트",
          bytesBase64: "iVBORw=="
        }
      },
      { kind: "text", text: "이미지 뒤 본문" }
    ]);

    expect(blocks).toEqual([
      { id: "block-1", role: "title", text: "BRIEF 9" },
      {
        id: "block-2",
        role: "image",
        text: "차트",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "https://example.com/chart.png",
          altText: "차트",
          bytes: new Uint8Array([137, 80, 78, 71])
        }
      },
      { id: "block-3", role: "body", text: "이미지 뒤 본문" }
    ]);
  });

  it("builds the same generated HWPX report shape used by the local CLI", () => {
    const template = loadHwpxTemplate(createSimpleTemplateZip());
    const blocks: DocumentBlock[] = [
      { id: "block-1", role: "title", text: "새 문서" },
      { id: "block-2", role: "body", text: "본문" }
    ];

    const result = generateHwpxReport({
      template,
      blocks,
      samplePath: "/tmp/sample.hwpx",
      outputPath: "/tmp/output.hwpx",
      sourceUrl: "https://example.notion.site/page"
    });

    expect(result.output.byteLength).toBeGreaterThan(0);
    expect(result.report.outputAudit.passed).toBe(true);
    expect(result.report.visualDogfood.summary.pageOverflowRiskCount).toBe(0);
    expect(result.report.hancomReflowRiskCount).toBe(0);
    expect(result.consoleSummary.score).toBe(result.report.outputAudit.score);
    expect(result.consoleSummary.hancomReflowRiskCount).toBe(0);
    expect(result.consoleSummary.missingSourceTextCount).toBe(0);
  });

  it("counts deterministic Hancom reflow risks in the generated report summary", () => {
    const report = buildGeneratedHwpxConsoleSummary({
      generatedAt: "2026-06-17T00:00:00.000Z",
      samplePath: "/tmp/sample.hwpx",
      outputPath: "/tmp/output.hwpx",
      hancomReflowRiskCount: 3,
      source: { blockCount: 1, tableRowCount: 0, imageCount: 0 },
      template: {
        paragraphCount: 1,
        tableCount: 0,
        titleTableCount: 0,
        bodyTableCount: 0,
        grammarWarnings: [],
        tableMotifs: [],
        roles: {}
      },
      quality: {
        inputTableGroupCount: 0,
        inputTableRowCount: 0,
        structureTableAssignmentCount: 0,
        issues: [],
        assignmentRows: []
      },
      outputAudit: {
        score: 100,
        passed: true,
        summary: {
          sourceBlocks: 1,
          sourceTableGroups: 0,
          outputParagraphs: 1,
          outputTables: 0,
          outputTitleTables: 0,
          outputBodyTables: 0,
          outputPictures: 0,
          outputContainers: 0,
          outputLineSegArrays: 1,
          outputLineSegs: 1,
          redRunCount: 0,
          nonBlackGeneratedRunCount: 0,
          badBulletIndentCount: 0,
          badNonBulletIndentCount: 0,
          badBulletStyleIndentCount: 0,
          badNonBulletAutoHeadingCount: 0,
          missingSourceTextCount: 0,
          overflowRiskCount: 0,
          pageOverflowCount: 0
        },
        issues: []
      },
      visualDogfood: {
        paragraphs: [],
        tables: [],
        issues: [],
        summary: {
          paragraphs: 0,
          nonEmptyParagraphs: 0,
          tables: 0,
          nonEmptyTables: 0,
          nonBlackGeneratedTextCount: 0,
          bulletNegativeIndentStyleCount: 0,
          bulletContinuationIndentRiskCount: 0,
          justifySpacingRiskCount: 0,
          missingBlankAfterBulletGroupCount: 0,
          verticalOverlapRiskCount: 0,
          pageOverflowRiskCount: 0,
          pageBottomTightRiskCount: 0,
          pageCount: 1,
          pageContentHeight: 10000
        }
      }
    });

    expect(report.hancomReflowRiskCount).toBe(3);
  });
});

function createSimpleTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">
    <hh:charPr id="1" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:underline type="NONE" shape="SOLID" color="#000000"/>
    </hh:charPr>
  </hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0">
      <hh:align horizontal="LEFT" vertical="BASELINE"/>
      <hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin>
      <hh:lineSpacing type="PERCENT" value="160"/>
    </hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="sample" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="84186"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/></hp:pagePr></hp:secPr><hp:t>샘플 본문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}
