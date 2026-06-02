import type {
  HwpxCharacterProfile,
  HwpxFormatProfile,
  HwpxLineProfile,
  HwpxParagraphMargins,
  HwpxParagraphSample
} from "./formatProfile";

export interface HwpxStyleRef {
  paraPrIDRef: string;
  charPrIDRef: string;
  styleIDRef: string;
}

export interface HwpxGrammarTableTemplate {
  order: number;
  rowCount: number;
  colCount: number;
  text?: string;
  xml?: string;
}

export type HwpxGrammarRole =
  | "title"
  | "issue"
  | "leadHeading"
  | "bodyHeading"
  | "bodyParagraph"
  | "bullet"
  | "pageHeading"
  | "categoryHeading"
  | "newsTitle"
  | "newsBullet";

export interface HwpxGrammarParagraphRole {
  role: HwpxGrammarRole;
  sampleText: string;
  style: HwpxStyleRef;
  fontSizePt: number | null;
  textColor: string | null;
  charSpacing: number | null;
  paragraphMargins: HwpxParagraphMargins;
  line: HwpxLineProfile | null;
  confidence: number;
  reason: string;
}

export interface HwpxFormatGrammar {
  titleTableCount: number;
  bodyTableTemplates: HwpxGrammarTableTemplate[];
  tableMotifs: Partial<Record<Extract<HwpxGrammarRole, "leadHeading" | "pageHeading" | "categoryHeading" | "newsTitle">, HwpxGrammarTableTemplate>>;
  roles: Partial<Record<HwpxGrammarRole, HwpxGrammarParagraphRole>>;
  warnings: string[];
}

export interface AnalyzeHwpxFormatGrammarOptions {
  titleTableCount?: number;
}

interface SampleCandidate {
  sample: HwpxParagraphSample;
  style: HwpxStyleRef;
  charStyle: HwpxCharacterProfile | undefined;
  paragraphStyle: HwpxFormatProfile["paragraphStyles"][number] | undefined;
  paragraphMargins: HwpxParagraphMargins;
}

export function analyzeHwpxFormatGrammar(
  profile: HwpxFormatProfile,
  options: AnalyzeHwpxFormatGrammarOptions = {}
): HwpxFormatGrammar {
  const titleTableCount = options.titleTableCount ?? 0;
  const candidates = buildCandidates(profile);
  const warnings = collectGrammarWarnings(candidates);
  const roles: Partial<Record<HwpxGrammarRole, HwpxGrammarParagraphRole>> = {};
  const categoryHeading = findCandidate(candidates, (candidate) =>
    isBriefCategoryHeading(candidate.sample.text) && isReadableHeadingCandidate(candidate) && !isRedGuideCandidate(candidate)
  );

  setRole(roles, "title", findCandidate(candidates, (candidate) => candidate.sample.text.includes("BRIEF")), candidates);
  setRole(roles, "issue", findCandidate(candidates, (candidate) => /통권\s+제?\d+호/u.test(candidate.sample.text)), candidates);
  setRole(
    roles,
    "leadHeading",
    findCandidate(candidates, (candidate) =>
      candidate.sample.insideTable &&
      candidate.sample.tableOrdinal !== null &&
      candidate.sample.tableOrdinal >= titleTableCount &&
      isReadableHeadingCandidate(candidate) &&
      !isRedGuideCandidate(candidate) &&
      !candidate.sample.text.includes("BRIEF") &&
      !/통권\s+제?\d+호/u.test(candidate.sample.text)
    ),
    candidates
  );
  setRole(roles, "pageHeading", findCandidate(candidates, (candidate) => candidate.sample.text === "탄소중립 정보공유"), candidates);
  setRole(roles, "categoryHeading", categoryHeading, candidates);
  setRole(
    roles,
    "bullet",
    findCandidate(candidates, (candidate) => isBulletText(candidate.sample.text) && !candidate.sample.insideTable),
    candidates
  );
  setRole(
    roles,
    "newsBullet",
    findAfter(candidates, categoryHeading, (candidate) => isBulletText(candidate.sample.text) && !candidate.sample.insideTable) ??
      findCandidate(candidates, (candidate) => isBulletText(candidate.sample.text) && !candidate.sample.insideTable),
    candidates
  );
  setRole(
    roles,
    "newsTitle",
    findAfter(candidates, categoryHeading, (candidate) =>
      !candidate.sample.insideTable &&
      isReadableHeadingCandidate(candidate) &&
      !isRedGuideCandidate(candidate) &&
      !isBulletText(candidate.sample.text) &&
      !isBriefCategoryHeading(candidate.sample.text) &&
      !isBriefPageHeading(candidate.sample.text) &&
      isLikelyNewsTitle(candidate.sample.text)
    ),
    candidates
  );
  const bodyHeading = findCandidate(candidates, (candidate) =>
      !candidate.sample.insideTable &&
      isReadableHeadingCandidate(candidate) &&
      !isRedGuideCandidate(candidate) &&
      !isBulletText(candidate.sample.text) &&
      !isRejectedGeneratedSampleText(candidate.sample.text) &&
      !isBriefCategoryHeading(candidate.sample.text) &&
      !candidate.sample.text.includes("BRIEF") &&
      !/통권\s+제?\d+호/u.test(candidate.sample.text)
  );
  setRole(roles, "bodyHeading", bodyHeading, candidates);
  setRole(
    roles,
    "bodyParagraph",
    findBodyParagraphCandidate(candidates, bodyHeading),
    candidates
  );

  return {
    titleTableCount,
    bodyTableTemplates: profile.tables
      .filter((table) => table.order >= titleTableCount && table.colCount > 1)
      .map((table) => ({
        order: table.order,
        rowCount: table.rowCount,
        colCount: table.colCount,
        text: table.text
      })),
    tableMotifs: inferTableMotifs(profile, titleTableCount),
    roles,
    warnings
  };
}

function inferTableMotifs(
  profile: HwpxFormatProfile,
  titleTableCount: number
): HwpxFormatGrammar["tableMotifs"] {
  const oneCellTables = profile.tables.filter((table) =>
    table.order >= titleTableCount &&
    table.colCount === 1 &&
    table.rowCount <= 2 &&
    table.text.trim().length > 0 &&
    table.paragraphCount <= 2 &&
    !isRejectedGeneratedSampleText(table.text)
  );
  const pageHeading = oneCellTables.find((table) => table.text.trim() === "탄소중립 정보공유");
  const categoryHeading = oneCellTables.find((table) => {
    const text = table.text.trim();
    return text === "센터 소식" || text === "센터운영소식";
  });
  const leadHeading = oneCellTables.find((table) =>
    table !== pageHeading &&
    table !== categoryHeading &&
    !table.text.includes("BRIEF") &&
    !/통권\s+제?\d+호/u.test(table.text)
  );
  const newsTitle = oneCellTables.find((table) =>
    table !== leadHeading &&
    table !== pageHeading &&
    table !== categoryHeading &&
    isLikelyNewsTitle(table.text.trim())
  );

  return {
    ...(leadHeading === undefined ? {} : { leadHeading: tableTemplateFromProfile(leadHeading) }),
    ...(pageHeading === undefined ? {} : { pageHeading: tableTemplateFromProfile(pageHeading) }),
    ...(categoryHeading === undefined ? {} : { categoryHeading: tableTemplateFromProfile(categoryHeading) }),
    ...(newsTitle === undefined ? {} : { newsTitle: tableTemplateFromProfile(newsTitle) })
  };
}

function tableTemplateFromProfile(table: HwpxFormatProfile["tables"][number]): HwpxGrammarTableTemplate {
  return {
    order: table.order,
    rowCount: table.rowCount,
    colCount: table.colCount,
    text: table.text
  };
}

function buildCandidates(profile: HwpxFormatProfile): SampleCandidate[] {
  return profile.paragraphSamples
    .map((sample) => {
      if (sample.paraPrIDRef === null || sample.charPrIDRef === null || sample.styleIDRef === null) {
        return null;
      }

      const paragraphStyle = profile.paragraphStyles.find((style) => style.id === sample.paraPrIDRef);

      return {
        sample,
        style: {
          paraPrIDRef: sample.paraPrIDRef,
          charPrIDRef: sample.charPrIDRef,
          styleIDRef: sample.styleIDRef
        },
        charStyle: profile.characterStyles.find((style) => style.id === sample.charPrIDRef),
        paragraphStyle,
        paragraphMargins: paragraphStyle?.margins ?? { intent: 0, left: 0, right: 0, prev: 0, next: 0 }
      };
    })
    .filter((candidate): candidate is SampleCandidate => candidate !== null);
}

function collectGrammarWarnings(candidates: SampleCandidate[]): string[] {
  const warnings: string[] = [];

  if (candidates.some((candidate) => isPotentialHeading(candidate.sample.text) && !isReadableCandidate(candidate))) {
    warnings.push("tiny heading samples were ignored for generated headings.");
  }

  if (candidates.some((candidate) => isPotentialHeading(candidate.sample.text) && isRedGuideCandidate(candidate))) {
    warnings.push("red guide heading samples were ignored for generated body headings.");
  }

  return warnings;
}

function setRole(
  roles: Partial<Record<HwpxGrammarRole, HwpxGrammarParagraphRole>>,
  role: HwpxGrammarRole,
  candidate: SampleCandidate | undefined,
  candidates: SampleCandidate[]
): void {
  if (candidate === undefined) {
    return;
  }
  const resolvedParagraph = resolveParagraphForRole(role, candidate, candidates);
  const resolvedCharacter = resolveCharacterForRole(role, candidate, candidates);
  const reasons = [reasonForRole(role, candidate)];

  if (resolvedParagraph.normalized) {
    reasons.push("normalized non-bullet indent");
  }

  if (resolvedCharacter.normalized) {
    reasons.push("normalized generated text color");
  }

  roles[role] = {
    role,
    sampleText: candidate.sample.text,
    style: {
      ...candidate.style,
      paraPrIDRef: resolvedParagraph.paraPrIDRef,
      charPrIDRef: resolvedCharacter.charPrIDRef
    },
    fontSizePt: resolvedCharacter.charStyle?.fontSizePt ?? null,
    textColor: resolvedCharacter.charStyle?.textColor ?? null,
    charSpacing: resolvedCharacter.charStyle?.charSpacing ?? null,
    paragraphMargins: resolvedParagraph.margins,
    line: candidate.sample.line,
    confidence: confidenceForRole(role, candidate),
    reason: reasons.join("; ")
  };
}

function resolveParagraphForRole(
  role: HwpxGrammarRole,
  candidate: SampleCandidate,
  candidates: SampleCandidate[]
): { paraPrIDRef: string; margins: HwpxParagraphMargins; normalized: boolean } {
  if (!shouldNormalizeNonBulletIndent(role) || candidate.paragraphMargins.intent >= 0) {
    return { paraPrIDRef: candidate.style.paraPrIDRef, margins: candidate.paragraphMargins, normalized: false };
  }

  const replacement = candidates.find((item) =>
    item.paragraphMargins.intent >= 0 &&
    item.style.paraPrIDRef !== candidate.style.paraPrIDRef &&
    !item.sample.insideTable &&
    item.paragraphStyle?.align.horizontal !== "CENTER" &&
    isReadableCandidate(item) &&
    !isRedGuideCandidate(item)
  );

  return {
    paraPrIDRef: replacement?.style.paraPrIDRef ?? candidate.style.paraPrIDRef,
    margins: replacement?.paragraphMargins ?? { ...candidate.paragraphMargins, intent: 0 },
    normalized: replacement !== undefined
  };
}

function shouldNormalizeNonBulletIndent(role: HwpxGrammarRole): boolean {
  return role === "leadHeading" || role === "bodyHeading" || role === "bodyParagraph" || role === "newsTitle";
}

function findBodyParagraphCandidate(
  candidates: SampleCandidate[],
  bodyHeading: SampleCandidate | undefined
): SampleCandidate | undefined {
  return findCandidate(candidates, (candidate) =>
    candidate !== bodyHeading &&
    !candidate.sample.insideTable &&
    isReadableCandidate(candidate) &&
    !isRedGuideCandidate(candidate) &&
    !isRejectedGeneratedSampleText(candidate.sample.text) &&
    !isBulletText(candidate.sample.text) &&
    !isBriefCategoryHeading(candidate.sample.text) &&
    !candidate.sample.text.includes("BRIEF") &&
    !/통권\s+제?\d+호/u.test(candidate.sample.text) &&
    cleanSampleText(candidate.sample.text).length >= 20 &&
    !isPotentialHeading(candidate.sample.text)
  ) ??
    findCandidate(candidates, (candidate) =>
      candidate !== bodyHeading &&
      !candidate.sample.insideTable &&
      isReadableCandidate(candidate) &&
      !isRedGuideCandidate(candidate) &&
      !isRejectedGeneratedSampleText(candidate.sample.text) &&
      isBulletText(candidate.sample.text)
    );
}

function resolveCharacterForRole(
  role: HwpxGrammarRole,
  candidate: SampleCandidate,
  candidates: SampleCandidate[]
): { charPrIDRef: string; charStyle: HwpxCharacterProfile | undefined; normalized: boolean } {
  if (!shouldNormalizeGeneratedTextColor(role) || isBlackText(candidate.charStyle)) {
    return {
      charPrIDRef: candidate.style.charPrIDRef,
      charStyle: candidate.charStyle,
      normalized: false
    };
  }

  const replacement = candidates
    .filter((item) =>
      !item.sample.insideTable &&
      isBlackText(item.charStyle) &&
      isReadableCandidate(item)
    )
    .sort((left, right) =>
      characterReplacementScore(left, candidate) - characterReplacementScore(right, candidate)
    )[0];

  return {
    charPrIDRef: replacement?.style.charPrIDRef ?? candidate.style.charPrIDRef,
    charStyle: replacement?.charStyle ?? candidate.charStyle,
    normalized: replacement !== undefined
  };
}

function shouldNormalizeGeneratedTextColor(role: HwpxGrammarRole): boolean {
  return role === "bodyHeading" ||
    role === "bodyParagraph" ||
    role === "pageHeading" ||
    role === "categoryHeading" ||
    role === "newsTitle";
}

function isBlackText(charStyle: HwpxCharacterProfile | undefined): boolean {
  return charStyle?.textColor === null ||
    charStyle?.textColor === undefined ||
    charStyle.textColor.toUpperCase() === "#000000";
}

function characterReplacementScore(candidate: SampleCandidate, target: SampleCandidate): number {
  const candidateSize = candidate.charStyle?.fontSizePt ?? 10;
  const targetSize = target.charStyle?.fontSizePt ?? candidateSize;
  const sizeScore = Math.abs(candidateSize - targetSize) * 100;
  const boldScore = candidate.charStyle?.bold === target.charStyle?.bold ? 0 : 50;

  return sizeScore + boldScore + candidate.sample.ordinal / 1000;
}

function findCandidate(
  candidates: SampleCandidate[],
  predicate: (candidate: SampleCandidate) => boolean
): SampleCandidate | undefined {
  return candidates.find(predicate);
}

function findAfter(
  candidates: SampleCandidate[],
  anchor: SampleCandidate | undefined,
  predicate: (candidate: SampleCandidate) => boolean
): SampleCandidate | undefined {
  const startOrdinal = anchor?.sample.ordinal;

  if (startOrdinal === undefined) {
    return undefined;
  }

  return candidates.find((candidate) => candidate.sample.ordinal > startOrdinal && predicate(candidate));
}

function confidenceForRole(role: HwpxGrammarRole, candidate: SampleCandidate): number {
  if (role === "bullet" || role === "newsBullet") {
    return candidate.paragraphMargins.intent < 0 ? 0.95 : 0.75;
  }

  return isReadableCandidate(candidate) && !isRedGuideCandidate(candidate) ? 0.9 : 0.5;
}

function reasonForRole(role: HwpxGrammarRole, candidate: SampleCandidate): string {
  if (role === "bullet" || role === "newsBullet") {
    return candidate.paragraphMargins.intent < 0
      ? "matched bullet text and measured hanging indent"
      : "matched bullet text";
  }

  if (isReadableCandidate(candidate)) {
    return "matched readable sample paragraph";
  }

  return "matched sample paragraph";
}

function isReadableCandidate(candidate: SampleCandidate): boolean {
  return candidate.charStyle?.fontSizePt === null ||
    candidate.charStyle?.fontSizePt === undefined ||
    candidate.charStyle.fontSizePt >= 8;
}

function isReadableHeadingCandidate(candidate: SampleCandidate): boolean {
  return candidate.charStyle?.fontSizePt === null ||
    candidate.charStyle?.fontSizePt === undefined ||
    candidate.charStyle.fontSizePt >= 10;
}

function isRedGuideCandidate(candidate: SampleCandidate): boolean {
  return candidate.charStyle?.textColor?.toUpperCase() === "#FF0000";
}

function isPotentialHeading(text: string): boolean {
  const cleanText = cleanSampleText(text);

  return (
    cleanText.length > 0 &&
    !isBulletText(cleanText) &&
    (cleanText.length <= 40 || isBriefCategoryHeading(cleanText) || /^\d+\.\s+\S/u.test(cleanText))
  );
}

function isRejectedGeneratedSampleText(text: string): boolean {
  const cleanText = cleanSampleText(text);

  return cleanText.length === 0 ||
    /^<[^>]+>$/u.test(cleanText) ||
    /^<?\d+\s*페이지>?$/u.test(cleanText) ||
    /^\*\s+/u.test(cleanText) ||
    /(?:^|\s)출처\s*[:：]/u.test(cleanText) ||
    cleanText.includes("자세히 보기") ||
    cleanText.startsWith("링크") ||
    cleanText.startsWith("http");
}

function isBulletText(text: string): boolean {
  return /^\s*(?:○|[-–])\s*\S/u.test(text);
}

function isLikelyNewsTitle(text: string): boolean {
  const cleanText = cleanSampleText(text);

  return (
    cleanText.length > 0 &&
    cleanText.length <= 80 &&
    cleanText === text.trim() &&
    !cleanText.endsWith("함") &&
    !cleanText.endsWith("임") &&
    !cleanText.includes(":") &&
    !cleanText.startsWith("http") &&
    !cleanText.includes("자세히")
  );
}

function isBriefPageHeading(text: string): boolean {
  return cleanSampleText(text) === "탄소중립 정보공유";
}

function isBriefCategoryHeading(text: string): boolean {
  const cleanText = cleanSampleText(text);

  return cleanText === "전국 소식" || cleanText === "울산 소식" || cleanText === "센터 소식";
}

function cleanSampleText(text: string): string {
  return text.replace(/<[^>]*>/gu, "").replace(/\s+/gu, " ").trim();
}
