import { describe, expect, it } from "vitest";
import { auditGeneratedHwpx } from "../features/hwpx/outputAudit";
import type { DocumentBlock } from "../features/document/types";
import type { HwpxStyleAssignment } from "../features/hwpx/styleAssignment";

describe("generated HWPX output audit", () => {
  it("fails when source has no table rows but output contains body tables", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: "본문" }],
      assignments: [paragraphAssignment("assignment-1", "본문")],
      sectionXml: sectionXml([
        tableXml("title"),
        tableXml("body-table"),
        paragraphXml("p1", "1", "1", "본문", [0])
      ]),
      headerXml: headerXml(),
      titleTableCount: 1
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.outputBodyTables).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "unexpected-body-table"
    }));
  });

  it("allows assigned one-cell structure tables when source has no data table rows", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: "2026년 사업 소개" }],
      assignments: [{
        ...paragraphAssignment("assignment-1", "2026년 사업 소개"),
        grammarRole: "leadHeading",
        renderAs: "structureTable",
        structureTable: { role: "leadHeading", order: 1, rowCount: 1, colCount: 1 }
      }],
      sectionXml: sectionXml([
        tableXml("title"),
        tableXml("2026년 사업 소개")
      ]),
      headerXml: headerXml(),
      titleTableCount: 1
    });

    expect(audit.passed).toBe(true);
    expect(audit.summary.outputBodyTables).toBe(1);
  });

  it("fails when wrapped bullet continuation lines are not indented", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "dashItem", text: "- 긴 글머리" }],
      assignments: [paragraphAssignment("assignment-1", "○ 긴 글머리")],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "1", "○ 긴 글머리", [0, 0])
      ]),
      headerXml: headerXml(),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.badBulletIndentCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "bad-bullet-continuation-indent"
    }));
  });

  it("fails when wrapped dash-bullet continuation lines are not indented", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "dashItem", text: "- 긴 글머리" }],
      assignments: [paragraphAssignment("assignment-1", "- 긴 글머리")],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "1", "- 긴 글머리", [0, 0])
      ]),
      headerXml: headerXml(),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.badBulletIndentCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "bad-bullet-continuation-indent"
    }));
  });

  it("fails when non-bullet paragraphs use a hanging-indent paragraph style", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "section", text: "1. 제목" }],
      assignments: [paragraphAssignment("assignment-1", "1. 제목")],
      sectionXml: sectionXml([
        paragraphXml("p1", "27", "1", "1. 제목", [0])
      ]),
      headerXml: headerXml({ hangingParaPrIds: ["27"] }),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.badNonBulletIndentCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "non-bullet-hanging-indent"
    }));
  });

  it("fails when non-bullet generated text uses an automatic bullet heading style", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: "울산 소식" }],
      assignments: [{
        ...paragraphAssignment("assignment-1", "울산 소식"),
        grammarRole: "categoryHeading"
      }],
      sectionXml: sectionXml([
        paragraphXml("p1", "64", "1", "울산 소식", [0])
      ]),
      headerXml: headerXml({ headingParaPrTypes: { "64": "BULLET" } }),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.badNonBulletAutoHeadingCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "non-bullet-auto-heading"
    }));
  });

  it("fails when generated bullet paragraphs still use a negative-intent paragraph style", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "dashItem", text: "- 글머리" }],
      assignments: [paragraphAssignment("assignment-1", "○ 글머리")],
      sectionXml: sectionXml([
        paragraphXml("p1", "27", "1", "○ 글머리", [1800])
      ]),
      headerXml: headerXml({ hangingParaPrIds: ["27"] }),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.badBulletStyleIndentCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "bullet-negative-indent-style"
    }));
  });

  it("fails when generated body text uses red guide styles", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "section", text: "1. 제목" }],
      assignments: [paragraphAssignment("assignment-1", "1. 제목")],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "9", "1. 제목", [0])
      ]),
      headerXml: headerXml({ redCharPrIds: ["9"] }),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.redRunCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "red-guide-style-used"
    }));
  });

  it("fails when generated body text uses a non-black visible character style", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: "본문" }],
      assignments: [paragraphAssignment("assignment-1", "본문")],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "2", "본문", [0])
      ]),
      headerXml: headerXml({ charColors: { "2": "#0000FF" } }),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.nonBlackGeneratedRunCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "non-black-generated-text"
    }));
  });

  it("fails when assigned source text is missing from the generated output", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: "반드시 들어갈 문장" }],
      assignments: [paragraphAssignment("assignment-1", "반드시 들어갈 문장")],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "1", "다른 문장", [0])
      ]),
      headerXml: headerXml(),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.missingSourceTextCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "missing-source-text"
    }));
  });

  it("does not mark split layout fragments as missing source text", () => {
    const fullText = "첫 문장입니다. 둘째 문장입니다.";
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: fullText }],
      assignments: [
        {
          ...paragraphAssignment("assignment-1-fragment-1", "첫 문장입니다."),
          auditText: fullText,
          layoutFragment: { index: 1, count: 2 }
        },
        {
          ...paragraphAssignment("assignment-1-fragment-2", "둘째 문장입니다."),
          auditText: fullText,
          layoutFragment: { index: 2, count: 2 }
        }
      ],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "1", "첫 문장입니다.", [0]),
        paragraphXml("p2", "1", "1", "둘째 문장입니다.", [0])
      ]),
      headerXml: headerXml(),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(true);
    expect(audit.summary.missingSourceTextCount).toBe(0);
  });

  it("warns when a generated paragraph has high overflow risk", () => {
    const longText = "울산광역시 ".repeat(260);
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: longText }],
      assignments: [paragraphAssignment("assignment-1", longText)],
      sectionXml: sectionXml([
        paragraphXml("p1", "1", "1", longText, [0])
      ]),
      headerXml: headerXml(),
      titleTableCount: 0,
      overflowLineThreshold: 5
    });

    expect(audit.passed).toBe(true);
    expect(audit.summary.overflowRiskCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "paragraph-overflow-risk"
    }));
  });

  it("fails when a paragraph line box exceeds the real page content height", () => {
    const audit = auditGeneratedHwpx({
      blocks: [{ id: "block-1", role: "body", text: "본문" }],
      assignments: [paragraphAssignment("assignment-1", "본문")],
      sectionXml: sectionXml([
        sectionPropertiesParagraphXml({ pageHeight: 3000, top: 0, bottom: 0 }),
        paragraphXmlAtVert("p1", "1", "1", "본문", 2500)
      ]),
      headerXml: headerXml(),
      titleTableCount: 0
    });

    expect(audit.passed).toBe(false);
    expect(audit.summary.pageOverflowCount).toBe(1);
    expect(audit.issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "page-line-overflow"
    }));
  });

  it("passes clean generated output with a high score", () => {
    const audit = auditGeneratedHwpx({
      blocks: [
        { id: "block-1", role: "body", text: "본문" },
        { id: "block-2", role: "dashItem", text: "- 글머리" }
      ],
      assignments: [
        paragraphAssignment("assignment-1", "본문"),
        paragraphAssignment("assignment-2", "○ 글머리")
      ],
      sectionXml: sectionXml([
        tableXml("title"),
        paragraphXml("p1", "1", "1", "본문", [0]),
        paragraphXml("p2", "1", "1", "○ 글머리", [1600, 1800])
      ]),
      headerXml: headerXml(),
      titleTableCount: 1
    });

    expect(audit.passed).toBe(true);
    expect(audit.score).toBeGreaterThanOrEqual(90);
    expect(audit.summary.outputBodyTables).toBe(0);
    expect(audit.summary.badBulletIndentCount).toBe(0);
    expect(audit.summary.missingSourceTextCount).toBe(0);
  });
});

function paragraphAssignment(id: string, text: string): HwpxStyleAssignment {
  return {
    id,
    type: "paragraph",
    grammarRole: text.startsWith("○") ? "bullet" : "bodyParagraph",
    text,
    sourceNodeId: id.replace("assignment", "source-node"),
    sourceBlockIds: [id.replace("assignment", "block")],
    style: { paraPrIDRef: "1", charPrIDRef: "1", styleIDRef: "0" },
    paragraphMargins: { intent: text.startsWith("○") ? -1600 : 0, left: 0, right: 0, prev: 0, next: 0 },
    fontSizePt: 10,
    charSpacing: 0,
    textColor: "#000000",
    reason: "test",
    confidence: 1
  };
}

function sectionXml(children: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">${children.join("")}</hs:sec>`;
}

function tableXml(id: string): string {
  return `<hp:tbl id="${id}"><hp:tr><hp:tc><hp:subList>${paragraphXml(`${id}-p`, "1", "1", id, [0])}</hp:subList></hp:tc></hp:tr></hp:tbl>`;
}

function paragraphXml(id: string, paraPrIDRef: string, charPrIDRef: string, text: string, horzPositions: number[]): string {
  const lines = horzPositions
    .map((horzPos, index) => `<hp:lineseg textpos="${index * 20}" vertpos="${index * 1600}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="${horzPos}" horzsize="42520" flags="${index === 0 ? "393216" : "1441792"}"/>`)
    .join("");

  return `<hp:p id="${id}" paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPrIDRef}"><hp:t>${escapeXml(text)}</hp:t></hp:run><hp:linesegarray>${lines}</hp:linesegarray></hp:p>`;
}

function paragraphXmlAtVert(id: string, paraPrIDRef: string, charPrIDRef: string, text: string, vertPos: number): string {
  return `<hp:p id="${id}" paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPrIDRef}"><hp:t>${escapeXml(text)}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertPos}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`;
}

function sectionPropertiesParagraphXml(options: { pageHeight: number; top: number; bottom: number }): string {
  return `<hp:p id="secpr" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="${options.pageHeight}"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="${options.top}" bottom="${options.bottom}"/></hp:pagePr></hp:secPr><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`;
}

function headerXml(options: { redCharPrIds?: string[]; hangingParaPrIds?: string[]; headingParaPrTypes?: Record<string, string>; charColors?: Record<string, string> } = {}): string {
  const redIds = new Set(options.redCharPrIds ?? []);
  const colorIds = Object.keys(options.charColors ?? {});
  const ids = new Set(["1", ...redIds, ...colorIds]);
  const hangingParaPrIds = new Set(options.hangingParaPrIds ?? []);
  const headingParaPrTypes = options.headingParaPrTypes ?? {};
  const paraPrIds = new Set(["1", ...hangingParaPrIds, ...Object.keys(headingParaPrTypes)]);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"><hh:charProperties itemCnt="${ids.size}">${Array.from(ids).map((id) => `<hh:charPr id="${id}" height="1000" textColor="${options.charColors?.[id] ?? (redIds.has(id) ? "#FF0000" : "#000000")}"><hh:fontRef hangul="0"/><hh:spacing hangul="0"/></hh:charPr>`).join("")}</hh:charProperties><hh:paraProperties itemCnt="${paraPrIds.size}">${Array.from(paraPrIds).map((id) => `<hh:paraPr id="${id}">${headingParaPrTypes[id] === undefined ? "" : `<hh:heading type="${headingParaPrTypes[id]}" idRef="1" level="0"/>`}<hh:margin><hc:intent value="${hangingParaPrIds.has(id) ? "-1448" : "0"}"/></hh:margin></hh:paraPr>`).join("")}</hh:paraProperties></hh:head>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
