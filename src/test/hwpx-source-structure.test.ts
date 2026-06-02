import { describe, expect, it } from "vitest";
import { buildHwpxSourceStructure } from "../features/hwpx/sourceStructure";
import type { DocumentBlock } from "../features/document/types";

describe("HWPX source structure", () => {
  it("splits BRIEF titles and groups body content by source structure", () => {
    const nodes = buildHwpxSourceStructure([
      { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
      { id: "block-2", role: "body", text: "탄소중립 정보공유" },
      { id: "block-3", role: "body", text: "전국 소식" },
      { id: "block-4", role: "dashItem", text: "- 기후특위, 탄소중립기본법 개정 논의" },
      { id: "block-5", role: "dashItem", text: "- 국회 기후특위는 탄소중립기본법 개정안을 논의함" },
      { id: "block-6", role: "tableRow", text: "구분\t기준" },
      { id: "block-7", role: "tableRow", text: "달성\t목표 달성" }
    ]);

    expect(nodes.map((node) => node.type)).toEqual([
      "title",
      "issue",
      "pageHeading",
      "categoryHeading",
      "newsTitle",
      "newsBullet",
      "tableGroup"
    ]);
    expect(nodes[0]).toMatchObject({ text: "울산광역시 탄소중립지원센터 BRIEF", sourceBlockIds: ["block-1"] });
    expect(nodes[1]).toMatchObject({ text: "통권 제9호(2026년 5월)", sourceBlockIds: ["block-1"] });
    expect(nodes[4]).toMatchObject({ text: "기후특위, 탄소중립기본법 개정 논의" });
    expect(nodes[5]).toMatchObject({ text: "국회 기후특위는 탄소중립기본법 개정안을 논의함" });
    expect(nodes[6]).toMatchObject({
      type: "tableGroup",
      rows: [
        ["구분", "기준"],
        ["달성", "목표 달성"]
      ],
      sourceBlockIds: ["block-6", "block-7"]
    });
  });

  it("does not create table groups when the source has no table rows", () => {
    const blocks: DocumentBlock[] = [
      { id: "block-1", role: "title", text: "표 없는 문서" },
      { id: "block-2", role: "body", text: "본문" },
      { id: "block-3", role: "dashItem", text: "- 항목" }
    ];

    expect(buildHwpxSourceStructure(blocks).some((node) => node.type === "tableGroup")).toBe(false);
  });

  it("classifies the first short body paragraph after a BRIEF title as the lead heading", () => {
    const nodes = buildHwpxSourceStructure([
      { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
      { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
      { id: "block-3", role: "section", text: "1. 울산광역시 기본계획 점검" }
    ]);

    expect(nodes.map((node) => node.type)).toEqual(["title", "issue", "leadHeading", "bodyHeading"]);
    expect(nodes[2]).toMatchObject({
      text: "2026년 울산광역시 탄소중립지원센터 사업 소개",
      sourceBlockIds: ["block-2"]
    });
  });
});
