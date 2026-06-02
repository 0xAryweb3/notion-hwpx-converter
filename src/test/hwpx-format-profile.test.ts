import { describe, expect, it } from "vitest";
import { analyzeHwpxFormatProfile } from "../features/hwpx/formatProfile";

describe("analyzeHwpxFormatProfile", () => {
  it("extracts page, character, paragraph, table, cell, and slot metrics", () => {
    const profile = analyzeHwpxFormatProfile(createHeaderXml(), createSectionXml());

    expect(profile.page).toEqual({
      landscape: "WIDELY",
      width: 59528,
      height: 84186,
      margins: { header: 4252, footer: 4252, gutter: 0, left: 8504, right: 8504, top: 5668, bottom: 4252 },
      contentWidth: 42520,
      contentHeight: 74266
    });
    expect(profile.counts).toMatchObject({
      paragraphStyles: 1,
      characterStyles: 1,
      borderFills: 1,
      tables: 1,
      cells: 1,
      textSlots: 2,
      images: 1
    });
    expect(profile.characterStyles[0]).toMatchObject({
      id: "7",
      fontFace: "한컴산뜻돋움",
      fontSizePt: 16,
      charSpacing: -3,
      widthRatio: 95,
      bold: true,
      textColor: "#111111"
    });
    expect(profile.paragraphStyles[0]).toMatchObject({
      id: "19",
      tabPrIDRef: "3",
      borderFillIDRef: "2",
      align: { horizontal: "CENTER", vertical: "BASELINE" },
      margins: { intent: 0, left: 100, right: 200, prev: 300, next: 400 },
      lineSpacing: { type: "PERCENT", value: 160 }
    });
    expect(profile.tables[0]).toMatchObject({
      order: 0,
      rowCount: 1,
      colCount: 1,
      text: "울산광역시 탄소중립지원센터 BRIEF",
      paragraphCount: 1,
      width: 41954,
      height: 4471,
      cellCount: 1,
      firstCell: {
        width: 41954,
        height: 4471,
        margin: { left: 510, right: 510, top: 141, bottom: 141 },
        borderFillIDRef: "3"
      }
    });
    expect(profile.textSlots[0]).toMatchObject({
      ordinal: 0,
      text: "울산광역시 탄소중립지원센터 BRIEF",
      paraPrIDRef: "19",
      styleIDRef: "0",
      charPrIDRef: "7",
      insideTable: true,
      line: {
        textHeight: 1600,
        baseline: 1360,
        spacing: 960,
        horzPos: 0,
        horzSize: 40932
      }
    });
    expect(profile.textSlots[1]).toMatchObject({
      ordinal: 1,
      text: "본문 슬롯",
      paraPrIDRef: "19",
      charPrIDRef: "7",
      insideTable: false
    });
  });
});

function createHeaderXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:fontfaces>
    <hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="2" face="한컴산뜻돋움"/></hh:fontface>
  </hh:fontfaces>
  <hh:borderFills itemCnt="1">
    <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"/>
  </hh:borderFills>
  <hh:charProperties itemCnt="1">
    <hh:charPr id="7" height="1600" textColor="#111111" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">
      <hh:fontRef hangul="2" latin="2" hanja="2" japanese="2" other="2" symbol="2" user="2"/>
      <hh:ratio hangul="95" latin="95" hanja="95" japanese="95" other="95" symbol="95" user="95"/>
      <hh:spacing hangul="-3" latin="-3" hanja="-3" japanese="-3" other="-3" symbol="-3" user="-3"/>
      <hh:bold/>
      <hh:underline type="NONE" shape="SOLID" color="#000000"/>
    </hh:charPr>
  </hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="19" tabPrIDRef="3" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
      <hh:align horizontal="CENTER" vertical="BASELINE"/>
      <hp:switch>
        <hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">
          <hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="100" unit="HWPUNIT"/><hc:right value="200" unit="HWPUNIT"/><hc:prev value="300" unit="HWPUNIT"/><hc:next value="400" unit="HWPUNIT"/></hh:margin>
          <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
        </hp:case>
      </hp:switch>
      <hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0"/>
    </hh:paraPr>
  </hh:paraProperties>
</hh:head>`;
}

function createSectionXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hp:p id="0" paraPrIDRef="19" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="7">
      <hp:secPr id="" textDirection="HORIZONTAL">
        <hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY">
          <hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>
        </hp:pagePr>
      </hp:secPr>
      <hp:tbl id="1" rowCnt="1" colCnt="1" borderFillIDRef="3">
        <hp:sz width="41954" widthRelTo="ABSOLUTE" height="4471" heightRelTo="ABSOLUTE" protect="0"/>
        <hp:inMargin left="510" right="510" top="141" bottom="141"/>
        <hp:tr>
          <hp:tc borderFillIDRef="3">
            <hp:subList>
              <hp:p id="1" paraPrIDRef="19" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
                <hp:run charPrIDRef="7"><hp:t>울산광역시 탄소중립지원센터 BRIEF</hp:t></hp:run>
                <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1600" textheight="1600" baseline="1360" spacing="960" horzpos="0" horzsize="40932" flags="393216"/></hp:linesegarray>
              </hp:p>
            </hp:subList>
            <hp:cellSz width="41954" height="4471"/>
            <hp:cellMargin left="510" right="510" top="141" bottom="141"/>
          </hp:tc>
        </hp:tr>
      </hp:tbl>
      <hp:pic id="picture-1"><hc:img binaryItemIDRef="image1"/></hp:pic>
    </hp:run>
  </hp:p>
  <hp:p id="2" paraPrIDRef="19" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="7"><hp:t>본문 슬롯</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="2600" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`;
}
