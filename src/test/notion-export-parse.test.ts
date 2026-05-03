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

  it("cleans Notion Markdown decoration and raw link URLs", () => {
    const blocks = parseNotionSource({
      name: "brief.md",
      data: strToU8(
        '### **센터 소식**\n\n- 링크 : [울산광역시, 보도자료](https://www.ulsan.go.kr/u/rep/bbs/view.do?mId=001003000000000000&bbsId=BBS_0000000000000007&dataId=1803)\n'
      )
    });

    expect(blocks.map((block) => block.text)).toEqual(["센터 소식", "- 링크 : 울산광역시, 보도자료"]);
  });

  it("preserves Markdown tables as table row blocks", () => {
    const blocks = parseNotionSource({
      name: "brief.md",
      data: strToU8("| 구분 | 기준 |\n| --- | --- |\n| 달성 | 목표 달성 |\n")
    });

    expect(blocks).toEqual([
      { id: "block-1", role: "tableRow", text: "구분\t기준" },
      { id: "block-2", role: "tableRow", text: "달성\t목표 달성" }
    ]);
  });

  it("parses Markdown image syntax as source image blocks", () => {
    const blocks = parseNotionSource({
      name: "page.md",
      data: strToU8("본문\n\n![설명](assets/card.png)\n\n다음 문단")
    });

    expect(blocks).toEqual([
      { id: "block-1", role: "title", text: "본문" },
      {
        id: "block-2",
        role: "image",
        text: "설명",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "card.png",
          mimeType: "image/png",
          url: "assets/card.png",
          altText: "설명"
        }
      },
      { id: "block-3", role: "body", text: "다음 문단" }
    ]);
  });

  it("resolves Markdown images from a Notion export ZIP", () => {
    const zip = zipSync({
      "page.md": new Uint8Array(strToU8("![차트](images/chart.jpg)")),
      "images/chart.jpg": new Uint8Array([255, 216, 255, 217])
    });

    const blocks = parseNotionSource({ name: "export.zip", data: zip });

    expect(blocks[0]?.role).toBe("image");
    expect(blocks[0]?.asset?.mimeType).toBe("image/jpeg");
    expect(blocks[0]?.asset?.bytes).toEqual(new Uint8Array([255, 216, 255, 217]));
  });

  it("parses HTML images as source image blocks", () => {
    const blocks = parseNotionSource({
      name: "page.html",
      data: strToU8('<article><p>본문</p><img src="assets/chart.png" alt="차트"><p>다음 문단</p></article>')
    });

    expect(blocks).toEqual([
      { id: "block-1", role: "title", text: "본문" },
      {
        id: "block-2",
        role: "image",
        text: "차트",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "assets/chart.png",
          altText: "차트"
        }
      },
      { id: "block-3", role: "body", text: "다음 문단" }
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

  it("preserves HTML tables as table row blocks", () => {
    const blocks = parseNotionSource({
      name: "notice.html",
      data: strToU8("<table><tbody><tr><th>구분</th><th>기준</th></tr><tr><td>달성</td><td>목표 달성</td></tr></tbody></table>")
    });

    expect(blocks).toEqual([
      { id: "block-1", role: "tableRow", text: "구분\t기준" },
      { id: "block-2", role: "tableRow", text: "달성\t목표 달성" }
    ]);
  });

  it("rejects unsupported files", () => {
    expect(() => parseNotionSource({ name: "notice.pdf", data: strToU8("pdf") })).toThrow(
      "Unsupported Notion source"
    );
  });
});
