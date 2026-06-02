import { describe, expect, it } from "vitest";
import { cleanNotionText, extractNotionPageId, recordMapToPlainText } from "./notion-public.mjs";

describe("extractNotionPageId", () => {
  it("extracts and hyphenates the page id from a public Notion URL", () => {
    expect(
      extractNotionPageId(
        "https://galvanized-need-1fa.notion.site/BRIEF-9-2026-5-34f1e6afd42e8029a30bd4cb4b0523d6"
      )
    ).toBe("34f1e6af-d42e-8029-a30b-d4cb4b0523d6");
  });
});

describe("recordMapToPlainText", () => {
  it("walks page content in order and converts Notion list blocks into plain lines", () => {
    const recordMap = {
      block: {
        "page-id": record("page", "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)", [
          "heading-id",
          "number-1",
          "bullet-1",
          "number-2"
        ]),
        "heading-id": record("sub_header", "탄소중립 정보공유"),
        "number-1": record("numbered_list", "전국 소식"),
        "bullet-1": record("bulleted_list", "기후특위, 탄소중립기본법 개정 논의"),
        "number-2": record("numbered_list", "울산 소식")
      }
    };

    expect(recordMapToPlainText(recordMap, "page-id")).toEqual({
      title: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)",
      lines: [
        "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)",
        "탄소중립 정보공유",
        "1. 전국 소식",
        "- 기후특위, 탄소중립기본법 개정 논의",
        "2. 울산 소식"
      ],
      blocks: [
        { kind: "text", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { kind: "text", text: "탄소중립 정보공유" },
        { kind: "text", text: "1. 전국 소식" },
        { kind: "text", text: "- 기후특위, 탄소중립기본법 개정 논의" },
        { kind: "text", text: "2. 울산 소식" }
      ]
    });
  });

  it("preserves public Notion table rows as tab-separated lines", () => {
    const recordMap = {
      block: {
        "page-id": record("page", "표 테스트", ["table-id"]),
        "table-id": record("table", "", ["header-row", "body-row"]),
        "header-row": recordWithProperties("table_row", {
          "0": [["구분"]],
          "1": [["기준"]]
        }),
        "body-row": recordWithProperties("table_row", {
          "0": [["달성"]],
          "1": [["목표 달성"]]
        })
      }
    };

    expect(recordMapToPlainText(recordMap, "page-id")).toEqual({
      title: "표 테스트",
      lines: ["표 테스트", "구분\t기준", "달성\t목표 달성"],
      blocks: [
        { kind: "text", text: "표 테스트" },
        { kind: "text", text: "구분\t기준" },
        { kind: "text", text: "달성\t목표 달성" }
      ]
    });
  });

  it("preserves image blocks separately from text fallback lines", () => {
    const recordMap = {
      block: {
        "page-id": record("page", "이미지 테스트", ["image-id", "body-id"]),
        "image-id": recordWithProperties("image", {
          title: [["차트 설명"]],
          source: [["https://example.com/chart.png"]]
        }),
        "body-id": record("text", "이미지 뒤 본문")
      }
    };

    expect(recordMapToPlainText(recordMap, "page-id")).toEqual({
      title: "이미지 테스트",
      lines: ["이미지 테스트", "이미지 뒤 본문"],
      blocks: [
        { kind: "text", text: "이미지 테스트" },
        {
          kind: "image",
          text: "차트 설명",
          asset: {
            id: "asset-1",
            kind: "image",
            fileName: "chart.png",
            mimeType: "image/png",
            url: "https://example.com/chart.png",
            altText: "차트 설명"
          }
        },
        { kind: "text", text: "이미지 뒤 본문" }
      ]
    });
  });
});

describe("cleanNotionText", () => {
  it("removes Markdown decoration and replaces raw URLs with stable link labels", () => {
    expect(cleanNotionText("- 링크 : [울산광역시, 보도자료](https://www.ulsan.go.kr/u/rep/bbs/view.do?mId=001003000000000000&bbsId=BBS_0000000000000007&dataId=1803)")).toBe(
      "- 링크 : 울산광역시, 보도자료"
    );
    expect(cleanNotionText("### **센터 소식**")).toBe("센터 소식");
  });
});

function record(type, title, content = []) {
  return {
    value: {
      value: {
        id: title === "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" ? "page-id" : title,
        type,
        properties: { title: [[title]] },
        content
      },
      role: "reader"
    }
  };
}

function recordWithProperties(type, properties, content = []) {
  return {
    value: {
      value: {
        id: type,
        type,
        properties,
        content
      },
      role: "reader"
    }
  };
}
