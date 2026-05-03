import type { HwpxStyleAssignment } from "./styleAssignment";

export interface LayoutSafetyOptions {
  maxEstimatedLinesPerParagraph?: number;
}

const defaultMaxEstimatedLinesPerParagraph = 8;

export function applyLayoutSafety(
  assignments: HwpxStyleAssignment[],
  options: LayoutSafetyOptions = {}
): HwpxStyleAssignment[] {
  const maxEstimatedLinesPerParagraph =
    options.maxEstimatedLinesPerParagraph ?? defaultMaxEstimatedLinesPerParagraph;

  return assignments.flatMap((assignment) =>
    splitAssignmentIfNeeded(assignment, maxEstimatedLinesPerParagraph)
  );
}

function splitAssignmentIfNeeded(
  assignment: HwpxStyleAssignment,
  maxEstimatedLinesPerParagraph: number
): HwpxStyleAssignment[] {
  if (!isSplittableParagraph(assignment) || maxEstimatedLinesPerParagraph < 1) {
    return [assignment];
  }

  const text = assignment.text.trim();

  if (text.length === 0 || estimateLineCount(assignment, text) <= maxEstimatedLinesPerParagraph) {
    return [assignment];
  }

  const hasBulletMarker = assignment.grammarRole === "bullet" || assignment.grammarRole === "newsBullet";
  const bodyText = hasBulletMarker ? stripBulletMarker(text) : text;
  const maxChars = Math.max(12, estimateCharsPerLine(assignment) * maxEstimatedLinesPerParagraph);
  const fragments = chunkText(bodyText, maxChars)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)
    .map((fragment) => hasBulletMarker ? `○ ${fragment}` : fragment);

  if (fragments.length <= 1) {
    return [assignment];
  }

  return fragments.map((fragment, index) => ({
    ...assignment,
    id: `${assignment.id}-fragment-${index + 1}`,
    text: fragment,
    auditText: assignment.auditText ?? assignment.text,
    layoutFragment: {
      index: index + 1,
      count: fragments.length
    }
  }));
}

function isSplittableParagraph(assignment: HwpxStyleAssignment): boolean {
  return (
    assignment.type === "paragraph" &&
    (
      assignment.grammarRole === "bodyParagraph" ||
      assignment.grammarRole === "bullet" ||
      assignment.grammarRole === "newsBullet"
    )
  );
}

function estimateLineCount(assignment: HwpxStyleAssignment, text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / estimateCharsPerLine(assignment)));
}

function estimateCharsPerLine(assignment: HwpxStyleAssignment): number {
  const textHeight = assignment.line?.textHeight ??
    (assignment.fontSizePt === null ? 1000 : Math.round(assignment.fontSizePt * 100));
  const horzSize = assignment.line?.horzSize ?? 42520;

  return Math.max(12, Math.floor(horzSize / Math.max(1, textHeight * 0.95)));
}

function stripBulletMarker(text: string): string {
  return text.replace(/^\s*(?:○|[-–])\s*/u, "").trim();
}

function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const units = splitSentenceUnits(text);

  let current = "";

  for (const unit of units) {
    if (current.length === 0) {
      if (unit.length <= maxChars) {
        current = unit;
      } else {
        chunks.push(...splitLongUnit(unit, maxChars));
      }
      continue;
    }

    const candidate = `${current} ${unit}`;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    chunks.push(current);

    if (unit.length <= maxChars) {
      current = unit;
    } else {
      const split = splitLongUnit(unit, maxChars);
      chunks.push(...split.slice(0, -1));
      current = split.at(-1) ?? "";
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function splitSentenceUnits(text: string): string[] {
  const matches = text.match(/[^.!?。！？]+[.!?。！？]?/gu);

  if (matches === null) {
    return [text.trim()].filter((unit) => unit.length > 0);
  }

  return matches.map((unit) => unit.trim()).filter((unit) => unit.length > 0);
}

function splitLongUnit(unit: string, maxChars: number): string[] {
  const words = unit.split(/\s+/u).filter((word) => word.length > 0);

  if (words.length <= 1) {
    return hardSplit(unit, maxChars);
  }

  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...hardSplit(word, maxChars));
      continue;
    }

    if (current.length === 0) {
      current = word;
      continue;
    }

    const candidate = `${current} ${word}`;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    current = word;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function hardSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }

  return chunks;
}
