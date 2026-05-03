import type { HwpxGrammarParagraphRole, HwpxGrammarRole, HwpxFormatGrammar, HwpxStyleRef } from "./formatGrammar";
import type { HwpxSourceNode } from "./sourceStructure";
import type { HwpxLineProfile, HwpxParagraphMargins } from "./formatProfile";
import type { HwpxStyleMap } from "./template";

export type HwpxStyleAssignmentType = "paragraph" | "table" | "image";
export type HwpxStyleAssignmentRole = HwpxGrammarRole | "table" | "image";

export interface HwpxStyleAssignment {
  id: string;
  type: HwpxStyleAssignmentType;
  grammarRole: HwpxStyleAssignmentRole;
  text: string;
  sourceNodeId: string;
  sourceBlockIds: string[];
  style?: HwpxStyleRef;
  paragraphMargins: HwpxParagraphMargins;
  line?: HwpxLineProfile | null;
  fontSizePt: number | null;
  charSpacing: number | null;
  textColor: string | null;
  renderAs?: "paragraph" | "structureTable";
  structureTable?: {
    role: Extract<HwpxGrammarRole, "leadHeading" | "pageHeading" | "categoryHeading" | "newsTitle">;
    order: number;
    rowCount: number;
    colCount: number;
  };
  auditText?: string;
  layoutFragment?: {
    index: number;
    count: number;
  };
  rows?: string[][];
  tableTemplate?: {
    order: number;
    rowCount: number;
    colCount: number;
    xml?: string;
  };
  reason: string;
  confidence: number;
}

const emptyMargins: HwpxParagraphMargins = { intent: 0, left: 0, right: 0, prev: 0, next: 0 };

export function assignHwpxStyles(
  grammar: HwpxFormatGrammar,
  nodes: HwpxSourceNode[],
  fallbackStyleMap: HwpxStyleMap
): HwpxStyleAssignment[] {
  return nodes.map((node, index) => {
    if (node.type === "tableGroup") {
      const rows = node.rows ?? [];
      const tableTemplate = selectTableTemplate(grammar, rows);

      return {
        id: `assignment-${index + 1}`,
        type: "table",
        grammarRole: "table",
        text: node.text,
        sourceNodeId: node.id,
        sourceBlockIds: node.sourceBlockIds,
        rows,
        tableTemplate,
        paragraphMargins: emptyMargins,
        line: null,
        fontSizePt: null,
        charSpacing: null,
        textColor: null,
        reason: tableTemplate === undefined ? "source table rows with no sample body table" : "source table rows matched sample body table",
        confidence: tableTemplate === undefined ? 0.5 : 0.9
      };
    }

    if (node.type === "image") {
      return {
        id: `assignment-${index + 1}`,
        type: "image",
        grammarRole: "image",
        text: node.text,
        sourceNodeId: node.id,
        sourceBlockIds: node.sourceBlockIds,
        paragraphMargins: emptyMargins,
        line: null,
        fontSizePt: null,
        charSpacing: null,
        textColor: null,
        reason: "source image is placed by asset renderer",
        confidence: 1
      };
    }

    const grammarRole = mapSourceTypeToGrammarRole(node.type);
    const grammarStyle = grammar.roles[grammarRole];
    const style = grammarStyle?.style ?? fallbackStyleForRole(grammarRole, fallbackStyleMap);
    const outputText = normalizeOutputText(grammarRole, node.text);
    const structureTable = structureTableForRole(grammar, grammarRole, outputText);

    return {
      id: `assignment-${index + 1}`,
      type: "paragraph",
      grammarRole,
      text: outputText,
      sourceNodeId: node.id,
      sourceBlockIds: node.sourceBlockIds,
      style,
      paragraphMargins: grammarStyle?.paragraphMargins ?? emptyMargins,
      line: grammarStyle?.line ?? null,
      fontSizePt: grammarStyle?.fontSizePt ?? null,
      charSpacing: grammarStyle?.charSpacing ?? null,
      textColor: grammarStyle?.textColor ?? null,
      ...(structureTable === undefined ? {} : {
        renderAs: "structureTable" as const,
        structureTable
      }),
      reason: grammarStyle?.reason ?? "fallback style map",
      confidence: grammarStyle?.confidence ?? 0.4
    };
  });
}

function mapSourceTypeToGrammarRole(nodeType: HwpxSourceNode["type"]): HwpxGrammarRole {
  switch (nodeType) {
    case "title":
      return "title";
    case "issue":
      return "issue";
    case "leadHeading":
      return "leadHeading";
    case "bodyHeading":
      return "bodyHeading";
    case "bullet":
      return "bullet";
    case "pageHeading":
      return "pageHeading";
    case "categoryHeading":
      return "categoryHeading";
    case "newsTitle":
      return "newsTitle";
    case "newsBullet":
      return "newsBullet";
    case "bodyParagraph":
    default:
      return "bodyParagraph";
  }
}

function structureTableForRole(
  grammar: HwpxFormatGrammar,
  role: HwpxGrammarRole,
  text: string
): HwpxStyleAssignment["structureTable"] | undefined {
  if (
    role !== "leadHeading" &&
    role !== "pageHeading" &&
    role !== "categoryHeading" &&
    role !== "newsTitle"
  ) {
    return undefined;
  }

  const motif = grammar.tableMotifs[role];

  if (motif !== undefined && role === "categoryHeading" && !isMatchingCategoryMotifText(motif.text ?? "", text)) {
    return undefined;
  }

  return motif === undefined
    ? undefined
    : { role, order: motif.order, rowCount: motif.rowCount, colCount: motif.colCount };
}

function isMatchingCategoryMotifText(motifText: string, sourceText: string): boolean {
  const normalizedMotif = motifText.replace(/\s+/g, "").replace(/운영/u, "");
  const normalizedSource = sourceText.replace(/\s+/g, "").replace(/운영/u, "");

  return normalizedMotif === normalizedSource;
}

function normalizeOutputText(role: HwpxGrammarRole, text: string): string {
  if (role === "bullet" || role === "newsBullet") {
    return `○ ${stripBulletMarker(text)}`;
  }

  if (role === "newsTitle") {
    return stripBulletMarker(text);
  }

  return text.trim();
}

function stripBulletMarker(text: string): string {
  return text.replace(/^\s*(?:○|[-–])\s*/u, "").trim();
}

function fallbackStyleForRole(role: HwpxGrammarRole, fallbackStyleMap: HwpxStyleMap): HwpxStyleRef {
  switch (role) {
    case "title":
      return fallbackStyleMap.title;
    case "issue":
    case "bodyParagraph":
      return fallbackStyleMap.body;
    case "leadHeading":
      return fallbackStyleMap.section;
    case "bullet":
    case "newsBullet":
      return fallbackStyleMap.dashItem;
    case "bodyHeading":
    case "pageHeading":
    case "categoryHeading":
    case "newsTitle":
      return fallbackStyleMap.section;
    default:
      return fallbackStyleMap.body;
  }
}

function selectTableTemplate(
  grammar: HwpxFormatGrammar,
  rows: string[][]
): HwpxGrammarParagraphRole extends never ? never : HwpxStyleAssignment["tableTemplate"] {
  if (grammar.bodyTableTemplates.length === 0 || rows.length === 0) {
    return undefined;
  }

  const targetColCount = Math.max(0, ...rows.map((row) => row.length));
  const targetRowCount = rows.length;

  return [...grammar.bodyTableTemplates].sort((left, right) => {
    const leftScore = Math.abs(left.colCount - targetColCount) * 100 + Math.abs(left.rowCount - targetRowCount) * 3;
    const rightScore = Math.abs(right.colCount - targetColCount) * 100 + Math.abs(right.rowCount - targetRowCount) * 3;

    return leftScore - rightScore || left.order - right.order;
  })[0];
}
