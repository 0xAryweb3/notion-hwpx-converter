import { describe, expect, it } from "vitest";
import { applyLayoutSafety } from "../features/hwpx/layoutSafety";
import type { HwpxStyleAssignment } from "../features/hwpx/styleAssignment";

describe("HWPX layout safety", () => {
  it("splits long body paragraphs into fragments below the configured line threshold", () => {
    const longText = [
      "울산광역시는 기후위기 대응 역량 강화를 위해 첫 번째 문장을 작성함.",
      "지역 여건을 반영하여 두 번째 문장을 작성함.",
      "전문가 자문과 시민 의견을 바탕으로 세 번째 문장을 작성함.",
      "실행력 있는 적응 전략을 위해 네 번째 문장을 작성함."
    ].join(" ");
    const safeAssignments = applyLayoutSafety(
      [paragraphAssignment("assignment-1", "bodyParagraph", longText)],
      { maxEstimatedLinesPerParagraph: 2 }
    );

    expect(safeAssignments.length).toBeGreaterThan(1);
    expect(safeAssignments.every((assignment) => assignment.type === "paragraph")).toBe(true);
    expect(safeAssignments.every((assignment) => assignment.layoutFragment?.count === safeAssignments.length)).toBe(true);
    expect(safeAssignments.map((assignment) => assignment.auditText)).toEqual(
      safeAssignments.map(() => longText)
    );
  });

  it("keeps source coverage possible by preserving original audit text", () => {
    const longText = "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다. 넷째 문장입니다.";
    const safeAssignments = applyLayoutSafety(
      [paragraphAssignment("assignment-1", "newsBullet", `○ ${longText}`)],
      { maxEstimatedLinesPerParagraph: 1 }
    );

    expect(safeAssignments.length).toBeGreaterThan(1);
    expect(safeAssignments[0].text.startsWith("○ ")).toBe(true);
    expect(safeAssignments.slice(1).every((assignment) => assignment.text.startsWith("○ "))).toBe(true);
    expect(safeAssignments.every((assignment) => assignment.auditText === `○ ${longText}`)).toBe(true);
  });

  it("does not split structural roles, tables, or images", () => {
    const longText = "긴 제목 ".repeat(80);
    const assignments: HwpxStyleAssignment[] = [
      paragraphAssignment("assignment-1", "title", longText),
      paragraphAssignment("assignment-2", "issue", longText),
      paragraphAssignment("assignment-3", "bodyHeading", longText),
      paragraphAssignment("assignment-4", "categoryHeading", longText),
      paragraphAssignment("assignment-5", "newsTitle", longText),
      {
        ...paragraphAssignment("assignment-6", "bodyParagraph", "table"),
        type: "table",
        grammarRole: "table",
        rows: [["구분", "기준"]]
      },
      {
        ...paragraphAssignment("assignment-7", "bodyParagraph", "image"),
        type: "image",
        grammarRole: "image"
      }
    ];

    expect(applyLayoutSafety(assignments, { maxEstimatedLinesPerParagraph: 1 })).toHaveLength(assignments.length);
  });
});

function paragraphAssignment(
  id: string,
  grammarRole: HwpxStyleAssignment["grammarRole"],
  text: string
): HwpxStyleAssignment {
  return {
    id,
    type: "paragraph",
    grammarRole,
    text,
    sourceNodeId: id.replace("assignment", "source-node"),
    sourceBlockIds: [id.replace("assignment", "block")],
    style: { paraPrIDRef: "1", charPrIDRef: "1", styleIDRef: "0" },
    paragraphMargins: { intent: text.startsWith("○") ? -1600 : 0, left: 0, right: 0, prev: 0, next: 0 },
    fontSizePt: 10,
    charSpacing: 0,
    textColor: "#000000",
    line: {
      horzSize: 12000,
      horzPos: 0,
      textHeight: 1000,
      baseline: 850,
      spacing: 600
    },
    reason: "test",
    confidence: 1
  };
}
