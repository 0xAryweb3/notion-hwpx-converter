import { describe, expect, it } from "vitest";
import { detectBlockRole, normalizeLinesToBlocks } from "../features/document/detect";

describe("detectBlockRole", () => {
  it("detects notice numbers", () => {
    expect(detectBlockRole("환경부공고 제2025-436호", 0)).toBe("noticeNumber");
  });

  it("detects numeric section headings", () => {
    expect(detectBlockRole("1. 입찰내용", 2)).toBe("section");
  });

  it("does not treat Korean dates as numeric section headings", () => {
    expect(detectBlockRole("2025. 6. 30.", 2)).toBe("body");
  });

  it("detects Korean alpha items with leading spaces", () => {
    expect(detectBlockRole("  가. 용 역 명: 제12회 대학생 물환경 정책", 3)).toBe("koreanItem");
  });

  it("detects dash items", () => {
    expect(detectBlockRole("     - 평가기관 : 환경부", 4)).toBe("dashItem");
  });

  it("detects notes", () => {
    expect(detectBlockRole("      ※ 직접생산확인증명서는 유효기간 내에 있어야 함", 5)).toBe("note");
  });

  it("detects table rows", () => {
    expect(detectBlockRole("구분\t기준", 3)).toBe("tableRow");
    expect(detectBlockRole("| 구분 | 기준 |", 3)).toBe("tableRow");
  });

  it("uses the first non-structural line as title", () => {
    expect(detectBlockRole("「제12회 대학생 물환경 정책‧기술 공모전」 입찰 공고", 0)).toBe("title");
  });

  it("falls back to body", () => {
    expect(detectBlockRole("다음과 같이 입찰에 부치고자 공고합니다.", 5)).toBe("body");
  });
});

describe("normalizeLinesToBlocks", () => {
  it("drops empty lines and assigns stable ids", () => {
    expect(normalizeLinesToBlocks(["", "1. 입찰내용", "  가. 용역기간: 6개월"])).toEqual([
      { id: "block-1", role: "section", text: "1. 입찰내용" },
      { id: "block-2", role: "koreanItem", text: "  가. 용역기간: 6개월" }
    ]);
  });

  it("marks the first prominent line after a notice number as title", () => {
    expect(normalizeLinesToBlocks(["환경부공고 제2025-436호", "「제12회 대학생 물환경 정책‧기술 공모전」 입찰 공고"])).toEqual([
      { id: "block-1", role: "noticeNumber", text: "환경부공고 제2025-436호" },
      { id: "block-2", role: "title", text: "「제12회 대학생 물환경 정책‧기술 공모전」 입찰 공고" }
    ]);
  });

  it("normalizes Markdown table rows and drops delimiter rows", () => {
    expect(normalizeLinesToBlocks(["| 구분 | 기준 |", "| --- | --- |", "| 달성 | 목표 달성 |"])).toEqual([
      { id: "block-1", role: "tableRow", text: "구분\t기준" },
      { id: "block-2", role: "tableRow", text: "달성\t목표 달성" }
    ]);
  });

  it("does not infer image blocks from plain text image-looking lines", () => {
    expect(normalizeLinesToBlocks(["![alt](image.png)"])).toEqual([
      { id: "block-1", role: "body", text: "![alt](image.png)" }
    ]);
  });
});
