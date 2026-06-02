import type { DocumentBlock, DocumentImageAsset } from "../document/types";

export type HwpxSourceNodeType =
  | "title"
  | "issue"
  | "leadHeading"
  | "bodyHeading"
  | "bodyParagraph"
  | "bullet"
  | "pageHeading"
  | "categoryHeading"
  | "newsTitle"
  | "newsBullet"
  | "tableGroup"
  | "image";

export interface HwpxSourceNode {
  id: string;
  type: HwpxSourceNodeType;
  text: string;
  sourceBlockIds: string[];
  rows?: string[][];
  asset?: DocumentImageAsset;
}

export function buildHwpxSourceStructure(blocks: DocumentBlock[]): HwpxSourceNode[] {
  const nodes: HwpxSourceNode[] = [];
  let blockIndex = 0;

  while (blockIndex < blocks.length) {
    const block = blocks[blockIndex];

    if (block === undefined || block.text.trim().length === 0) {
      blockIndex += 1;
      continue;
    }

    if (block.role === "tableRow") {
      const tableBlocks: DocumentBlock[] = [];

      while (blocks[blockIndex]?.role === "tableRow") {
        tableBlocks.push(blocks[blockIndex]);
        blockIndex += 1;
      }

      nodes.push({
        id: `source-node-${nodes.length + 1}`,
        type: "tableGroup",
        text: tableBlocks.map((tableBlock) => tableBlock.text).join("\n"),
        rows: tableBlocks.map((tableBlock) => splitTableRow(tableBlock.text)),
        sourceBlockIds: tableBlocks.map((tableBlock) => tableBlock.id)
      });
      continue;
    }

    if (block.role === "image") {
      nodes.push({
        id: `source-node-${nodes.length + 1}`,
        type: "image",
        text: block.text.trim(),
        sourceBlockIds: [block.id],
        asset: block.asset
      });
      blockIndex += 1;
      continue;
    }

    if (blockIndex === 0 && block.role === "title") {
      const splitTitle = splitBriefTitle(block.text);

      if (splitTitle !== null) {
        nodes.push(createTextNode(nodes.length, "title", splitTitle.title, block.id));
        nodes.push(createTextNode(nodes.length, "issue", splitTitle.issue, block.id));
        blockIndex += 1;
        continue;
      }
    }

    const strippedText = stripDashMarker(block.text.trim());
    const type = classifyTextBlock(block, blocks, blockIndex, strippedText, nodes);

    nodes.push(createTextNode(nodes.length, type, type === "bullet" || type === "newsBullet" || type === "newsTitle" ? strippedText : block.text.trim(), block.id));
    blockIndex += 1;
  }

  return nodes;
}

function createTextNode(index: number, type: HwpxSourceNodeType, text: string, sourceBlockId: string): HwpxSourceNode {
  return {
    id: `source-node-${index + 1}`,
    type,
    text,
    sourceBlockIds: [sourceBlockId]
  };
}

function classifyTextBlock(
  block: DocumentBlock,
  blocks: DocumentBlock[],
  index: number,
  strippedText: string,
  existingNodes: HwpxSourceNode[]
): HwpxSourceNodeType {
  const text = block.text.trim();

  if (block.role === "title") {
    return "title";
  }

  if (isBriefPageHeading(text)) {
    return "pageHeading";
  }

  if (isBriefCategoryHeading(text)) {
    return "categoryHeading";
  }

  if (block.role === "body" && isLeadHeadingCandidate(text, blocks, index, existingNodes)) {
    return "leadHeading";
  }

  if (block.role === "section" || block.role === "koreanItem") {
    return "bodyHeading";
  }

  if (block.role === "dashItem") {
    if (isInBriefNewsSection(blocks, index)) {
      return isLikelyGeneratedNewsTitle(strippedText, blocks, index) ? "newsTitle" : "newsBullet";
    }

    return "bullet";
  }

  return "bodyParagraph";
}

function isLeadHeadingCandidate(
  text: string,
  blocks: DocumentBlock[],
  index: number,
  existingNodes: HwpxSourceNode[]
): boolean {
  if (
    text.length === 0 ||
    text.length > 80 ||
    isBriefPageHeading(text) ||
    isBriefCategoryHeading(text) ||
    existingNodes.some((node) => node.type !== "title" && node.type !== "issue")
  ) {
    return false;
  }

  const next = findNextMeaningfulBlock(blocks, index);
  return next?.role === "section" || next?.role === "dashItem";
}

function splitBriefTitle(text: string): { title: string; issue: string } | null {
  const match = text.trim().match(/^(.*?\bBRIEF)\s+(통권\s+제?\d+호\([^)]+\))$/u);

  if (match === null) {
    return null;
  }

  return { title: match[1] ?? "", issue: match[2] ?? "" };
}

function splitTableRow(text: string): string[] {
  return text
    .split("\t")
    .map((cell) => cell.trim())
    .filter((cell, index, cells) => cell.length > 0 || index < cells.length - 1);
}

function stripDashMarker(text: string): string {
  return text.replace(/^\s*[-–]\s*/u, "").trim();
}

function isBriefPageHeading(text: string): boolean {
  return text === "탄소중립 정보공유";
}

function isBriefCategoryHeading(text: string): boolean {
  return text === "전국 소식" || text === "울산 소식" || text === "센터 소식";
}

function isInBriefNewsSection(blocks: DocumentBlock[], index: number): boolean {
  return findCurrentBriefCategory(blocks, index) !== undefined;
}

function findCurrentBriefCategory(blocks: DocumentBlock[], index: number): string | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const currentBlock = blocks[current];
    const text = currentBlock?.text.trim() ?? "";

    if (isBriefCategoryHeading(text) || isBriefPageHeading(text)) {
      return text;
    }

    if (currentBlock?.role === "section") {
      return undefined;
    }
  }

  return undefined;
}

function isLikelyGeneratedNewsTitle(text: string, blocks: DocumentBlock[], index: number): boolean {
  const previousMeaningfulBlock = findPreviousMeaningfulBlock(blocks, index);
  const nextMeaningfulBlock = findNextMeaningfulBlock(blocks, index);

  if (previousMeaningfulBlock !== undefined && isBriefCategoryHeading(previousMeaningfulBlock.text.trim())) {
    return true;
  }

  if (text.length > 80 || text.includes(":") || text.endsWith("함") || text.endsWith("임")) {
    return false;
  }

  return nextMeaningfulBlock?.role === "dashItem";
}

function findPreviousMeaningfulBlock(blocks: DocumentBlock[], index: number): DocumentBlock | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const block = blocks[current];

    if (block !== undefined && block.text.trim().length > 0) {
      return block;
    }
  }

  return undefined;
}

function findNextMeaningfulBlock(blocks: DocumentBlock[], index: number): DocumentBlock | undefined {
  for (let current = index + 1; current < blocks.length; current += 1) {
    const block = blocks[current];

    if (block !== undefined && block.text.trim().length > 0) {
      return block;
    }
  }

  return undefined;
}
