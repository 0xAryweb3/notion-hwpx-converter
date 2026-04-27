import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseNotionSource } from "../features/notion-export/parse";

describe("parseNotionSource", () => {
  it("parses Markdown into document blocks", () => {
    const blocks = parseNotionSource({
      name: "notice.md",
      data: strToU8("# 입찰 공고\n\n1. 입찰내용\n  가. 용역기간: 6개월\n     - 평가기관 : 환경부\n")
    });

    expect(blocks).toEqual([
      { id: "block-1", role: "title", text: "입찰 공고" },
      { id: "block-2", role: "section", text: "1. 입찰내용" },
      { id: "block-3", role: "koreanItem", text: "  가. 용역기간: 6개월" },
      { id: "block-4", role: "dashItem", text: "     - 평가기관 : 환경부" }
    ]);
  });

  it("prefers Markdown over HTML inside Notion export ZIP files", () => {
    const zip = zipSync({
      "notice.html": new Uint8Array(strToU8("<h1>HTML 제목</h1>")),
      "notice.md": new Uint8Array(strToU8("# Markdown 제목\n\n환경부공고 제2025-436호"))
    });

    const blocks = parseNotionSource({ name: "notion-export.zip", data: zip });

    expect(blocks.map((block) => block.text)).toEqual(["Markdown 제목", "환경부공고 제2025-436호"]);
    expect(blocks[1]?.role).toBe("noticeNumber");
  });

  it("parses HTML when a ZIP has no Markdown file", () => {
    const zip = zipSync({
      "notice.html": new Uint8Array(
        strToU8("<article><h1>입찰 공고</h1><p>1. 입찰내용</p><ul><li>평가기관 : 환경부</li></ul></article>")
      )
    });

    const blocks = parseNotionSource({ name: "notion-export.zip", data: zip });

    expect(blocks).toEqual([
      { id: "block-1", role: "title", text: "입찰 공고" },
      { id: "block-2", role: "section", text: "1. 입찰내용" },
      { id: "block-3", role: "dashItem", text: "- 평가기관 : 환경부" }
    ]);
  });

  it("rejects unsupported files", () => {
    expect(() => parseNotionSource({ name: "notice.pdf", data: strToU8("pdf") })).toThrow(
      "Unsupported Notion source"
    );
  });
});
