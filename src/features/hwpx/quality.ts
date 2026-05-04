import type { DocumentBlock } from "../document/types";
import { applyLayoutSafety } from "./layoutSafety";
import { buildHwpxSourceStructure } from "./sourceStructure";
import { assignHwpxStyles } from "./styleAssignment";
import type { HwpxTemplate } from "./template";

export type QualityIssueSeverity = "info" | "warning";

export interface QualityIssue {
  severity: QualityIssueSeverity;
  message: string;
}

export interface GenerationQualityReport {
  inputTableGroupCount: number;
  inputTableRowCount: number;
  structureTableAssignmentCount: number;
  issues: QualityIssue[];
  assignmentRows: GenerationAssignmentRow[];
}

export interface GenerationAssignmentRow {
  type: string;
  grammarRole: string;
  sourceText: string;
  outputText: string;
  style: string | null;
  fontSizePt: number | null;
  textColor: string | null;
  charSpacing: number | null;
  indent: number;
  indentKind: "none" | "bullet" | "left" | "hanging";
  indentValue: number;
  indentLabel: string | null;
  reason: string;
  confidence: number;
}

export function analyzeGenerationQuality(template: HwpxTemplate, blocks: DocumentBlock[]): GenerationQualityReport {
  const inputTableRowCount = blocks.filter((block) => block.role === "tableRow").length;
  const inputTableGroupCount = countTableGroups(blocks);
  const templateImageCount = countTemplateImages(template.sectionXml);
  const sourceImageCount = blocks.filter((block) => block.role === "image").length;
  const embeddableSourceImageCount = blocks.filter((block) => block.role === "image" && block.asset?.bytes !== undefined).length;
  const formatProfile = template.formatProfile;
  const sourceNodes = buildHwpxSourceStructure(blocks);
  const assignments = applyLayoutSafety(assignHwpxStyles(template.formatGrammar, sourceNodes, template.styleMap));
  const structureTableAssignmentCount = assignments.filter((assignment) => assignment.renderAs === "structureTable").length;
  const issues: QualityIssue[] = [];

  if (template.analysis.leadingTitleTableCount > 0) {
    issues.push({
      severity: "info",
      message: `샘플 제목 표 ${template.analysis.leadingTitleTableCount}개를 유지합니다.`
    });
  }

  if (template.analysis.bodyTableCount > 0 && inputTableRowCount === 0) {
    issues.push({
      severity: "info",
      message: structureTableAssignmentCount > 0
        ? `입력에 표 행이 없어 데이터 표는 제거하고, 대응되는 소제목 구조 표 ${structureTableAssignmentCount}개를 재사용합니다.`
        : "입력에 표 행이 없어 샘플 본문 표는 제거합니다."
    });
  }

  if (inputTableGroupCount > 0 && template.analysis.bodyTableCount === 0) {
    issues.push({
      severity: "warning",
      message: "입력에는 표가 있지만 샘플 본문 표가 없어 가까운 문단 슬롯에 텍스트로 배치됩니다."
    });
  }

  if (templateImageCount > 0 && embeddableSourceImageCount > 0) {
    issues.push({
      severity: "info",
      message: `샘플 이미지는 텍스트가 박혀 있을 수 있어 기본 제거하고, 입력 이미지 ${embeddableSourceImageCount}개를 새 이미지로 배치합니다.`
    });
  } else if (templateImageCount > 0) {
    issues.push({
      severity: "info",
      message: `샘플 이미지 ${templateImageCount}개는 텍스트가 박혀 있을 수 있어 기본 제거합니다.`
    });
  } else if (embeddableSourceImageCount > 0) {
    issues.push({
      severity: "info",
      message: `입력 이미지 ${embeddableSourceImageCount}개를 새 이미지로 배치합니다.`
    });
  }

  if (sourceImageCount > embeddableSourceImageCount) {
    issues.push({
      severity: "warning",
      message: `입력 이미지 ${sourceImageCount - embeddableSourceImageCount}개는 파일 바이트가 없어 이번 HWPX에는 배치하지 않습니다.`
    });
  }

  if (formatProfile.page === null) {
    issues.push({
      severity: "warning",
      message: "샘플 페이지 여백을 찾지 못했습니다. 출력 문서 여백 재현이 제한됩니다."
    });
  }

  if (formatProfile.counts.paragraphStyles === 0) {
    issues.push({
      severity: "warning",
      message: "샘플 문단 스타일을 찾지 못했습니다. 들여쓰기와 행간 재현이 제한됩니다."
    });
  }

  if (formatProfile.counts.characterStyles === 0) {
    issues.push({
      severity: "warning",
      message: "샘플 글자 스타일을 찾지 못했습니다. 글꼴, 크기, 자간 재현이 제한됩니다."
    });
  }

  if (formatProfile.counts.textSlots === 0) {
    issues.push({
      severity: "warning",
      message: "샘플 텍스트 슬롯을 찾지 못했습니다. 텍스트 치환 정확도가 제한됩니다."
    });
  }

  if (
    formatProfile.page !== null &&
    formatProfile.counts.paragraphStyles > 0 &&
    formatProfile.counts.characterStyles > 0 &&
    formatProfile.counts.textSlots > 0
  ) {
    issues.push({
      severity: "info",
      message: "샘플 서식 분석: 페이지 여백, 문단 스타일, 글자 스타일, 표/셀 수치를 읽었습니다."
    });
  }

  const sectionColor = template.styleDetails.section?.textColor?.toUpperCase();

  if (sectionColor === "#FF0000") {
    issues.push({
      severity: "warning",
      message: "본문 제목 스타일이 빨간색으로 감지되었습니다. 샘플의 안내문 문구가 섞였을 수 있습니다."
    });
  }

  return {
    inputTableGroupCount,
    inputTableRowCount,
    structureTableAssignmentCount,
    issues,
    assignmentRows: assignments.map((assignment) => {
      const indentSummary = summarizeIndent(assignment.grammarRole, assignment.paragraphMargins);

      return {
        type: assignment.renderAs === "structureTable" ? "structureTable" : assignment.type,
        grammarRole: assignment.grammarRole,
        sourceText: assignment.text.replace(/^\s*○\s*/u, ""),
        outputText: assignment.text,
        style: assignment.style === undefined
          ? null
          : `${assignment.style.paraPrIDRef}/${assignment.style.charPrIDRef}/${assignment.style.styleIDRef}`,
        fontSizePt: assignment.fontSizePt,
        textColor: assignment.textColor,
        charSpacing: assignment.charSpacing,
        indent: assignment.paragraphMargins.intent,
        indentKind: indentSummary.kind,
        indentValue: indentSummary.value,
        indentLabel: indentSummary.label,
        reason: assignment.reason,
        confidence: assignment.confidence
      };
    })
  };
}

function summarizeIndent(
  grammarRole: string,
  margins: { intent: number; left: number }
): { kind: GenerationAssignmentRow["indentKind"]; value: number; label: string | null } {
  if ((grammarRole === "bullet" || grammarRole === "newsBullet") && margins.intent < 0) {
    const value = Math.abs(margins.intent);

    return { kind: "bullet", value, label: `글머리 들여쓰기 ${formatHwpxUnit(value)}` };
  }

  if (margins.left > 0) {
    return { kind: "left", value: margins.left, label: `좌측 들여쓰기 ${formatHwpxUnit(margins.left)}` };
  }

  if (margins.intent < 0) {
    return { kind: "hanging", value: margins.intent, label: `내어쓰기 ${formatHwpxUnit(margins.intent)}` };
  }

  return { kind: "none", value: 0, label: null };
}

function formatHwpxUnit(value: number): string {
  return `${value.toLocaleString("ko-KR")}hu`;
}

function countTemplateImages(sectionXml: string): number {
  return sectionXml.match(/<hp:(?:pic|container)\b/g)?.length ?? 0;
}

export function countTableGroups(blocks: DocumentBlock[]): number {
  let count = 0;
  let previousWasTableRow = false;

  for (const block of blocks) {
    if (block.role === "tableRow") {
      if (!previousWasTableRow) {
        count += 1;
      }

      previousWasTableRow = true;
      continue;
    }

    previousWasTableRow = false;
  }

  return count;
}
