import { describe, expect, it } from "vitest";
import { assignHwpxStyles } from "../features/hwpx/styleAssignment";
import { buildHwpxSourceStructure } from "../features/hwpx/sourceStructure";
import type { HwpxFormatGrammar } from "../features/hwpx/formatGrammar";
import type { HwpxStyleMap } from "../features/hwpx/template";

describe("HWPX style assignment", () => {
  it("maps source nodes to measured grammar styles and normalized output text", () => {
    const nodes = buildHwpxSourceStructure([
      { id: "block-1", role: "body", text: "센터 소식" },
      { id: "block-2", role: "dashItem", text: "- 울산‘탄소영감(Net-Zero) 실험실’프로젝트 참여자 모집" },
      { id: "block-3", role: "dashItem", text: "- 지역 기반 탄소중립 실천 모델 발굴을 위해 모집함" },
      { id: "block-4", role: "section", text: "1. 다음 제목" },
      { id: "block-5", role: "dashItem", text: "- 다음 글머리" }
    ]);
    const assignments = assignHwpxStyles(createGrammar(), nodes, createFallbackStyleMap());

    expect(assignments.map((assignment) => assignment.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph"
    ]);
    expect(assignments.map((assignment) => assignment.grammarRole)).toEqual([
      "categoryHeading",
      "newsTitle",
      "newsBullet",
      "bodyHeading",
      "bullet"
    ]);
    expect(assignments.map((assignment) => assignment.text)).toEqual([
      "센터 소식",
      "울산‘탄소영감(Net-Zero) 실험실’프로젝트 참여자 모집",
      "○ 지역 기반 탄소중립 실천 모델 발굴을 위해 모집함",
      "1. 다음 제목",
      "○ 다음 글머리"
    ]);
    expect(assignments[0].style).toEqual({ paraPrIDRef: "4", charPrIDRef: "4", styleIDRef: "0" });
    expect(assignments[1].style).toEqual({ paraPrIDRef: "1", charPrIDRef: "1", styleIDRef: "0" });
    expect(assignments[2].style).toEqual({ paraPrIDRef: "2", charPrIDRef: "2", styleIDRef: "0" });
    expect(assignments[4].paragraphMargins.intent).toBe(-1800);
  });

  it("keeps source table policy explicit in assignments", () => {
    const noTableAssignments = assignHwpxStyles(
      createGrammar(),
      buildHwpxSourceStructure([{ id: "block-1", role: "body", text: "본문" }]),
      createFallbackStyleMap()
    );
    const tableAssignments = assignHwpxStyles(
      createGrammar(),
      buildHwpxSourceStructure([{ id: "block-1", role: "tableRow", text: "구분\t기준" }]),
      createFallbackStyleMap()
    );

    expect(noTableAssignments.some((assignment) => assignment.type === "table")).toBe(false);
    expect(tableAssignments).toContainEqual(
      expect.objectContaining({
        type: "table",
        grammarRole: "table",
        rows: [["구분", "기준"]]
      })
    );
  });

  it("marks grammar-backed structure table assignments without turning them into data tables", () => {
    const assignments = assignHwpxStyles(
      createGrammar(),
      buildHwpxSourceStructure([
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
        { id: "block-3", role: "section", text: "1. 울산광역시 기본계획 점검" }
      ]),
      createFallbackStyleMap()
    );

    expect(assignments.find((assignment) => assignment.grammarRole === "leadHeading")).toMatchObject({
      type: "paragraph",
      renderAs: "structureTable",
      structureTable: { role: "leadHeading", order: 1, rowCount: 1, colCount: 1 }
    });
    expect(assignments.some((assignment) => assignment.type === "table")).toBe(false);
  });

  it("uses category structure tables only for matching category labels", () => {
    const assignments = assignHwpxStyles(
      createGrammar(),
      buildHwpxSourceStructure([
        { id: "block-1", role: "body", text: "전국 소식" },
        { id: "block-2", role: "body", text: "센터 소식" }
      ]),
      createFallbackStyleMap()
    );

    expect(assignments.find((assignment) => assignment.text === "전국 소식")?.renderAs).toBeUndefined();
    expect(assignments.find((assignment) => assignment.text === "센터 소식")).toMatchObject({
      renderAs: "structureTable",
      structureTable: { role: "categoryHeading", order: 2 }
    });
  });
});

function createGrammar(): HwpxFormatGrammar {
  return {
    titleTableCount: 1,
    bodyTableTemplates: [{ order: 1, rowCount: 1, colCount: 2, xml: "<hp:tbl />" }],
    tableMotifs: {
      leadHeading: { order: 1, rowCount: 1, colCount: 1, text: "샘플 리드 제목" },
      categoryHeading: { order: 2, rowCount: 1, colCount: 1, text: "센터 소식" }
    },
    warnings: [],
    roles: {
      leadHeading: role("leadHeading", "1", "1", 14, 0, 0, 800, 300),
      bodyHeading: role("bodyHeading", "1", "1", 14, 0, 0, 800, 300),
      categoryHeading: role("categoryHeading", "4", "4", 12, 0, 0, 1600, 400),
      newsTitle: role("newsTitle", "1", "1", 14, 0, 0, 800, 300),
      newsBullet: role("newsBullet", "2", "2", 10, -1800, 0, 0, 200),
      bullet: role("bullet", "2", "2", 10, -1800, 0, 0, 200),
      bodyParagraph: role("bodyParagraph", "2", "2", 10, 0, 0, 0, 200)
    }
  };
}

function role(
  roleName: keyof HwpxFormatGrammar["roles"],
  paraPrIDRef: string,
  charPrIDRef: string,
  fontSizePt: number,
  intent: number,
  left: number,
  prev: number,
  next: number
) {
  return {
    role: roleName,
    sampleText: "sample",
    style: { paraPrIDRef, charPrIDRef, styleIDRef: "0" },
    fontSizePt,
    textColor: "#000000",
    charSpacing: 0,
    paragraphMargins: { intent, left, right: 0, prev, next },
    line: null,
    confidence: 1,
    reason: "test"
  };
}

function createFallbackStyleMap(): HwpxStyleMap {
  const fallback = { paraPrIDRef: "9", charPrIDRef: "9", styleIDRef: "0" };

  return {
    title: fallback,
    noticeNumber: fallback,
    body: fallback,
    section: fallback,
    koreanItem: fallback,
    dashItem: fallback,
    tableRow: fallback,
    image: fallback,
    note: fallback
  };
}
