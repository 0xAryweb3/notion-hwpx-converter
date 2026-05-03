import { describe, expect, it } from "vitest";
import { analyzeHwpxFormatGrammar } from "../features/hwpx/formatGrammar";
import { analyzeHwpxFormatProfile } from "../features/hwpx/formatProfile";

describe("HWPX format grammar", () => {
  it("exposes paragraph samples with measured text, styles, margins, and line metrics", () => {
    const profile = analyzeHwpxFormatProfile(createHeader(), createSection());

    expect(profile.paragraphSamples.map((sample) => sample.text)).toEqual([
      "울산광역시 탄소중립지원센터 BRIEF",
      "1. 정상 제목",
      "센터 소식",
      "전국 소식",
      "<전국소식 안내문>",
      "샘플 뉴스 제목",
      "○ 샘플 글머리",
      "빨간 안내 스타일",
      "샘플 표",
      "값"
    ]);

    const bullet = profile.paragraphSamples.find((sample) => sample.text === "○ 샘플 글머리");

    expect(bullet).toMatchObject({
      paraPrIDRef: "2",
      charPrIDRef: "2",
      insideTable: false,
      tableOrdinal: null,
      line: {
        textHeight: 1000,
        baseline: 850,
        spacing: 600,
        horzPos: 0,
        horzSize: 42520
      }
    });
    expect(profile.paragraphStyles.find((style) => style.id === "2")?.margins).toMatchObject({
      intent: -1800,
      prev: 0,
      next: 200
    });
    expect(profile.paragraphSamples.find((sample) => sample.text === "샘플 표")).toMatchObject({
      insideTable: true,
      tableOrdinal: 1
    });
  });

  it("infers reusable roles and rejects tiny or red guide heading outliers", () => {
    const profile = analyzeHwpxFormatProfile(createHeader(), createSection());
    const grammar = analyzeHwpxFormatGrammar(profile, { titleTableCount: 1 });

    expect(grammar.titleTableCount).toBe(1);
    expect(grammar.bodyTableTemplates).toHaveLength(1);
    expect(grammar.roles.bodyHeading?.style).toEqual({ paraPrIDRef: "1", charPrIDRef: "1", styleIDRef: "0" });
    expect(grammar.roles.bodyHeading?.paragraphMargins.intent).toBeGreaterThanOrEqual(0);
    expect(grammar.roles.categoryHeading?.style).toEqual({ paraPrIDRef: "4", charPrIDRef: "4", styleIDRef: "0" });
    expect(grammar.roles.categoryHeading?.fontSizePt).toBe(12);
    expect(grammar.roles.newsTitle?.style).toEqual({ paraPrIDRef: "6", charPrIDRef: "6", styleIDRef: "0" });
    expect(grammar.roles.newsTitle?.paragraphMargins.intent).toBeGreaterThanOrEqual(0);
    expect(grammar.roles.bodyParagraph?.paragraphMargins.intent).toBeGreaterThanOrEqual(0);
    expect(grammar.roles.bullet?.style).toEqual({ paraPrIDRef: "2", charPrIDRef: "2", styleIDRef: "0" });
    expect(grammar.roles.bullet?.paragraphMargins.intent).toBe(-1800);
    expect(grammar.roles.categoryHeading?.reason).toContain("readable");
    expect(grammar.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("tiny heading"),
        expect.stringContaining("red guide")
      ])
    );
  });

  it("infers one-cell structure table motifs separately from data tables", () => {
    const profile = analyzeHwpxFormatProfile(createHeader(), createMotifSection());
    const grammar = analyzeHwpxFormatGrammar(profile, { titleTableCount: 1 });

    expect(grammar.bodyTableTemplates).toEqual([
      expect.objectContaining({ order: 5, rowCount: 1, colCount: 2 })
    ]);
    expect(grammar.tableMotifs).toMatchObject({
      leadHeading: { order: 1, rowCount: 1, colCount: 1, text: "세계 환경의 날(6월 5일)" },
      pageHeading: { order: 2, rowCount: 1, colCount: 1, text: "탄소중립 정보공유" },
      newsTitle: { order: 3, rowCount: 1, colCount: 1, text: "한국환경공단, 지속가능경영보고서 발간" },
      categoryHeading: { order: 4, rowCount: 1, colCount: 1, text: "센터 소식" }
    });
  });

  it("normalizes non-bullet hanging indents without borrowing centered title-table paragraphs", () => {
    const profile = analyzeHwpxFormatProfile(createNegativeHeadingHeader(), createNegativeHeadingSection());
    const grammar = analyzeHwpxFormatGrammar(profile, { titleTableCount: 1 });

    expect(grammar.roles.bodyHeading?.sampleText).toBe("1. 샘플 제목");
    expect(grammar.roles.bodyHeading?.style).toEqual({ paraPrIDRef: "0", charPrIDRef: "20", styleIDRef: "0" });
    expect(grammar.roles.bodyHeading?.paragraphMargins.intent).toBe(0);
    expect(grammar.roles.bodyHeading?.reason).toContain("normalized non-bullet indent");
    expect(grammar.roles.bullet?.style).toEqual({ paraPrIDRef: "27", charPrIDRef: "8", styleIDRef: "0" });
  });

  it("normalizes generated body roles away from non-black sample character styles", () => {
    const profile = analyzeHwpxFormatProfile(createBlueHeadingHeader(), createBlueHeadingSection());
    const grammar = analyzeHwpxFormatGrammar(profile, { titleTableCount: 1 });

    expect(grammar.roles.bodyHeading?.sampleText).toBe("1. 파란 샘플 제목");
    expect(grammar.roles.bodyHeading?.style).toEqual({ paraPrIDRef: "0", charPrIDRef: "9", styleIDRef: "0" });
    expect(grammar.roles.bodyHeading?.textColor).toBe("#000000");
    expect(grammar.roles.bodyHeading?.reason).toContain("normalized generated text color");
  });

  it("does not use page labels or the heading sample as the body paragraph style", () => {
    const profile = analyzeHwpxFormatProfile(createPageLabelHeader(), createPageLabelSection());
    const grammar = analyzeHwpxFormatGrammar(profile, { titleTableCount: 0 });

    expect(grammar.roles.bodyHeading?.sampleText).toBe("세계 환경의 날(6월 5일)");
    expect(grammar.roles.bodyParagraph?.sampleText).toBe("○ 샘플 본문 내용");
    expect(grammar.roles.bodyParagraph?.style.charPrIDRef).toBe("8");
    expect(grammar.roles.bodyParagraph?.style.paraPrIDRef).toBe("0");
    expect(grammar.roles.bodyParagraph?.sampleText).not.toBe(grammar.roles.bodyHeading?.sampleText);
    expect(grammar.roles.bodyParagraph?.sampleText).not.toBe("&lt;1페이지&gt;");
  });
});

function createHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:fontfaces>
    <hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬돋움"/></hh:fontface>
  </hh:fontfaces>
  <hh:charProperties itemCnt="6">
    ${charPr("1", "1400", "0", "#000000", true)}
    ${charPr("2", "1000", "-5", "#000000", false)}
    ${charPr("3", "500", "0", "#000000", false)}
    ${charPr("4", "1200", "0", "#000000", true)}
    ${charPr("5", "1100", "0", "#FF0000", true)}
    ${charPr("6", "1100", "0", "#000000", true)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="6">
    ${paraPr("1", "0", "0", "0", "800", "300")}
    ${paraPr("2", "-1800", "0", "0", "0", "200")}
    ${paraPr("3", "0", "0", "0", "0", "0")}
    ${paraPr("4", "0", "0", "0", "1600", "400")}
    ${paraPr("5", "0", "0", "0", "0", "0")}
    ${paraPr("6", "0", "0", "0", "600", "200")}
  </hh:paraProperties>
</hh:head>`;
}

function createSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList>
    ${paragraph("title", "1", "1", "울산광역시 탄소중립지원센터 BRIEF", 0, 1400, 0)}
  </hp:subList></hp:tc></hp:tr></hp:tbl>
  ${paragraph("heading", "1", "1", "1. 정상 제목", 1800, 1400, 0)}
  ${paragraph("tiny-center", "3", "3", "센터 소식", 3800, 500, 0)}
  ${paragraph("category", "4", "4", "전국 소식", 4600, 1200, 0)}
  ${paragraph("guide", "4", "4", "&lt;전국소식 안내문&gt;", 5400, 1200, 0)}
  ${paragraph("news-title", "6", "6", "샘플 뉴스 제목", 6600, 1100, 0)}
  ${paragraph("bullet", "2", "2", "○ 샘플 글머리", 8000, 1000, 0)}
  ${paragraph("red-guide", "5", "5", "빨간 안내 스타일", 8000, 1100, 0)}
  <hp:tbl id="body-table" rowCnt="1" colCnt="2"><hp:tr><hp:tc><hp:subList>
    ${paragraph("table-p", "2", "2", "샘플 표", 0, 1000, 1)}
  </hp:subList></hp:tc><hp:tc><hp:subList>
    ${paragraph("table-p-2", "2", "2", "값", 0, 1000, 1)}
  </hp:subList></hp:tc></hp:tr></hp:tbl>
</hs:sec>`;
}

function createMotifSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  ${oneCellTable("title-table", "울산광역시 탄소중립지원센터 BRIEF")}
  ${oneCellTable("lead-table", "세계 환경의 날(6월 5일)")}
  ${oneCellTable("page-table", "탄소중립 정보공유")}
  ${oneCellTable("news-table", "한국환경공단, 지속가능경영보고서 발간")}
  ${oneCellTable("category-table", "센터 소식")}
  <hp:tbl id="data-table" rowCnt="1" colCnt="2"><hp:tr>
    <hp:tc><hp:subList>${paragraph("data-1", "2", "2", "구분", 0, 1000, 1)}</hp:subList></hp:tc>
    <hp:tc><hp:subList>${paragraph("data-2", "2", "2", "기준", 0, 1000, 1)}</hp:subList></hp:tc>
  </hp:tr></hp:tbl>
</hs:sec>`;
}

function oneCellTable(id: string, text: string): string {
  return `<hp:tbl id="${id}" rowCnt="1" colCnt="1"><hp:tr><hp:tc><hp:subList>
    ${paragraph(`${id}-p`, "1", "1", text, 0, 1200, 1)}
  </hp:subList></hp:tc></hp:tr></hp:tbl>`;
}

function charPr(id: string, height: string, spacing: string, color: string, bold: boolean): string {
  return `<hh:charPr id="${id}" height="${height}" textColor="${color}"><hh:fontRef hangul="0"/><hh:ratio hangul="100"/><hh:spacing hangul="${spacing}"/>${bold ? "<hh:bold/>" : ""}</hh:charPr>`;
}

function paraPr(id: string, intent: string, left: string, right: string, prev: string, next: string): string {
  return `<hh:paraPr id="${id}" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="${intent}"/><hc:left value="${left}"/><hc:right value="${right}"/><hc:prev value="${prev}"/><hc:next value="${next}"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>`;
}

function paragraph(
  id: string,
  paraPrIDRef: string,
  charPrIDRef: string,
  text: string,
  vertPos: number,
  textHeight: number,
  tableOrdinal: number
): string {
  return `<hp:p id="${id}" paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPrIDRef}"><hp:t>${text}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertPos}" vertsize="${textHeight}" textheight="${textHeight}" baseline="${Math.round(textHeight * 0.85)}" spacing="${Math.round(textHeight * 0.6)}" horzpos="${tableOrdinal * 100}" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`;
}

function createNegativeHeadingHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:fontfaces>
    <hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬돋움"/></hh:fontface>
  </hh:fontfaces>
  <hh:charProperties itemCnt="4">
    ${charPr("7", "1600", "0", "#000000", true)}
    ${charPr("8", "1000", "0", "#000000", false)}
    ${charPr("9", "1200", "0", "#000000", true)}
    ${charPr("20", "1200", "0", "#000000", true)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="3">
    ${paraPrWithAlign("19", "CENTER", "0")}
    ${paraPrWithAlign("27", "JUSTIFY", "-1448")}
    ${paraPrWithAlign("0", "JUSTIFY", "0")}
  </hh:paraProperties>
</hh:head>`;
}

function createNegativeHeadingSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList>
    ${paragraph("title", "19", "7", "울산광역시 탄소중립지원센터 BRIEF", 0, 1600, 0)}
  </hp:subList></hp:tc></hp:tr></hp:tbl>
  ${paragraph("heading", "27", "20", "1. 샘플 제목", 1800, 1200, 0)}
  ${paragraph("page-heading", "0", "9", "탄소중립 정보공유", 3200, 1200, 0)}
  ${paragraph("bullet", "27", "8", "○ 샘플 글머리", 4600, 1000, 0)}
</hs:sec>`;
}

function paraPrWithAlign(id: string, align: string, intent: string): string {
  return `<hh:paraPr id="${id}" tabPrIDRef="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:margin><hc:intent value="${intent}"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>`;
}

function createBlueHeadingHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:fontfaces>
    <hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬돋움"/></hh:fontface>
  </hh:fontfaces>
  <hh:charProperties itemCnt="3">
    ${charPr("7", "1600", "0", "#000000", true)}
    ${charPr("9", "1300", "0", "#000000", false)}
    ${charPr("22", "1300", "0", "#0000FF", false)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="2">
    ${paraPrWithAlign("19", "CENTER", "0")}
    ${paraPrWithAlign("0", "JUSTIFY", "0")}
  </hh:paraProperties>
</hh:head>`;
}

function createBlueHeadingSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList>
    ${paragraph("title", "19", "7", "울산광역시 탄소중립지원센터 BRIEF", 0, 1600, 0)}
  </hp:subList></hp:tc></hp:tr></hp:tbl>
  ${paragraph("blue-heading", "0", "22", "1. 파란 샘플 제목", 1800, 1300, 0)}
  ${paragraph("black-body", "0", "9", "검정 샘플 본문", 3400, 1300, 0)}
</hs:sec>`;
}

function createPageLabelHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:fontfaces>
    <hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬돋움"/></hh:fontface>
  </hh:fontfaces>
  <hh:charProperties itemCnt="3">
    ${charPr("7", "1600", "0", "#000000", true)}
    ${charPr("8", "1000", "0", "#000000", false)}
    ${charPr("22", "1300", "0", "#0000FF", false)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="2">
    ${paraPrWithAlign("0", "JUSTIFY", "0")}
    ${paraPrWithAlign("27", "JUSTIFY", "-1448")}
  </hh:paraProperties>
</hh:head>`;
}

function createPageLabelSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  ${paragraph("title", "0", "7", "울산광역시 탄소중립지원센터 BRIEF", 0, 1600, 0)}
  ${paragraph("issue", "0", "7", "통권 제5호(2025년 6-7월)", 1800, 1300, 0)}
  ${paragraph("page-label", "0", "8", "&lt;1페이지&gt;", 3200, 1000, 0)}
  ${paragraph("blue-heading", "0", "22", "세계 환경의 날(6월 5일)", 4600, 1300, 0)}
  ${paragraph("short-heading", "0", "22", "배경", 6200, 1300, 0)}
  ${paragraph("bullet", "27", "8", "○ 샘플 본문 내용", 7800, 1000, 0)}
</hs:sec>`;
}
