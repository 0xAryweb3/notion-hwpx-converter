import { describe, expect, it } from "vitest";
import { analyzeHwpxVisualDogfood, renderVisualDogfoodSvg } from "../features/hwpx/visualDogfood";

describe("HWPX visual dogfood audit", () => {
  it("extracts visual paragraph styles and reports user-visible layout risks", () => {
    const report = analyzeHwpxVisualDogfood(createHeader(), createSection());

    expect(report.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      "표지",
      "1. 파란 제목",
      "○ 내어쓰기 글머리",
      "2. 다음 제목",
      "겹치는 본문"
    ]);
    expect(report.paragraphs[1]).toMatchObject({
      textColor: "#0000FF",
      fontSizePt: 10,
      insideTable: false
    });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "non-black-generated-text", severity: "error" }),
      expect.objectContaining({ code: "bullet-negative-indent-style", severity: "error" }),
      expect.objectContaining({ code: "missing-blank-after-bullet-group", severity: "warning" }),
      expect.objectContaining({ code: "vertical-overlap-risk", severity: "warning" })
    ]));
  });

  it("renders an SVG preview with paragraph text and diagnostics", () => {
    const report = analyzeHwpxVisualDogfood(createHeader(), createSection());
    const svg = renderVisualDogfoodSvg(report);

    expect(svg).toContain("<svg");
    expect(report.tables).toEqual([
      expect.objectContaining({
        text: "표지",
        rowCount: 1,
        colCount: 1,
        insideAnchor: false
      })
    ]);
    expect(svg).toContain("1. 파란 제목");
    expect(svg).toContain("Table motifs (1)");
    expect(svg).toContain("표지");
    expect(svg).toContain("#0000FF");
    expect(svg).toContain("visual-dogfood-issue");
  });

  it("renders table text that is invisible in top-level paragraph previews", () => {
    const report = analyzeHwpxVisualDogfood(createHeader(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="title-anchor" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:tbl rowCnt="1" colCnt="1"><hp:sz width="20000" height="3000"/><hp:tr><hp:tc><hp:subList>${paragraph("title", "1", "1", "울산광역시 탄소중립지원센터 BRIEF", 0)}</hp:subList></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="3000" textheight="3000" baseline="2550" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
  <hp:tbl rowCnt="1" colCnt="1"><hp:sz width="20000" height="2000"/><hp:tr><hp:tc><hp:subList>${paragraph("section", "1", "1", "탄소중립 정보공유", 0)}</hp:subList></hp:tc></hp:tr></hp:tbl>
  ${paragraph("body", "1", "3", "본문", 3600)}
</hs:sec>`);
    const svg = renderVisualDogfoodSvg(report);

    expect(report.tables.map((table) => table.text)).toEqual([
      "울산광역시 탄소중립지원센터 BRIEF",
      "탄소중립 정보공유"
    ]);
    expect(report.summary.tables).toBe(2);
    expect(report.tables[0]).toMatchObject({ insideAnchor: true, rowCount: 1, colCount: 1 });
    expect(svg).toContain("울산광역시 탄소중립지원센터");
    expect(svg).toContain("탄소중립 정보공유");
    expect(svg).toContain(">탄소중립 정보공유</text>");
  });

  it("does not report overlap when a generated paragraph starts on a new page", () => {
    const report = analyzeHwpxVisualDogfood(createHeaderWithJustifyBody(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  ${paragraph("first-page", "1", "3", "첫 페이지 마지막 문단", 7000, { textHeight: 1000, spacing: 600 })}
  ${paragraph("second-page", "1", "3", "둘째 페이지 첫 문단", 0, { pageBreak: true, textHeight: 1000, spacing: 600 })}
</hs:sec>`);

    expect(report.issues).not.toContainEqual(expect.objectContaining({
      code: "vertical-overlap-risk"
    }));
    expect(report.paragraphs.find((paragraph) => paragraph.text === "둘째 페이지 첫 문단")).toMatchObject({
      pageIndex: 1
    });
  });

  it("audits direct top-level paragraph geometry separately from nested title-table text", () => {
    const report = analyzeHwpxVisualDogfood(createHeader(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="title-anchor" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:tbl><hp:tr><hp:tc><hp:subList>${paragraph("title", "1", "1", "표지", 0)}</hp:subList></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="3000" textheight="3000" baseline="2550" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
  ${paragraph("body", "1", "3", "본문", 3600)}
</hs:sec>`);

    const title = report.paragraphs.find((paragraph) => paragraph.text === "표지");
    const body = report.paragraphs.find((paragraph) => paragraph.text === "본문");

    expect(title).toMatchObject({ insideTable: true });
    expect(body).toMatchObject({ insideTable: false, topLevel: true });
    expect(report.issues).not.toContainEqual(expect.objectContaining({
      code: "vertical-overlap-risk"
    }));
  });

  it("reports wrapped bullet lines that continue at the bullet marker instead of the text indent", () => {
    const report = analyzeHwpxVisualDogfood(createHeaderWithPositiveBulletIndent(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="bad-bullet" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="3"><hp:t>○ 긴 글머리 문단은 둘째 줄부터 글머리 기호가 아니라 본문 글자 위치에 맞춰야 합니다</hp:t></hp:run>
    <hp:linesegarray>
      <hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="1448" horzsize="41072" flags="393216"/>
      <hp:lineseg textpos="28" vertpos="1600" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="1448" horzsize="41072" flags="1441792"/>
    </hp:linesegarray>
  </hp:p>
</hs:sec>`);

    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "bullet-continuation-indent-risk",
      severity: "warning"
    }));
  });

  it("reports generated justify paragraphs that can stretch word spacing", () => {
    const report = analyzeHwpxVisualDogfood(createHeaderWithJustifyBody(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  ${paragraph("justify-body", "1", "3", "단어 사이 공백이 과하게 늘어나면 안 됩니다", 0)}
</hs:sec>`);

    expect(report.paragraphs[0]?.alignHorizontal).toBe("JUSTIFY");
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "justify-spacing-risk",
      severity: "warning"
    }));
    expect(report.summary.justifySpacingRiskCount).toBe(1);
  });
});

function createHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="3">
    <hh:charPr id="1" height="1600" textColor="#000000"><hh:fontRef hangul="0"/><hh:spacing hangul="0"/></hh:charPr>
    <hh:charPr id="2" height="1000" textColor="#0000FF"><hh:fontRef hangul="0"/><hh:spacing hangul="0"/></hh:charPr>
    <hh:charPr id="3" height="1000" textColor="#000000"><hh:fontRef hangul="0"/><hh:spacing hangul="0"/></hh:charPr>
  </hh:charProperties>
  <hh:paraProperties itemCnt="3">
    <hh:paraPr id="1"><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin></hh:paraPr>
    <hh:paraPr id="2"><hh:margin><hc:intent value="-1600"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin></hh:paraPr>
    <hh:paraPr id="3"><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin></hh:paraPr>
  </hh:paraProperties>
</hh:head>`;
}

function createHeaderWithPositiveBulletIndent(): string {
  return createHeader()
    .replace("</hh:paraProperties>", '<hh:paraPr id="4"><hh:margin><hc:intent value="0"/><hc:left value="1448"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin></hh:paraPr></hh:paraProperties>')
    .replace('<hh:paraProperties itemCnt="3">', '<hh:paraProperties itemCnt="4">');
}

function createHeaderWithJustifyBody(): string {
  return createHeader().replace(
    '<hh:paraPr id="1"><hh:margin>',
    '<hh:paraPr id="1"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin>'
  );
}

function createSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList>
    ${paragraph("title", "1", "1", "표지", 0)}
  </hp:subList></hp:tc></hp:tr></hp:tbl>
  ${paragraph("heading", "1", "2", "1. 파란 제목", 2000)}
  ${paragraph("bullet", "2", "3", "○ 내어쓰기 글머리", 3600)}
  ${paragraph("next-heading", "1", "3", "2. 다음 제목", 5200)}
  ${paragraph("overlap", "3", "3", "겹치는 본문", 5700)}
</hs:sec>`;
}

function paragraph(
  id: string,
  paraPrIDRef: string,
  charPrIDRef: string,
  text: string,
  vertPos: number,
  options: { pageBreak?: boolean; textHeight?: number; spacing?: number } = {}
): string {
  const textHeight = options.textHeight ?? 1000;
  const spacing = options.spacing ?? 600;

  return `<hp:p id="${id}" paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="${options.pageBreak === true ? "1" : "0"}" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPrIDRef}"><hp:t>${text}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertPos}" vertsize="${textHeight}" textheight="${textHeight}" baseline="${Math.round(textHeight * 0.85)}" spacing="${spacing}" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`;
}
