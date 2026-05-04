import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeGenerationQuality } from "../features/hwpx/quality";
import { loadHwpxTemplate } from "../features/hwpx/template";
import type { DocumentBlock } from "../features/document/types";

describe("analyzeGenerationQuality", () => {
  it("reports preserved title tables and removed body tables when input has no table rows", () => {
    const template = loadHwpxTemplate(createTemplateZip());

    expect(analyzeGenerationQuality(template, [{ id: "block-1", role: "body", text: "본문" }])).toMatchObject({
      inputTableGroupCount: 0,
      inputTableRowCount: 0
    });
    expect(analyzeGenerationQuality(template, [{ id: "block-1", role: "body", text: "본문" }]).issues).toEqual(
      expect.arrayContaining([
        { severity: "info", message: "샘플 제목 표 1개를 유지합니다." },
        { severity: "info", message: "입력에 표 행이 없어 샘플 본문 표는 제거합니다." },
        { severity: "info", message: "샘플 서식 분석: 페이지 여백, 문단 스타일, 글자 스타일, 표/셀 수치를 읽었습니다." }
      ])
    );
  });

  it("warns when input has table rows but the sample has no body table", () => {
    const template = loadHwpxTemplate(createNoBodyTableTemplateZip());
    const blocks: DocumentBlock[] = [
      { id: "block-1", role: "tableRow", text: "구분\t기준" },
      { id: "block-2", role: "tableRow", text: "달성\t목표 달성" }
    ];

    expect(analyzeGenerationQuality(template, blocks).issues).toContainEqual({
      severity: "warning",
      message: "입력에는 표가 있지만 샘플 본문 표가 없어 가까운 문단 슬롯에 텍스트로 배치됩니다."
    });
  });

  it("reports dropped sample images and source image placement", () => {
    const template = loadHwpxTemplate(createTemplateWithImageZip());
    const blocks: DocumentBlock[] = [
      {
        id: "block-1",
        role: "image",
        text: "차트",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "chart.png",
          mimeType: "image/png",
          bytes: new Uint8Array([1])
        }
      }
    ];

    expect(analyzeGenerationQuality(template, blocks).issues).toContainEqual({
      severity: "info",
      message: "샘플 이미지는 텍스트가 박혀 있을 수 있어 기본 제거하고, 입력 이미지 1개를 새 이미지로 배치합니다."
    });
  });

  it("warns when source images have no downloadable bytes", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const blocks: DocumentBlock[] = [
      {
        id: "block-1",
        role: "image",
        text: "원격 이미지",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "remote.png",
          mimeType: "image/png",
          url: "https://example.com/remote.png"
        }
      }
    ];

    expect(analyzeGenerationQuality(template, blocks).issues).toContainEqual({
      severity: "warning",
      message: "입력 이미지 1개는 파일 바이트가 없어 이번 HWPX에는 배치하지 않습니다."
    });
  });

  it("warns when page margins are missing from the sample", () => {
    const template = loadHwpxTemplate(createNoPageTemplateZip());

    expect(analyzeGenerationQuality(template, [{ id: "block-1", role: "body", text: "본문" }]).issues).toContainEqual({
      severity: "warning",
      message: "샘플 페이지 여백을 찾지 못했습니다. 출력 문서 여백 재현이 제한됩니다."
    });
  });

  it("reports source-to-sample style assignments for UI inspection", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const report = analyzeGenerationQuality(template, [
      { id: "block-1", role: "body", text: "탄소중립 정보공유" },
      { id: "block-2", role: "body", text: "센터 소식" },
      { id: "block-3", role: "dashItem", text: "- 새 센터 제목" },
      { id: "block-4", role: "dashItem", text: "- 새 센터 본문" }
    ]);

    expect(report.assignmentRows.map((row) => row.grammarRole)).toEqual([
      "pageHeading",
      "categoryHeading",
      "newsTitle",
      "newsBullet"
    ]);
    expect(report.assignmentRows[2]).toMatchObject({
      sourceText: "새 센터 제목",
      outputText: "새 센터 제목",
      type: "paragraph",
      reason: expect.any(String)
    });
    expect(report.assignmentRows[3]).toMatchObject({
      outputText: "○ 새 센터 본문"
    });
  });

  it("labels bullet indentation as output indentation instead of negative hanging indent", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const report = analyzeGenerationQuality(template, [
      { id: "block-1", role: "dashItem", text: "- 새 글머리" }
    ]);

    expect(report.assignmentRows[0]).toMatchObject({
      grammarRole: "bullet",
      outputText: "○ 새 글머리",
      textColor: "#000000",
      indent: -1448,
      indentKind: "bullet",
      indentValue: 1448,
      indentLabel: "글머리 들여쓰기 1,448hu"
    });
  });
});

function createTemplateZip(): Uint8Array {
  return zipSync({
    "Contents/header.xml": new Uint8Array(strToU8(createHeader())),
    "Contents/section0.xml": new Uint8Array(strToU8(createSection(true)))
  });
}

function createNoBodyTableTemplateZip(): Uint8Array {
  return zipSync({
    "Contents/header.xml": new Uint8Array(strToU8(createHeader())),
    "Contents/section0.xml": new Uint8Array(strToU8(createSection(false)))
  });
}

function createNoPageTemplateZip(): Uint8Array {
  return zipSync({
    "Contents/header.xml": new Uint8Array(strToU8("<hh:head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="body" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>본문</hp:t></hp:run></hp:p>
</hs:sec>`))
  });
}

function createTemplateWithImageZip(): Uint8Array {
  return zipSync({
    "Contents/header.xml": new Uint8Array(strToU8(createHeader())),
    "Contents/section0.xml": new Uint8Array(strToU8(createSection(true).replace(
      "</hs:sec>",
      '<hp:p id="image-p" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:pic id="1"><hc:img binaryItemIDRef="image1"/></hp:pic></hp:run></hp:p></hs:sec>'
    )))
  });
}

function createHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:borderFills itemCnt="1"><hh:borderFill id="2"/></hh:borderFills>
  <hh:charProperties itemCnt="1"><hh:charPr id="1" height="1000" textColor="#000000"><hh:fontRef hangul="0"/><hh:spacing hangul="0"/><hh:ratio hangul="100"/></hh:charPr></hh:charProperties>
  <hh:paraProperties itemCnt="2">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/><hh:border borderFillIDRef="2"/></hh:paraPr>
    <hh:paraPr id="2" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="-1448"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/><hh:border borderFillIDRef="2"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`;
}

function createSection(includeBodyTable: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hp:p id="page" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:secPr id=""><hp:pagePr landscape="WIDELY" width="59528" height="84186"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr></hp:secPr></hp:run></hp:p>
  <hp:tbl id="title"><hp:tr><hp:tc><hp:subList><hp:p id="title-p" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>제목</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl>
  <hp:p id="body" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>본문 제목</hp:t></hp:run></hp:p>
  <hp:p id="bullet" paraPrIDRef="2" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>○ 샘플 글머리</hp:t></hp:run></hp:p>
  ${
    includeBodyTable
      ? '<hp:tbl id="body-table"><hp:tr><hp:tc><hp:subList><hp:p id="table-p" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>표</hp:t></hp:run></hp:p></hp:subList></hp:tc><hp:tc><hp:subList><hp:p id="table-p2" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>본문</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl>'
      : ""
  }
</hs:sec>`;
}
