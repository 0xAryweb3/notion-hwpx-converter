import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { generateHwpx } from "../features/hwpx/render";
import { loadHwpxTemplate } from "../features/hwpx/template";
import type { DocumentBlock } from "../features/document/types";

describe("HWPX rendering", () => {
  it("loads template files and infers paragraph styles", () => {
    const template = loadHwpxTemplate(createTemplateZip());

    expect(template.files["Contents/header.xml"]).toBeDefined();
    expect(template.styleMap.title).toEqual({ paraPrIDRef: "58", charPrIDRef: "63", styleIDRef: "1" });
    expect(template.styleMap.section).toEqual({ paraPrIDRef: "53", charPrIDRef: "39", styleIDRef: "0" });
    expect(template.styleMap.koreanItem).toEqual({ paraPrIDRef: "55", charPrIDRef: "57", styleIDRef: "19" });
    expect(template.styleMap.dashItem).toEqual({ paraPrIDRef: "64", charPrIDRef: "9", styleIDRef: "0" });
    expect(template.formatProfile.page?.contentWidth).toBe(59528);
    expect(template.formatProfile.textSlots.length).toBe(8);
  });

  it("uses sample body structure as a fallback when numeric headings are absent", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());

    expect(template.styleMap.section).toEqual({ paraPrIDRef: "72", charPrIDRef: "83", styleIDRef: "0" });
    expect(template.styleMap.dashItem).toEqual({ paraPrIDRef: "73", charPrIDRef: "87", styleIDRef: "0" });
    expect(template.analysis).toEqual({
      paragraphCount: 8,
      tableCount: 3,
      leadingTitleTableCount: 2,
      bodyTableCount: 1
    });
    expect(template.styleDetails.section).toEqual({
      fontSizePt: 12,
      textColor: "#000000",
      charSpacing: 0,
      bold: false
    });
    expect(template.formatProfile.tables).toHaveLength(3);
    expect(template.formatProfile.textSlots.length).toBeGreaterThan(0);
  });

  it("generates a new HWPX while preserving non-section package files", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const blocks: DocumentBlock[] = [
      { id: "block-1", role: "title", text: "새 입찰 공고" },
      { id: "block-2", role: "section", text: "1. 새 입찰내용" },
      { id: "block-3", role: "koreanItem", text: "  가. 용역기간: 3개월" }
    ];

    const output = unzipSync(generateHwpx(template, blocks));

    expect(strFromU8(output["mimetype"])).toBe("application/hwp+zip");
    expect(strFromU8(output["Contents/header.xml"])).toBe("<head />");
    expect(strFromU8(output["Preview/PrvText.txt"])).toBe("새 입찰 공고\r\n1. 새 입찰내용\r\n  가. 용역기간: 3개월");
    expect(strFromU8(output["Contents/section0.xml"])).toContain("새 입찰 공고");
    expect(strFromU8(output["Contents/section0.xml"])).toContain('paraPrIDRef="53"');
  });

  it("escapes XML text in generated paragraphs", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [{ id: "block-1", role: "body", text: "A & B <C>" }])
    );

    expect(strFromU8(output["Contents/section0.xml"])).toContain("A &amp; B &lt;C&gt;");
  });

  it("emits fresh line layout caches for generated wrapped paragraphs", () => {
    const template = loadHwpxTemplate(createTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        {
          id: "block-1",
          role: "body",
          text: "울산광역시는 기후위기 대응 역량 강화를 위해 긴 본문을 여러 줄로 자연스럽게 배치해야 하며 문단 흐름이 겹치지 않아야 하고 다음 문단도 안정적으로 이어져야 합니다."
        },
        { id: "block-2", role: "dashItem", text: "- 다음 문단이 앞 문단과 겹치면 안 됩니다." }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:linesegarray>/g)?.length).toBe(2);
    expect(sectionXml.match(/<hp:lineseg\b/g)?.length).toBeGreaterThan(2);
    expect(sectionXml).toContain('vertpos="0"');
    expect(sectionXml).toContain('flags="1441792"');
  });

  it("prefers whitespace boundaries when placing wrapped line positions", () => {
    const template = loadHwpxTemplate(createNarrowWrapTemplateZip());
    const text = "alpha beta gamma delta";
    const output = unzipSync(generateHwpx(template, [{ id: "block-1", role: "body", text }]));
    const paragraph = paragraphXmlByText(sectionXmlFromOutput(output), text);
    const textPositions = Array.from(paragraph.matchAll(/<hp:lineseg\b[^>]*\btextpos="(\d+)"/g), (match) =>
      Number.parseInt(match[1] ?? "0", 10)
    );

    expect(textPositions.length).toBeGreaterThan(1);
    expect(textPositions[1]).toBe("alpha beta ".length);
  });

  it("does not force short orphan continuation lines for sample-width Korean bullets", () => {
    const template = loadHwpxTemplate(withSectionReplacement(
      withHeaderReplacement(
        withHeaderReplacement(
          createBulletTitleRegionTemplateZip(),
          'id="2" height="1000"',
          'id="2" height="1200"'
        ),
        '<hc:intent value="-1800"',
        '<hc:intent value="-1448"'
      ),
      'horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>\n</hs:sec>',
      'horzsize="40932" flags="393216"/></hp:linesegarray></hp:p>\n</hs:sec>'
    ));
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        { id: "block-2", role: "dashItem", text: "- 울산광역시 탄소중립을 위한 효과적인 성과관리 및 책임성 확보함" }
      ])
    );
    const paragraph = paragraphXmlByText(sectionXmlFromOutput(output), "○ 울산광역시 탄소중립을 위한 효과적인 성과관리 및 책임성 확보함");

    expect(paragraph.match(/<hp:lineseg\b/g)?.length).toBe(1);
  });

  it("does not create a very short final line when wrapping generated bullets", () => {
    const template = loadHwpxTemplate(withHeaderReplacement(
      createBulletTitleRegionTemplateZip(),
      'id="2" height="1000"',
      'id="2" height="1200"'
    ));
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        { id: "block-2", role: "dashItem", text: "- 배출량 변화 및 부문별 기여도 분석 기반을 통해 울산형 감축 정책 수립 지원" }
      ])
    );
    const paragraph = paragraphXmlByText(sectionXmlFromOutput(output), "○ 배출량 변화 및 부문별 기여도 분석 기반을 통해 울산형 감축 정책 수립 지원");
    const linePositions = Array.from(paragraph.matchAll(/<hp:lineseg\b[^>]*\btextpos="(\d+)"/g), (match) =>
      Number.parseInt(match[1] ?? "0", 10)
    );
    const lastLineLength = "○ 배출량 변화 및 부문별 기여도 분석 기반을 통해 울산형 감축 정책 수립 지원".length - (linePositions.at(-1) ?? 0);

    expect(lastLineLength).toBeGreaterThan(8);
  });

  it("uses non-empty sample paragraphs instead of spacer paragraphs for generated line metrics", () => {
    const template = loadHwpxTemplate(createSpacerBeforeHeadingTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "본문" },
        { id: "block-3", role: "body", text: "센터 소식" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);
    const centerParagraph = sectionXml.match(/<hp:p\b[^>]*>[\s\S]*?센터 소식[\s\S]*?<\/hp:p>/)?.[0] ?? "";

    expect(centerParagraph).toContain('paraPrIDRef="20"');
    expect(centerParagraph).toContain('charPrIDRef="11"');
    expect(centerParagraph).toContain('textheight="1200"');
    expect(centerParagraph).not.toContain('textheight="500"');
  });

  it("applies sample paragraph spacing when generating fresh line layout caches", () => {
    const template = loadHwpxTemplate(createParagraphSpacingTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "첫 문단" },
        { id: "block-2", role: "title", text: "둘째 문단" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);
    const vertPositions = Array.from(sectionXml.matchAll(/<hp:lineseg\b[^>]*\bvertpos="(\d+)"/g), (match) =>
      Number.parseInt(match[1] ?? "0", 10)
    );

    expect(vertPositions.slice(0, 2)).toEqual([300, 4200]);
  });

  it("adds page breaks and resets line positions when generated content exceeds one page", () => {
    const template = loadHwpxTemplate(createPaginationTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        Array.from({ length: 10 }, (_, index) => ({
          id: `block-${index + 1}`,
          role: "body" as const,
          text: `본문 ${index + 1}`
        }))
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain('pageBreak="1"');
    expect(pageBreakParagraphVertPositions(sectionXml).some((vertPos) => vertPos <= 2000)).toBe(true);
  });

  it("uses the full section page height when paginating generated body after a title region", () => {
    const template = loadHwpxTemplate(createTitleRegionPaginationTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "표지" },
        { id: "block-2", role: "body", text: "첫 본문" },
        { id: "block-3", role: "body", text: "둘째 본문" },
        { id: "block-4", role: "body", text: "셋째 본문" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain('pageBreak="1"');
    expect(pageBreakParagraphVertPositions(sectionXml).some((vertPos) => vertPos <= 2000)).toBe(true);
  });

  it("starts generated body after the title region when no body template line exists", () => {
    const template = loadHwpxTemplate(createTitleOnlyTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        { id: "block-2", role: "body", text: "본문은 표지 아래에서 시작해야 합니다" }
      ])
    );
    const bodyParagraph = paragraphXmlByText(sectionXmlFromOutput(output), "본문은 표지 아래에서 시작해야 합니다");

    expect(firstLineVertPos(bodyParagraph)).toBeGreaterThan(3600);
  });

  it("uses at least the selected character height for generated line layout caches", () => {
    const template = loadHwpxTemplate(createLineHeightMismatchTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [{ id: "block-1", role: "section", text: "1. 큰 글자 제목" }])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);
    const paragraph = paragraphXmlByText(sectionXml, "1. 큰 글자 제목");

    expect(paragraph).toContain('charPrIDRef="2"');
    expect(paragraph).toContain('textheight="1600"');
  });

  it("does not reuse narrow sample slot widths for generated body headings", () => {
    const template = loadHwpxTemplate(createNarrowHeadingMetricsTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [{ id: "block-1", role: "section", text: "1. 자동 생성 제목은 일반 본문 폭을 사용해야 합니다" }])
    );
    const paragraph = paragraphXmlByText(sectionXmlFromOutput(output), "1. 자동 생성 제목은 일반 본문 폭을 사용해야 합니다");
    const horzSizes = Array.from(paragraph.matchAll(/<hp:lineseg\b[^>]*\bhorzsize="(\d+)"/g), (match) =>
      Number.parseInt(match[1] ?? "0", 10)
    );

    expect(horzSizes.every((horzSize) => horzSize >= 40000)).toBe(true);
  });

  it("rejects tiny sample center-heading styles for generated center section titles", () => {
    const template = loadHwpxTemplate(createTinyCenterHeadingTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
        { id: "block-3", role: "body", text: "센터 소식" },
        { id: "block-4", role: "dashItem", text: "- 울산‘탄소영감(Net-Zero) 실험실’프로젝트 참여자 모집" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(paragraphXmlByText(sectionXml, "센터 소식")).toContain('charPrIDRef="21"');
    expect(paragraphXmlByText(sectionXml, "센터 소식")).not.toContain('charPrIDRef="11"');
    expect(paragraphXmlByText(sectionXml, "울산‘탄소영감(Net-Zero) 실험실’프로젝트 참여자 모집")).not.toContain('charPrIDRef="10"');
    expect(paragraphXmlByText(sectionXml, "울산‘탄소영감(Net-Zero) 실험실’프로젝트 참여자 모집")).not.toContain('charPrIDRef="11"');
  });

  it("applies hanging indent to wrapped round-bullet continuation lines", () => {
    const template = loadHwpxTemplate(createBulletLayoutTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        {
          id: "block-1",
          role: "dashItem",
          text: "- 울산광역시는 기후위기 대응 역량 강화를 위해 긴 글머리 문단의 둘째 줄부터 들여쓰기를 유지해야 합니다."
        }
      ])
    );
    const paragraph = paragraphXmlContaining(sectionXmlFromOutput(output), "울산광역시는 기후위기 대응 역량 강화를 위해");
    const lineHorzPositions = Array.from(paragraph.matchAll(/<hp:lineseg\b[^>]*\bhorzpos="(\d+)"/g), (match) =>
      Number.parseInt(match[1] ?? "0", 10)
    );

    expect(lineHorzPositions[0]).toBe(0);
    expect(lineHorzPositions.slice(1).every((horzPos) => horzPos >= 1700)).toBe(true);
  });

  it("adds a paragraph break after a round-bullet group before the next heading", () => {
    const template = loadHwpxTemplate(createBulletLayoutTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "section", text: "1. 첫 제목" },
        { id: "block-2", role: "dashItem", text: "- 첫 글머리" },
        { id: "block-3", role: "section", text: "2. 다음 제목" },
        { id: "block-4", role: "dashItem", text: "- 다음 글머리" }
      ])
    );
    const sectionXml = sectionXmlFromOutput(output);
    const firstBulletBottom = firstLineVertPos(paragraphXmlByText(sectionXml, "○ 첫 글머리"));
    const nextHeadingTop = firstLineVertPos(paragraphXmlByText(sectionXml, "2. 다음 제목"));

    expect(nextHeadingTop - firstBulletBottom).toBeGreaterThanOrEqual(3000);
  });

  it("uses generated bullet paragraph styles with positive indent instead of hanging indent", () => {
    const template = loadHwpxTemplate(createBulletTitleRegionTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        { id: "block-2", role: "dashItem", text: "- 새 글머리 문단" }
      ])
    );
    const headerXml = strFromU8(output["Contents/header.xml"]);
    const sectionXml = strFromU8(output["Contents/section0.xml"]);
    const bulletParagraph = paragraphXmlByText(sectionXml, "○ 새 글머리 문단");
    const generatedParaPrId = bulletParagraph.match(/paraPrIDRef="([^"]+)"/)?.[1] ?? "";
    const generatedParaPr = headerXml.match(new RegExp(`<hh:paraPr\\b(?=[^>]*\\bid="${generatedParaPrId}")[\\s\\S]*?<\\/hh:paraPr>`))?.[0] ?? "";
    const firstHorzPos = Number.parseInt(
      bulletParagraph.match(/<hp:lineseg\b[^>]*\bhorzpos="(\d+)"/)?.[1] ?? "0",
      10
    );

    expect(generatedParaPrId).not.toBe("2");
    expect(readMargin(generatedParaPr, "intent")).toBe(0);
    expect(readMargin(generatedParaPr, "left")).toBeGreaterThan(0);
    expect(readHorizontalAlign(generatedParaPr)).toBe("LEFT");
    expect(firstHorzPos).toBeGreaterThan(0);
  });

  it("uses left-aligned generated body paragraph styles to avoid stretched word spacing", () => {
    const template = loadHwpxTemplate(createBulletTitleRegionTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        { id: "block-2", role: "section", text: "1. 단어 사이 공백이 늘어나면 안 되는 제목" }
      ])
    );
    const headerXml = strFromU8(output["Contents/header.xml"]);
    const sectionParagraph = paragraphXmlByText(sectionXmlFromOutput(output), "1. 단어 사이 공백이 늘어나면 안 되는 제목");
    const generatedParaPrId = sectionParagraph.match(/paraPrIDRef="([^"]+)"/)?.[1] ?? "";
    const generatedParaPr = headerXml.match(new RegExp(`<hh:paraPr\\b(?=[^>]*\\bid="${generatedParaPrId}")[\\s\\S]*?<\\/hh:paraPr>`))?.[0] ?? "";

    expect(generatedParaPrId).not.toBe("1");
    expect(readHorizontalAlign(generatedParaPr)).toBe("LEFT");
  });

  it("keeps wrapped generated bullet continuation lines deeper than the bullet marker", () => {
    const template = loadHwpxTemplate(createBulletTitleRegionTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        {
          id: "block-2",
          role: "dashItem",
          text: "- 울산광역시는 기후위기 대응 역량 강화를 위해 긴 글머리 문단의 둘째 줄부터 글머리 기호가 아니라 본문 글자 위치에 맞춰 들여써야 합니다."
        }
      ])
    );
    const paragraph = paragraphXmlContaining(sectionXmlFromOutput(output), "울산광역시는 기후위기 대응 역량 강화를 위해");
    const lineHorzPositions = Array.from(paragraph.matchAll(/<hp:lineseg\b[^>]*\bhorzpos="(\d+)"/g), (match) =>
      Number.parseInt(match[1] ?? "0", 10)
    );

    expect(lineHorzPositions.length).toBeGreaterThan(1);
    expect(lineHorzPositions[0]).toBeGreaterThan(0);
    expect(lineHorzPositions.slice(1).every((horzPos) => horzPos > (lineHorzPositions[0] ?? 0))).toBe(true);
  });

  it("inserts a real blank paragraph between a bullet group and the next generated heading", () => {
    const template = loadHwpxTemplate(createBulletTitleRegionTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "새 표지" },
        { id: "block-2", role: "section", text: "1. 첫 제목" },
        { id: "block-3", role: "dashItem", text: "- 첫 글머리" },
        { id: "block-4", role: "section", text: "2. 다음 제목" }
      ])
    );
    const paragraphTexts = Array.from(
      sectionXmlFromOutput(output).matchAll(/<hp:p\b[^>]*>[\s\S]*?<\/hp:p>/g),
      (match) => extractParagraphTextForTest(match[0])
    );
    const bulletIndex = paragraphTexts.indexOf("○ 첫 글머리");

    expect(bulletIndex).toBeGreaterThanOrEqual(0);
    expect(paragraphTexts[bulletIndex + 1]).toBe("");
    expect(paragraphTexts[bulletIndex + 2]).toBe("2. 다음 제목");
  });

  it("preserves title tables but removes sample body tables when the input has no table rows", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
          { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
          { id: "block-3", role: "section", text: "1. 새 본문 제목" },
          { id: "block-4", role: "dashItem", text: "- 새 본문 항목" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:tbl/g)?.length).toBe(2);
    expect(sectionXml).not.toContain('id="body-table"');
    expect(sectionXml).toContain("울산광역시 탄소중립지원센터 BRIEF");
    expect(sectionXml).toContain("통권 제9호(2026년 5월)");
    expect(sectionXml).toContain("2026년 울산광역시 탄소중립지원센터 사업 소개");
    expect(sectionXml).toContain("1. 새 본문 제목");
    expect(sectionXml).toContain("○ 새 본문 항목");
    expect(sectionXml).not.toContain("통권 제6호(2025년 7-8월)");
    expect(sectionXml).not.toContain("기본계획 수립 개요");
    expect(sectionXml).not.toContain("샘플 본문 시작");
    expect(sectionXml).not.toContain("샘플 표 머리");
    expect(sectionXml).not.toContain("샘플 표 본문");
    expect(sectionXml).not.toContain("<hp:linesegarray>");
    expectValidXml(sectionXml);
  });

  it("removes sample raster graphics before replacing preserved template text slots", () => {
    const template = loadHwpxTemplate(createGraphicTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 제목" },
          { id: "block-2", role: "body", text: "새 본문" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain("새 제목");
    expect(sectionXml).toContain("새 본문");
    expect(sectionXml).not.toContain("<hp:pic");
    expect(sectionXml).not.toContain("<hp:container");
    expect(sectionXml).not.toContain("binaryItemIDRef");
    expect(sectionXml).not.toContain("샘플 비트맵 텍스트");
    expect(output["BinData/image1.png"]).toBeUndefined();
    expect(output["BinData/image2.jpg"]).toBeUndefined();
    expect(strFromU8(output["Contents/content.hpf"])).not.toContain('id="image1"');
    expect(strFromU8(output["Contents/content.hpf"])).not.toContain('id="image2"');
    expectValidXml(sectionXml);
  });

  it("embeds source image blocks as new HWPX BinData images", () => {
    const template = loadHwpxTemplate(createGraphicTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 제목" },
          {
            id: "block-2",
            role: "image",
            text: "차트",
            asset: {
              id: "asset-1",
              kind: "image",
              fileName: "chart.png",
              mimeType: "image/png",
              bytes: new Uint8Array([137, 80, 78, 71])
            }
          },
          { id: "block-3", role: "body", text: "이미지 뒤 본문" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);
    const contentHpf = strFromU8(output["Contents/content.hpf"]);

    expect(output["BinData/source-image-1.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(output["BinData/image1.png"]).toBeUndefined();
    expect(sectionXml).toContain("이미지 뒤 본문");
    expect(sectionXml).toContain('binaryItemIDRef="source-image-1"');
    expect(sectionXml).not.toContain('binaryItemIDRef="image1"');
    expect(contentHpf).toContain('id="source-image-1"');
    expect(contentHpf).toContain('href="BinData/source-image-1.png"');
    expect(contentHpf).not.toContain('id="image1"');
    expectValidXml(sectionXml);
  });

  it("starts appended source image paragraphs on a new page when the current page has no room", () => {
    const template = loadHwpxTemplate(createImagePaginationTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "body", text: "본문" },
        {
          id: "block-2",
          role: "image",
          text: "차트",
          asset: {
            id: "asset-1",
            kind: "image",
            fileName: "chart.png",
            mimeType: "image/png",
            bytes: new Uint8Array([137, 80, 78, 71])
          }
        }
      ])
    );
    const imageParagraph = paragraphXmlContaining(sectionXmlFromOutput(output), 'binaryItemIDRef="source-image-1"');

    expect(imageParagraph).toContain('pageBreak="1"');
    expect(firstLineVertPos(imageParagraph)).toBe(0);
  });

  it("replaces one template paragraph with one input block even when the paragraph has multiple text nodes", () => {
    const template = loadHwpxTemplate(createMultiTextParagraphTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 제목" },
          { id: "block-2", role: "body", text: "새 본문" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain("<hp:t>새 제목</hp:t>");
    expect(sectionXml).toContain("<hp:t>새 제목</hp:t><hp:lineBreak/><hp:t></hp:t>");
    expect(sectionXml).toContain("<hp:t>새 본문</hp:t>");
    expect(sectionXml).not.toContain("둘째 조각");
    expectValidXml(sectionXml);
  });

  it("adapts dash input to the target template slot instead of always forcing a bullet", () => {
    const template = loadHwpxTemplate(createNewsSlotTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 표지" },
          { id: "block-2", role: "body", text: "전국 소식" },
          { id: "block-3", role: "dashItem", text: "- 새 뉴스 제목" },
          { id: "block-4", role: "dashItem", text: "- 새 뉴스 본문" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain("<hp:t>새 뉴스 제목</hp:t>");
    expect(sectionXml).not.toContain("<hp:t>○ 새 뉴스 제목</hp:t>");
    expect(sectionXml).toContain("<hp:t>○ 새 뉴스 본문</hp:t>");
    expectValidXml(sectionXml);
  });

  it("aligns replacement groups to matching template section anchors", () => {
    const template = loadHwpxTemplate(createAnchoredTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 표지" },
          { id: "block-2", role: "body", text: "새 앞 본문" },
          { id: "block-3", role: "body", text: "탄소중립 정보공유" },
          { id: "block-4", role: "body", text: "전국 소식" },
          { id: "block-5", role: "dashItem", text: "- 새 뉴스 제목" },
          { id: "block-6", role: "body", text: "센터 소식" },
          { id: "block-7", role: "dashItem", text: "- 새 센터 제목" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(textByParagraphId(sectionXml, "early-extra")).toBe("");
    expect(textByParagraphId(sectionXml, "info-anchor")).toBe("탄소중립 정보공유");
    expect(textByParagraphId(sectionXml, "news-title")).toBe("새 뉴스 제목");
    expect(textByParagraphId(sectionXml, "center-anchor")).toBe("센터 소식");
    expect(textByParagraphId(sectionXml, "center-title")).toBe("새 센터 제목");
    expectValidXml(sectionXml);
  });

  it("keeps dash items in bullet-like template slots instead of consuming heading slots", () => {
    const template = loadHwpxTemplate(createRoleCompatibleTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 표지" },
          { id: "block-2", role: "section", text: "1. 첫 제목" },
          { id: "block-3", role: "dashItem", text: "- 첫 불릿" },
          { id: "block-4", role: "dashItem", text: "- 둘째 불릿" },
          { id: "block-5", role: "section", text: "2. 둘째 제목" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(textByParagraphId(sectionXml, "heading-1")).toBe("1. 첫 제목");
    expect(textByParagraphId(sectionXml, "bullet-1")).toBe("○ 첫 불릿");
    expect(textByParagraphId(sectionXml, "heading-extra")).toBe("");
    expect(textByParagraphId(sectionXml, "bullet-2")).toBe("○ 둘째 불릿");
    expect(textByParagraphId(sectionXml, "heading-2")).toBe("2. 둘째 제목");
    expectValidXml(sectionXml);
  });

  it("falls back to the next fillable slot instead of dropping overflow content", () => {
    const template = loadHwpxTemplate(createFallbackSlotTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "새 표지" },
          { id: "block-2", role: "section", text: "1. 남는 제목" }
        ],
        { mode: "preserveTemplate" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(textByParagraphId(sectionXml, "fallback-slot")).toBe("1. 남는 제목");
    expectValidXml(sectionXml);
  });

  it("preserves leading title tables and renders the body from new content", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
        { id: "block-3", role: "section", text: "1. 새 본문 제목" },
        { id: "block-4", role: "dashItem", text: "- 새 본문 항목" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:tbl/g)?.length).toBe(2);
    expect(sectionXml).toContain('id="1"');
    expect(sectionXml).toContain('id="2"');
    expect(sectionXml).not.toContain('id="body-table"');
    expect(sectionXml).toContain('paraPrIDRef="70"');
    expect(sectionXml).toContain('charPrIDRef="81"');
    expect(sectionXml).toContain('paraPrIDRef="72"');
    expect(sectionXml).toContain('charPrIDRef="83"');
    expect(sectionXml).toContain('paraPrIDRef="73"');
    expect(sectionXml).toContain('charPrIDRef="87"');
    expect(sectionXml).toContain("울산광역시 탄소중립지원센터 BRIEF");
    expect(sectionXml).toContain("통권 제9호(2026년 5월)");
    expect(sectionXml).toContain("2026년 울산광역시 탄소중립지원센터 사업 소개");
    expect(sectionXml).toContain("1. 새 본문 제목");
    expect(sectionXml).toContain("○ 새 본문 항목");
    expect(sectionXml).not.toContain("통권 제6호(2025년 7-8월)");
    expect(sectionXml).not.toContain("샘플 표 본문");
    expect(sectionXml).toContain("<hp:linesegarray>");
    expectValidXml(sectionXml);
  });

  it("renders lead headings through a one-cell structure table motif without copying data tables", () => {
    const template = loadHwpxTemplate(createStructureTableTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
        { id: "block-3", role: "section", text: "1. 새 본문 제목" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain('id="lead-heading-table"');
    expect(sectionXml).toContain("2026년 울산광역시 탄소중립지원센터 사업 소개");
    expect(sectionXml).not.toContain("샘플 리드 제목");
    expect(sectionXml).not.toContain('id="body-table"');
    expect(sectionXml).not.toContain("샘플 표 머리");
    expect(sectionXml).not.toContain("샘플 표 본문");
    expectValidXml(sectionXml);
  });

  it("splits very long generated body paragraphs before rendering", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const longText = Array.from(
      { length: 24 },
      (_, index) => `문장 ${index + 1}은 긴 본문이 한 문단에서 겹치지 않도록 나누어 배치되어야 합니다.`
    ).join(" ");
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "2026년 사업 소개" },
        { id: "block-3", role: "body", text: longText }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:p\b/g)?.length).toBeGreaterThan(4);
    expect(sectionXml).toContain("문장 1은");
    expect(sectionXml).toContain("문장 24은");
    expectValidXml(sectionXml);
  });

  it("keeps sample title tables even in flat body mode", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "표 없는 안내문" },
          { id: "block-2", role: "body", text: "본문만 필요한 경우" }
        ],
        { mode: "flat" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:tbl/g)?.length).toBe(2);
    expect(sectionXml).toContain("표 없는 안내문");
    expect(sectionXml).toContain("본문만 필요한 경우");
    expect(sectionXml).not.toContain("샘플 표 본문");
    expectValidXml(sectionXml);
  });

  it("renders input table rows as paragraphs in flat body mode", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
          { id: "block-2", role: "body", text: "표 문단형 테스트" },
          { id: "block-3", role: "tableRow", text: "구분\t기준" },
          { id: "block-4", role: "tableRow", text: "달성\t목표 달성" }
        ],
        { mode: "flat" }
      )
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:tbl/g)?.length).toBe(2);
    expect(sectionXml).not.toContain('id="body-table"');
    expect(sectionXml).toContain("구분    기준");
    expect(sectionXml).toContain("달성    목표 달성");
    expectValidXml(sectionXml);
  });

  it("clones a sample body table only when the input contains table rows", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "2026년 울산광역시 탄소중립지원센터 사업 소개" },
        { id: "block-3", role: "section", text: "1. 표 테스트" },
        { id: "block-4", role: "tableRow", text: "구분\t기준" },
        { id: "block-5", role: "tableRow", text: "달성\t목표 달성" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml.match(/<hp:tbl/g)?.length).toBe(3);
    expect(sectionXml).toContain('id="body-table"');
    expect(sectionXml).toContain("구분");
    expect(sectionXml).toContain("기준");
    expect(sectionXml).toContain("달성");
    expect(sectionXml).toContain("목표 달성");
    expect(sectionXml).not.toContain("샘플 표 머리");
    expect(sectionXml).not.toContain("샘플 표 본문");
    expectValidXml(sectionXml);
  });

  it("selects the closest sample body table by column count", () => {
    const template = loadHwpxTemplate(createMultiTableTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "표 매칭 테스트" },
        { id: "block-3", role: "tableRow", text: "부문\t사업\t효과" },
        { id: "block-4", role: "tableRow", text: "건물\t태양광\t15,000" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain('id="body-table-3col"');
    expect(sectionXml).not.toContain('id="body-table-2col"');
    expect(sectionXml).toContain("부문");
    expect(sectionXml).toContain("사업");
    expect(sectionXml).toContain("효과");
    expectValidXml(sectionXml);
  });

  it("expands sample table columns when the input has more cells than the closest sample", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(template, [
        { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
        { id: "block-2", role: "body", text: "표 확장 테스트" },
        { id: "block-3", role: "tableRow", text: "구분\t기준\t상태" },
        { id: "block-4", role: "tableRow", text: "달성\t목표 달성\t완료" }
      ])
    );
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(sectionXml).toContain('colCnt="3"');
    expect(sectionXml).toContain("상태");
    expect(sectionXml).toContain("완료");
    expectValidXml(sectionXml);
  });

  it("can override table title and body character styles without changing non-table text", () => {
    const template = loadHwpxTemplate(createTableTemplateZip());
    const output = unzipSync(
      generateHwpx(
        template,
        [
          { id: "block-1", role: "title", text: "울산광역시 탄소중립지원센터 BRIEF 통권 제9호(2026년 5월)" },
          { id: "block-2", role: "body", text: "표 안 본문" },
          { id: "block-3", role: "tableRow", text: "구분\t기준" },
          { id: "block-4", role: "body", text: "표 밖 문단" }
        ],
        {
          mode: "preserveTemplate",
          tableStyles: {
            title: { fontFamily: "함초롬바탕", fontSizePt: 18, charSpacing: -5, bold: true },
            body: { fontFamily: "함초롬돋움", fontSizePt: 11, charSpacing: 4, bold: false }
          }
        }
      )
    );
    const headerXml = strFromU8(output["Contents/header.xml"]);
    const sectionXml = strFromU8(output["Contents/section0.xml"]);

    expect(headerXml).toContain('<hh:charProperties itemCnt="6">');
    const overriddenCharPrIds = Array.from(
      headerXml.matchAll(/<hh:charPr id="(\d+)" height="(?:1800|1100)"[\s\S]*?<\/hh:charPr>/g),
      (match) => match[1] ?? ""
    );

    expect(overriddenCharPrIds).toHaveLength(3);
    expect(headerXml.match(/height="1800"/g)).toHaveLength(2);
    expect(headerXml.match(/height="1100"/g)).toHaveLength(1);
    expect(headerXml).toContain('<hh:spacing hangul="-5" latin="-5"');
    expect(headerXml).toContain('<hh:spacing hangul="4" latin="4"');
    expect(headerXml).toContain('<hh:fontRef hangul="1" latin="1"');
    expect(headerXml).toContain('<hh:fontRef hangul="2" latin="2"');

    for (const charPrId of overriddenCharPrIds) {
      expect(sectionXml).toContain(`charPrIDRef="${charPrId}"`);
    }
    expect(sectionXml).toContain("표 밖 문단");
    expect(sectionXml).not.toContain("샘플 표 본문");
    expectValidXml(sectionXml);
  });
});

function expectValidXml(xml: string): void {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  expect(parsed.querySelector("parsererror")).toBeNull();
}

function sectionXmlFromOutput(output: Record<string, Uint8Array>): string {
  return strFromU8(output["Contents/section0.xml"]);
}

function withHeaderReplacement(templateZip: Uint8Array, search: string, replacement: string): Uint8Array {
  const files = unzipSync(templateZip);
  files["Contents/header.xml"] = new Uint8Array(strToU8(strFromU8(files["Contents/header.xml"]).replace(search, replacement)));

  return zipSync(files);
}

function withSectionReplacement(templateZip: Uint8Array, search: string, replacement: string): Uint8Array {
  const files = unzipSync(templateZip);
  files["Contents/section0.xml"] = new Uint8Array(strToU8(strFromU8(files["Contents/section0.xml"]).replace(search, replacement)));

  return zipSync(files);
}

function firstLineVertPos(paragraphXml: string): number {
  return Number.parseInt(paragraphXml.match(/<hp:lineseg\b[^>]*\bvertpos="(\d+)"/)?.[1] ?? "0", 10);
}

function pageBreakParagraphVertPositions(sectionXml: string): number[] {
  return Array.from(
    sectionXml.matchAll(/<hp:p\b(?=[^>]*\bpageBreak="1")[^>]*>[\s\S]*?<\/hp:p>/g),
    (match) => firstLineVertPos(match[0])
  );
}

function readMargin(paraPrXml: string, name: string): number {
  return Number.parseInt(paraPrXml.match(new RegExp(`<hc:${name}\\b[^>]*\\bvalue="(-?\\d+)"`))?.[1] ?? "0", 10);
}

function readHorizontalAlign(paraPrXml: string): string | null {
  return paraPrXml.match(/<hh:align\b[^>]*\bhorizontal="([^"]+)"/)?.[1] ?? null;
}

function extractParagraphTextForTest(paragraphXml: string): string {
  return Array.from(
    paragraphXml.matchAll(/<hp:t\b(?![^>]*\/>)[^>]*>([\s\S]*?)<\/hp:t>/g),
    (match) => match[1] ?? ""
  ).join("");
}

function textByParagraphId(xml: string, id: string): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paragraph = xml.match(new RegExp(`<hp:p\\b(?=[^>]*id="${escapedId}")[^>]*>([\\s\\S]*?)</hp:p>`))?.[1] ?? "";

  return Array.from(
    paragraph.matchAll(/<hp:t\b(?![^>]*\/>)[^>]*>([\s\S]*?)<\/hp:t>/g),
    (match) => match[1] ?? ""
  ).join("");
}

function paragraphXmlByText(xml: string, text: string): string {
  return Array.from(xml.matchAll(/<hp:p\b[^>]*>[\s\S]*?<\/hp:p>/g), (match) => match[0])
    .find((paragraphXml) => paragraphXml.includes(`<hp:t>${text}</hp:t>`)) ?? "";
}

function paragraphXmlContaining(xml: string, text: string): string {
  return Array.from(xml.matchAll(/<hp:p\b[^>]*>[\s\S]*?<\/hp:p>/g), (match) => match[0])
    .find((paragraphXml) => paragraphXml.includes(text)) ?? "";
}

function createTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(createTemplateSection())),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createMultiTextParagraphTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="0" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>첫째 조각</hp:t><hp:lineBreak/><hp:t>둘째 조각</hp:t></hp:run>
  </hp:p>
  <hp:p id="1" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="2"><hp:t>원래 본문</hp:t></hp:run>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createNewsSlotTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="0" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>표지</hp:t></hp:run>
  </hp:p>
  <hp:p id="category" paraPrIDRef="9" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="9"><hp:t>전국 소식</hp:t></hp:run>
  </hp:p>
  <hp:p id="1" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="2"><hp:t>샘플 뉴스 제목</hp:t></hp:run>
  </hp:p>
  <hp:p id="2" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="3"><hp:t>○ 샘플 뉴스 본문</hp:t></hp:run>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createGraphicTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/content.hpf": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf">
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="image1" href="BinData/image1.png" media-type="image/png" isEmbeded="1"/>
    <opf:item id="image2" href="BinData/image2.jpg" media-type="image/jpeg" isEmbeded="1"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  </opf:manifest>
</opf:package>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="title" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>샘플 제목</hp:t></hp:run>
  </hp:p>
  <hp:p id="sample-image" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1">
      <hp:pic id="picture-1" zOrder="1" numberingType="PICTURE">
        <hp:offset x="0" y="0"/>
        <hp:orgSz width="1000" height="1000"/>
        <hc:img binaryItemIDRef="image1"/>
      </hp:pic>
    </hp:run>
  </hp:p>
  <hp:p id="sample-container" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1">
      <hp:container id="container-1" zOrder="2" numberingType="PICTURE">
        <hp:pic id="picture-2" zOrder="0" numberingType="PICTURE">
          <hc:img binaryItemIDRef="image2"/>
        </hp:pic>
        <hp:drawText>
          <hp:subList>
            <hp:p id="inner-text" paraPrIDRef="1" styleIDRef="0">
              <hp:run charPrIDRef="1"><hp:t>샘플 비트맵 텍스트</hp:t></hp:run>
            </hp:p>
          </hp:subList>
        </hp:drawText>
      </hp:container>
    </hp:run>
  </hp:p>
  <hp:p id="body" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="2"><hp:t>샘플 본문</hp:t></hp:run>
  </hp:p>
</hs:sec>`)),
    "BinData/image1.png": new Uint8Array([1, 2, 3]),
    "BinData/image2.jpg": new Uint8Array([4, 5, 6]),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createImagePaginationTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">${charPr("1", "1000", "0", false)}</hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/content.hpf": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf"><opf:manifest><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest></opf:package>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="sample" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="26000"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/></hp:pagePr></hp:secPr><hp:t>샘플 본문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="23000" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createAnchoredTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="cover" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>표지</hp:t></hp:run></hp:p>
  <hp:p id="lead" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2"><hp:t>앞 본문</hp:t></hp:run></hp:p>
  <hp:p id="early-extra" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="3"><hp:t>도서 추천</hp:t></hp:run></hp:p>
  <hp:p id="info-anchor" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="4"><hp:t>탄소중립 정보공유</hp:t></hp:run></hp:p>
  <hp:p id="nationwide" paraPrIDRef="5" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="5"><hp:t>전국 소식</hp:t></hp:run></hp:p>
  <hp:p id="news-title" paraPrIDRef="6" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:t>샘플 뉴스 제목</hp:t></hp:run></hp:p>
  <hp:p id="center-anchor" paraPrIDRef="7" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="7"><hp:t>센터 소식</hp:t></hp:run></hp:p>
  <hp:p id="center-title" paraPrIDRef="8" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="8"><hp:t>샘플 센터 제목</hp:t></hp:run></hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createRoleCompatibleTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="cover" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>표지</hp:t></hp:run></hp:p>
  <hp:p id="heading-1" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2"><hp:t>샘플 제목 1</hp:t></hp:run></hp:p>
  <hp:p id="bullet-1" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="3"><hp:t>○ 샘플 불릿 1</hp:t></hp:run></hp:p>
  <hp:p id="heading-extra" paraPrIDRef="4" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="4"><hp:t>샘플 중간 제목</hp:t></hp:run></hp:p>
  <hp:p id="bullet-2" paraPrIDRef="5" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="5"><hp:t>○ 샘플 불릿 2</hp:t></hp:run></hp:p>
  <hp:p id="heading-2" paraPrIDRef="6" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="6"><hp:t>샘플 제목 2</hp:t></hp:run></hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createFallbackSlotTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8("<head />")),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="cover" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>표지</hp:t></hp:run></hp:p>
  <hp:p id="fallback-slot" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2"><hp:t>○ 샘플 불릿뿐</hp:t></hp:run></hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createTemplateSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="0" paraPrIDRef="38" styleIDRef="1" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="116"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="WIDELY" width="59528" height="84188"/></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1"/></hp:ctrl></hp:run>
    <hp:run charPrIDRef="116"><hp:t>환경부공고 제2025-436호</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="58" styleIDRef="1" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="63"><hp:t>입찰 공고</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="53" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="39"><hp:t>1. 입찰내용</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="79"><hp:t>2025. 6. 30.</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="55" styleIDRef="19" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="57"><hp:t>  가. 용역기간: 6개월</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="64" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="9"><hp:t>     - 평가기관 : 환경부</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="51" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="54"><hp:t>  타. 문의처 :</hp:t></hp:run>
  </hp:p>
  <hp:p id="0" paraPrIDRef="24" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="9"><hp:t>     - (입찰 및 계약사항) 운영지원과</hp:t></hp:run>
  </hp:p>
</hs:sec>`;
}

function createTableTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(createTableTemplateHeader())),
    "Contents/section0.xml": new Uint8Array(strToU8(createTableTemplateSection())),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createSpacerBeforeHeadingTemplateZip(): Uint8Array {
  const header = createTableTemplateHeader().replace(
    "</hh:charProperties>",
    `${charPr("11", "1200", "0", false)}</hh:charProperties>`
  );
  const section = createTableTemplateSection().replace(
    '<hp:tbl id="body-table">',
    `<hp:p id="spacer-before-center" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="11"><hp:t></hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="800" vertsize="500" textheight="500" baseline="425" spacing="300" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
  <hp:p id="center-heading-sample" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="11"><hp:t>센터 소식</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="1600" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="40932" flags="393216"/></hp:linesegarray>
  </hp:p>
  <hp:tbl id="body-table">`
  );

  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(header)),
    "Contents/section0.xml": new Uint8Array(strToU8(section)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createStructureTableTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(createTableTemplateHeader())),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="1" rowCnt="1" colCnt="1">
    <hp:tr><hp:tc><hp:subList>
      <hp:p id="title" paraPrIDRef="70" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
        <hp:run charPrIDRef="81"><hp:t>울산광역시 탄소중립지원센터 BRIEF</hp:t></hp:run>
        <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1600" textheight="1600" baseline="1360" spacing="960" horzpos="0" horzsize="40932" flags="393216"/></hp:linesegarray>
      </hp:p>
    </hp:subList></hp:tc></hp:tr>
  </hp:tbl>
  <hp:p id="sample-body-start" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="83"><hp:t>샘플 본문 시작</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="2400" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
  <hp:tbl id="lead-heading-table" rowCnt="1" colCnt="1">
    <hp:sz width="42520" widthRelTo="ABSOLUTE" height="2200" heightRelTo="ABSOLUTE" protect="0"/>
    <hp:tr>
      <hp:tc>
        <hp:subList>
          <hp:p id="lead-heading-table-p" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="83"><hp:t>샘플 리드 제목</hp:t></hp:run>
            <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="40932" flags="393216"/></hp:linesegarray>
          </hp:p>
        </hp:subList>
        <hp:cellSz width="42520" height="2200"/>
      </hp:tc>
    </hp:tr>
  </hp:tbl>
  <hp:tbl id="body-table" rowCnt="1" colCnt="2">
    <hp:tr>
      <hp:tc><hp:subList><hp:p id="body-table-p" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="83"><hp:t>샘플 표 머리</hp:t></hp:run></hp:p></hp:subList></hp:tc>
      <hp:tc><hp:subList><hp:p id="body-table-p2" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="83"><hp:t>샘플 표 본문</hp:t></hp:run></hp:p></hp:subList></hp:tc>
    </hp:tr>
  </hp:tbl>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createParagraphSpacingTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">${charPr("1", "1000", "0", false)}</hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0">
      <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
      <hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="300"/><hc:next value="2000"/></hh:margin>
      <hh:lineSpacing type="PERCENT" value="160"/>
    </hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="sample" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>샘플 본문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createNarrowWrapTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">${charPr("1", "1000", "0", false)}</hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="sample" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>sample body</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createPaginationTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">${charPr("1", "1000", "0", false)}</hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="sample" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="9000"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/></hp:pagePr></hp:secPr><hp:t>샘플 본문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createTitleRegionPaginationTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">${charPr("1", "1000", "0", false)}</hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="title-anchor" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="6500"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/></hp:pagePr></hp:secPr><hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList><hp:p id="title" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>샘플 표지</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="3000" textheight="3000" baseline="2550" spacing="500" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
  <hp:p id="body-sample" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>샘플 본문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="3500" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createTitleOnlyTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="1">${charPr("1", "1000", "0", false)}</hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="title-anchor" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="84186"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/></hp:pagePr></hp:secPr><hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList><hp:p id="title" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>샘플 표지</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="3000" textheight="3000" baseline="2550" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createLineHeightMismatchTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="2">
    ${charPr("1", "1000", "0", false)}
    ${charPr("2", "1600", "0", true)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="heading" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="2"><hp:t>1. 샘플 제목</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createNarrowHeadingMetricsTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="2">
    ${charPr("1", "1000", "0", false)}
    ${charPr("2", "1000", "0", true)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="body" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL"><hp:pagePr landscape="NARROWLY" width="50000" height="84186"><hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/></hp:pagePr></hp:secPr><hp:t>샘플 본문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>
  </hp:p>
  <hp:p id="heading" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="2"><hp:t>1. 좁은 제목 슬롯</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="1600" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="20000" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createTinyCenterHeadingTemplateZip(): Uint8Array {
  const header = createTableTemplateHeader()
    .replace("</hh:charProperties>", `${charPr("10", "900", "0", false)}${charPr("11", "500", "0", false)}${charPr("21", "1200", "0", true)}</hh:charProperties>`)
    .replace('<hh:charProperties itemCnt="3">', '<hh:charProperties itemCnt="7">');
  const section = createTableTemplateSection().replace(
    '<hp:tbl id="body-table">',
    `<hp:p id="page-heading" paraPrIDRef="22" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="8"><hp:t>탄소중립 정보공유</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  <hp:p id="category" paraPrIDRef="29" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="21"><hp:t>전국 소식</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  <hp:p id="news-title" paraPrIDRef="21" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="10"><hp:t>샘플 뉴스 제목</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="900" textheight="900" baseline="765" spacing="540" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  <hp:p id="center-heading" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="11"><hp:t>센터 소식</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="500" textheight="500" baseline="425" spacing="300" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  <hp:tbl id="body-table">`
  );

  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(header)),
    "Contents/section0.xml": new Uint8Array(strToU8(section)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createBulletLayoutTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="2">
    ${charPr("1", "1200", "0", true)}
    ${charPr("2", "1000", "0", false)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="2">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
    <hh:paraPr id="2" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="-1800"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="heading" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>1. 샘플 제목</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  <hp:p id="bullet" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2"><hp:t>○ 샘플 글머리</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="1920" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createBulletTitleRegionTemplateZip(): Uint8Array {
  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:charProperties itemCnt="2">
    ${charPr("1", "1200", "0", true)}
    ${charPr("2", "1000", "0", false)}
  </hh:charProperties>
  <hh:paraProperties itemCnt="2">
    <hh:paraPr id="1" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
    <hh:paraPr id="2" tabPrIDRef="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="-1800"/><hc:left value="0"/><hc:right value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>
  </hh:paraProperties>
</hh:head>`)),
    "Contents/section0.xml": new Uint8Array(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="title-table"><hp:tr><hp:tc><hp:subList>
    <hp:p id="title" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>표지</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  </hp:subList></hp:tc></hp:tr></hp:tbl>
  <hp:p id="heading" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:t>1. 샘플 제목</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="1920" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
  <hp:p id="bullet" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2"><hp:t>○ 샘플 글머리</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="3840" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>
</hs:sec>`)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createMultiTableTemplateZip(): Uint8Array {
  const section = createTableTemplateSection().replace(
    '<hp:tbl id="body-table">',
    '<hp:tbl id="body-table-2col">'
  ).replace(
    '</hp:tbl>\n  <hp:p id="3"',
    `</hp:tbl>
  <hp:tbl id="body-table-3col" rowCnt="1" colCnt="3">
    <hp:tr>
      <hp:tc>
        <hp:subList><hp:p id="body-table-3col-p1" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="83"><hp:t>샘플 3열 1</hp:t></hp:run></hp:p></hp:subList>
      </hp:tc>
      <hp:tc>
        <hp:subList><hp:p id="body-table-3col-p2" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="83"><hp:t>샘플 3열 2</hp:t></hp:run></hp:p></hp:subList>
      </hp:tc>
      <hp:tc>
        <hp:subList><hp:p id="body-table-3col-p3" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="83"><hp:t>샘플 3열 3</hp:t></hp:run></hp:p></hp:subList>
      </hp:tc>
    </hp:tr>
  </hp:tbl>
  <hp:p id="3"`
  );

  return zipSync({
    mimetype: new Uint8Array(strToU8("application/hwp+zip")),
    "Contents/header.xml": new Uint8Array(strToU8(createTableTemplateHeader())),
    "Contents/section0.xml": new Uint8Array(strToU8(section)),
    "Preview/PrvText.txt": new Uint8Array(strToU8("old preview text"))
  });
}

function createTableTemplateHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:fontfaces>
    <hh:fontface lang="HANGUL" fontCnt="3"><hh:font id="0" face="한컴산뜻돋움"/><hh:font id="1" face="함초롬바탕"/><hh:font id="2" face="함초롬돋움"/></hh:fontface>
    <hh:fontface lang="LATIN" fontCnt="3"><hh:font id="0" face="Arial"/><hh:font id="1" face="함초롬바탕"/><hh:font id="2" face="함초롬돋움"/></hh:fontface>
  </hh:fontfaces>
    <hh:charProperties itemCnt="3">
    ${charPr("81", "1600", "0", false)}
    ${charPr("82", "1300", "0", true)}
    ${charPr("83", "1200", "0", false)}
    ${charPr("87", "1000", "0", false)}
  </hh:charProperties>
</hh:head>`;
}

function charPr(id: string, height: string, spacing: string, bold: boolean): string {
  return `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="${spacing}" latin="${spacing}" hanja="${spacing}" japanese="${spacing}" other="${spacing}" symbol="${spacing}" user="${spacing}"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? "<hh:bold/>" : ""}<hh:underline type="NONE" shape="SOLID" color="#000000"/></hh:charPr>`;
}

function createTableTemplateSection(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="1">
    <hp:tr>
      <hp:tc>
        <hp:subList>
          <hp:p id="1" paraPrIDRef="70" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="81"><hp:t>울산광역시 탄소중립지원센터 BRIEF</hp:t></hp:run>
            <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
          </hp:p>
          <hp:p id="2" paraPrIDRef="71" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="82"><hp:t>통권 제6호(2025년 7-8월)</hp:t></hp:run>
            <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
          </hp:p>
        </hp:subList>
      </hp:tc>
    </hp:tr>
  </hp:tbl><hp:t/>
  <hp:tbl id="2">
    <hp:tr>
      <hp:tc>
        <hp:subList>
          <hp:p id="3" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="83"><hp:t>기본계획 수립 개요</hp:t></hp:run>
            <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
          </hp:p>
        </hp:subList>
      </hp:tc>
    </hp:tr>
  </hp:tbl>
  <hp:p id="separator" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="83"><hp:t>샘플 본문 시작</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
  </hp:p>
  <hp:p id="sample-bullet" paraPrIDRef="73" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="87"><hp:t>○ 샘플 본문 항목</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
  </hp:p>
  <hp:tbl id="body-table">
    <hp:tr>
      <hp:tc>
        <hp:subList>
          <hp:p id="body-table-p" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="83"><hp:t>샘플 표 머리</hp:t></hp:run>
            <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
          </hp:p>
        </hp:subList>
      </hp:tc>
      <hp:tc>
        <hp:subList>
          <hp:p id="body-table-p2" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="83"><hp:t>샘플 표 본문</hp:t></hp:run>
            <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
          </hp:p>
        </hp:subList>
      </hp:tc>
    </hp:tr>
  </hp:tbl>
  <hp:p id="3" paraPrIDRef="72" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="83"><hp:t>표 밖 원문</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray>
  </hp:p>
</hs:sec>`;
}
