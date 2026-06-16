import { strFromU8, unzipSync } from "fflate";
import type { DocumentBlock } from "../document/types";
import { applyLayoutSafety } from "./layoutSafety";
import { auditGeneratedHwpx } from "./outputAudit";
import type { GeneratedOutputAudit } from "./outputAudit";
import { analyzeGenerationQuality } from "./quality";
import type { GenerationQualityReport } from "./quality";
import { generateHwpx } from "./render";
import { buildHwpxSourceStructure } from "./sourceStructure";
import { assignHwpxStyles } from "./styleAssignment";
import type { HwpxTemplate } from "./template";
import { analyzeHwpxVisualDogfood } from "./visualDogfood";
import type { VisualDogfoodReport } from "./visualDogfood";

export interface GenerateHwpxReportOptions {
  template: HwpxTemplate;
  blocks: DocumentBlock[];
  samplePath: string;
  outputPath: string;
  sourceUrl?: string;
}

export interface GeneratedHwpxReport {
  generatedAt: string;
  samplePath: string;
  outputPath: string;
  hancomReflowRiskCount: number;
  source: {
    url?: string;
    blockCount: number;
    tableRowCount: number;
    imageCount: number;
  };
  template: {
    paragraphCount: number;
    tableCount: number;
    titleTableCount: number;
    bodyTableCount: number;
    grammarWarnings: string[];
    tableMotifs: HwpxTemplate["formatGrammar"]["tableMotifs"];
    roles: Record<string, GeneratedHwpxRoleReport | null>;
  };
  quality: GenerationQualityReport;
  outputAudit: GeneratedOutputAudit;
  visualDogfood: VisualDogfoodReport;
}

export interface GeneratedHwpxRoleReport {
  sampleText: string;
  style: {
    paraPrIDRef: string;
    charPrIDRef: string;
    styleIDRef: string;
  };
  fontSizePt: number | null;
  charSpacing: number | null;
  indent: number;
  reason: string;
}

export interface GeneratedHwpxConsoleSummary {
  outputPath: string;
  reportPath?: string;
  blocks: number;
  score: number;
  passed: boolean;
  errors: number;
  warnings: number;
  visualErrors: number;
  visualWarnings: number;
  hancomReflowRiskCount: number;
  outputTables: number;
  outputBodyTables: number;
  lineSegArrays: number;
  badBulletIndentCount: number;
  badNonBulletIndentCount: number;
  badBulletStyleIndentCount: number;
  badNonBulletAutoHeadingCount: number;
  missingSourceTextCount: number;
}

export interface GenerateHwpxReportResult {
  output: Uint8Array;
  report: GeneratedHwpxReport;
  consoleSummary: GeneratedHwpxConsoleSummary;
}

export function generateHwpxReport(options: GenerateHwpxReportOptions): GenerateHwpxReportResult {
  const output = generateHwpx(options.template, options.blocks, { mode: "auto" });
  const outputFiles = unzipSync(output);
  const sectionXml = strFromU8(outputFiles["Contents/section0.xml"]);
  const headerXml = strFromU8(outputFiles["Contents/header.xml"]);
  const assignments = applyLayoutSafety(
    assignHwpxStyles(
      options.template.formatGrammar,
      buildHwpxSourceStructure(options.blocks),
      options.template.styleMap
    )
  );
  const outputAudit = auditGeneratedHwpx({
    blocks: options.blocks,
    assignments,
    sectionXml,
    headerXml,
    titleTableCount: options.template.analysis.leadingTitleTableCount
  });
  const visualDogfood = analyzeHwpxVisualDogfood(headerXml, sectionXml);
  const hancomReflowRiskCount = countHancomReflowRisks(outputAudit, visualDogfood);
  const report: GeneratedHwpxReport = {
    generatedAt: new Date().toISOString(),
    samplePath: options.samplePath,
    outputPath: options.outputPath,
    hancomReflowRiskCount,
    source: {
      url: options.sourceUrl,
      blockCount: options.blocks.length,
      tableRowCount: options.blocks.filter((block) => block.role === "tableRow").length,
      imageCount: options.blocks.filter((block) => block.role === "image").length
    },
    template: {
      paragraphCount: options.template.analysis.paragraphCount,
      tableCount: options.template.analysis.tableCount,
      titleTableCount: options.template.analysis.leadingTitleTableCount,
      bodyTableCount: options.template.analysis.bodyTableCount,
      grammarWarnings: options.template.formatGrammar.warnings,
      tableMotifs: options.template.formatGrammar.tableMotifs,
      roles: Object.fromEntries(Object.entries(options.template.formatGrammar.roles).map(([role, value]) => [
        role,
        value === undefined
          ? null
          : {
              sampleText: value.sampleText,
              style: value.style,
              fontSizePt: value.fontSizePt,
              charSpacing: value.charSpacing,
              indent: value.paragraphMargins.intent,
              reason: value.reason
            }
      ]))
    },
    quality: analyzeGenerationQuality(options.template, options.blocks),
    outputAudit,
    visualDogfood
  };

  return {
    output,
    report,
    consoleSummary: buildGeneratedHwpxConsoleSummary(report)
  };
}

export function buildGeneratedHwpxConsoleSummary(
  report: GeneratedHwpxReport,
  reportPath?: string
): GeneratedHwpxConsoleSummary {
  return {
    outputPath: report.outputPath,
    reportPath,
    blocks: report.source.blockCount,
    score: report.outputAudit.score,
    passed: report.outputAudit.passed,
    errors: report.outputAudit.issues.filter((issue) => issue.severity === "error").length,
    warnings: report.outputAudit.issues.filter((issue) => issue.severity === "warning").length,
    visualErrors: report.visualDogfood.issues.filter((issue) => issue.severity === "error").length,
    visualWarnings: report.visualDogfood.issues.filter((issue) => issue.severity === "warning").length,
    hancomReflowRiskCount: report.hancomReflowRiskCount,
    outputTables: report.outputAudit.summary.outputTables,
    outputBodyTables: report.outputAudit.summary.outputBodyTables,
    lineSegArrays: report.outputAudit.summary.outputLineSegArrays,
    badBulletIndentCount: report.outputAudit.summary.badBulletIndentCount,
    badNonBulletIndentCount: report.outputAudit.summary.badNonBulletIndentCount,
    badBulletStyleIndentCount: report.outputAudit.summary.badBulletStyleIndentCount,
    badNonBulletAutoHeadingCount: report.outputAudit.summary.badNonBulletAutoHeadingCount,
    missingSourceTextCount: report.outputAudit.summary.missingSourceTextCount
  };
}

export function countHancomReflowRisks(
  outputAudit: GeneratedOutputAudit,
  visualDogfood: VisualDogfoodReport
): number {
  const auditRiskCodes = new Set([
    "paragraph-overflow-risk",
    "page-line-overflow"
  ]);
  const visualRiskCodes = new Set([
    "page-overflow-risk",
    "page-bottom-tight-risk",
    "vertical-overlap-risk",
    "missing-blank-after-bullet-group",
    "bullet-continuation-indent-risk",
    "justify-spacing-risk",
    "short-wrapped-tail-risk",
    "table-paragraph-gap-risk"
  ]);

  return outputAudit.issues.filter((issue) => auditRiskCodes.has(issue.code)).length +
    visualDogfood.issues.filter((issue) => visualRiskCodes.has(issue.code)).length;
}
