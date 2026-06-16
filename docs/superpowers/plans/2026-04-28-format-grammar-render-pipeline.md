# Format Grammar Render Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the HWPX generation path so sample formatting is extracted into an explicit document grammar, source content is classified into structured roles, and output paragraphs/tables are rendered from measured sample values instead of scattered heuristics.

**Architecture:** Keep HWPX XML generation deterministic and LLM-free by default. Split the current monolithic renderer into a pipeline: `formatProfile` extracts raw measurements, `formatGrammar` infers reusable template roles, `sourceStructure` groups Notion/source blocks, `styleAssignment` maps roles to measured styles, `render` consumes assignments, and `quality` validates the generated HWPX against the source and grammar.

**Tech Stack:** TypeScript, Vite, Vitest, fflate, browser DOMParser test environment, HWPX XML.

---

## File Structure

- Create: `src/features/hwpx/formatGrammar.ts`
  - Converts `HwpxFormatProfile` and sample section XML into semantic roles such as title table, body heading, category heading, news title, bullet, body paragraph, and body table.
  - Stores role confidence and reason strings for UI/debug reports.
- Create: `src/features/hwpx/sourceStructure.ts`
  - Converts `DocumentBlock[]` into grouped source nodes: title, issue, heading, bullet group, prose heading, prose body, table group, image.
  - Keeps source order and table/image presence as the authority for whether body tables/images should be generated.
- Create: `src/features/hwpx/styleAssignment.ts`
  - Assigns each source node to a grammar role and concrete HWPX paragraph/character/table style.
  - Produces an inspectable assignment report for each output paragraph.
- Modify: `src/features/hwpx/formatProfile.ts`
  - Add paragraph text samples, line metrics, paragraph IDs, and run style samples so grammar extraction does not re-parse XML ad hoc.
- Modify: `src/features/hwpx/template.ts`
  - Attach `formatGrammar` to `HwpxTemplate`.
  - Keep the legacy `styleMap` for fallback compatibility only.
- Modify: `src/features/hwpx/render.ts`
  - Route `auto` body generation through source nodes and style assignments.
  - Preserve title region policy, but remove body tables unless the source has table groups.
  - Render line caches from assigned style metrics, paragraph spacing, and hanging-indent measurements.
- Modify: `src/features/hwpx/quality.ts`
  - Validate table policy, bullet indentation, readable heading sizes, red guide styles, source coverage, and paragraph gaps.
  - Expose a JSON-friendly report.
- Modify: `src/panel/App.tsx`
  - Show a concise "서식 매핑 보고서" with role, source text, chosen sample style, and warnings.
- Test: `src/test/hwpx-format-grammar.test.ts`
  - Unit tests for grammar extraction.
- Test: `src/test/hwpx-source-structure.test.ts`
  - Unit tests for source grouping and table/image policy.
- Test: `src/test/hwpx-style-assignment.test.ts`
  - Unit tests for style role mapping and outlier rejection.
- Test: `src/test/hwpx-render.test.ts`
  - Regression tests for body table removal, bullet indentation, paragraph spacing, and readable news/center headings.
- Test: `src/test/hwpx-quality.test.ts`
  - Quality report tests for generated HWPX.

## Invariants

- Input content controls body structure:
  - If source has no table rows, generated body has no body tables.
  - If source has no image blocks, generated body has no source images.
  - Sample title tables can be preserved as title structure, but sample body tables are not preserved as decorative content.
- Sample formatting controls style:
  - Page margins, paragraph margins, line spacing, font size, char spacing, font face, color, bold, and table cell styles come from the sample when present.
  - Generated bullet continuation lines use the sample paragraph hanging indent (`intent < 0`) or measured line indent.
  - Paragraph gaps use sample `prev`/`next` margins first, then role-group spacing derived from sample repeated patterns.
- Outliers are rejected:
  - Heading candidates below 8pt are not used for generated headings.
  - Red guide/instruction styles are not used for generated body headings unless the source itself requires red text.
  - Empty spacer paragraphs can inform spacing, but not text style.
- Every generated paragraph should have a report row:
  - source block id/text
  - source node type
  - assigned grammar role
  - paraPrIDRef/charPrIDRef/styleIDRef
  - font size, char spacing, margins, line spacing
  - reason and confidence

## Task 1: Format Profile Paragraph Samples

**Files:**
- Modify: `src/features/hwpx/formatProfile.ts`
- Create: `src/test/hwpx-format-grammar.test.ts`

- [ ] **Step 1: Write failing profile test**

Add a test that loads a synthetic HWPX section containing a normal heading, a tiny spacer heading, a bullet paragraph with `intent="-1800"`, and a table. Assert that the analyzer exposes paragraph samples with text, style refs, char size, paragraph margins, and first line metrics.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/test/hwpx-format-grammar.test.ts`

Expected: fail because `paragraphSamples` and grammar APIs do not exist yet.

- [ ] **Step 3: Extend `HwpxFormatProfile`**

Add `paragraphSamples: HwpxParagraphSample[]` with:

```ts
export interface HwpxParagraphSample {
  ordinal: number;
  id: string | null;
  text: string;
  paraPrIDRef: string | null;
  styleIDRef: string | null;
  charPrIDRef: string | null;
  insideTable: boolean;
  tableOrdinal: number | null;
  line: HwpxLineProfile | null;
}
```

- [ ] **Step 4: Implement extraction**

Parse all `hp:p` elements in order, including table cell paragraphs. Reuse existing XML helpers in `formatProfile.ts`; do not move rendering helpers into the analyzer yet.

- [ ] **Step 5: Verify focused test passes**

Run: `npm test -- src/test/hwpx-format-grammar.test.ts`

Expected: pass.

## Task 2: Template Grammar Extraction

**Files:**
- Create: `src/features/hwpx/formatGrammar.ts`
- Modify: `src/features/hwpx/template.ts`
- Test: `src/test/hwpx-format-grammar.test.ts`

- [ ] **Step 1: Write failing grammar tests**

Cover:
- title tables are counted as title region, not body table grammar
- body bullet role uses a paragraph sample whose text starts with `○`, `-`, or `–`
- category headings prefer readable `센터 소식`/`전국 소식` samples
- tiny 5pt heading samples are rejected
- red guide styles are marked with a warning and not selected as default body heading

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/test/hwpx-format-grammar.test.ts`

- [ ] **Step 3: Implement grammar model**

Create:

```ts
export interface HwpxFormatGrammar {
  titleTableCount: number;
  bodyTableTemplates: HwpxGrammarTableTemplate[];
  roles: Partial<Record<HwpxGrammarRole, HwpxGrammarParagraphRole>>;
  warnings: string[];
}

export type HwpxGrammarRole =
  | "title"
  | "issue"
  | "bodyHeading"
  | "bodyParagraph"
  | "bullet"
  | "pageHeading"
  | "categoryHeading"
  | "newsTitle"
  | "newsBullet";
```

- [ ] **Step 4: Implement role selection**

Use sample paragraph text, style refs, char size, color, margins, line metrics, and table context. Keep confidence/reason fields so UI can explain decisions.

- [ ] **Step 5: Attach grammar to template**

Add `formatGrammar` to `HwpxTemplate` in `template.ts`.

- [ ] **Step 6: Verify grammar tests pass**

Run: `npm test -- src/test/hwpx-format-grammar.test.ts`

## Task 3: Source Structure

**Files:**
- Create: `src/features/hwpx/sourceStructure.ts`
- Test: `src/test/hwpx-source-structure.test.ts`

- [ ] **Step 1: Write failing source grouping tests**

Cover:
- title is split into title/issue when BRIEF issue text is embedded
- consecutive `tableRow` blocks become one `tableGroup`
- source with no `tableRow` produces zero table groups
- bullet runs under news/category headings become `newsTitle` plus `newsBullet` when appropriate
- images are kept as image nodes but never copied from the sample

- [ ] **Step 2: Run focused test**

Run: `npm test -- src/test/hwpx-source-structure.test.ts`

- [ ] **Step 3: Implement source node types and grouping**

Use `DocumentBlock[]` as input and return ordered nodes with source block ids. Do not infer formatting here.

- [ ] **Step 4: Verify focused test passes**

Run: `npm test -- src/test/hwpx-source-structure.test.ts`

## Task 4: Style Assignment

**Files:**
- Create: `src/features/hwpx/styleAssignment.ts`
- Test: `src/test/hwpx-style-assignment.test.ts`

- [ ] **Step 1: Write failing style assignment tests**

Cover:
- bullet nodes receive the grammar bullet style and normalized `○` marker
- wrapped bullet continuation indent is derived from assigned paragraph style
- category headings never use tiny 5pt samples
- `센터 소식` and following generated title use readable heading/title styles
- source without tables gets no body table assignments

- [ ] **Step 2: Run focused test**

Run: `npm test -- src/test/hwpx-style-assignment.test.ts`

- [ ] **Step 3: Implement assignments**

Create assignment rows with source node id, output text, role, style, table template, and reason.

- [ ] **Step 4: Verify focused test passes**

Run: `npm test -- src/test/hwpx-style-assignment.test.ts`

## Task 5: Renderer Integration

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Modify: `src/test/hwpx-render.test.ts`

- [ ] **Step 1: Write failing render regressions**

Add tests proving:
- body tables are absent when source has no table rows
- body table is cloned only when source has table rows
- bullet continuation lines have positive `horzpos`
- heading after bullet group has a larger vertical gap
- center/news headings are readable and not tiny/red

- [ ] **Step 2: Run render tests and confirm failure where behavior is missing**

Run: `npm test -- src/test/hwpx-render.test.ts`

- [ ] **Step 3: Route auto body rendering through assignments**

Keep existing title region replacement, but replace body style inference with:

```ts
const sourceNodes = buildSourceStructure(bodyBlocks);
const assignments = assignHwpxStyles(template.formatGrammar, sourceNodes, template.styleMap);
const bodyParagraphs = renderAssignedBody(assignments, layoutState);
```

- [ ] **Step 4: Keep table rendering content-driven**

Only render `tableGroup` assignments. Use grammar body table templates when present; otherwise render rows as paragraph fallback.

- [ ] **Step 5: Verify focused render tests pass**

Run: `npm test -- src/test/hwpx-render.test.ts`

## Task 6: Quality Report and UI

**Files:**
- Modify: `src/features/hwpx/quality.ts`
- Modify: `src/panel/App.tsx`
- Modify: `src/panel/styles.css`
- Test: `src/test/hwpx-quality.test.ts`

- [ ] **Step 1: Write failing quality tests**

Cover:
- warning when generated body table count does not match source table groups
- warning when bullet continuation lines are not indented
- warning when generated heading font size is below 8pt
- warning when generated body heading uses red guide style
- info rows for successful style assignment coverage

- [ ] **Step 2: Implement JSON-friendly quality report**

Expose assignment rows and generated XML checks without requiring Hancom.

- [ ] **Step 3: Add UI report panel**

Show role, selected style, font size, char spacing, indent, and warning count. Keep advanced controls compact.

- [ ] **Step 4: Verify tests and build**

Run:
- `npm test`
- `npm run build`

## Task 7: Real Sample Generation Loop

**Files:**
- Modify only if tests reveal a deterministic gap.

- [ ] **Step 1: Generate output from the current public Notion link and sample HWPX**

Use `/Users/hyeon/Desktop/hwp-result` as the output directory.

- [ ] **Step 2: Inspect generated HWPX programmatically**

Check:
- title table count
- body table count
- sample image absence unless source has images
- bullet continuation `horzpos`
- heading font sizes
- red styles
- source block coverage

- [ ] **Step 3: Save debug report**

Write a `.json` report next to the `.hwpx` output.

- [ ] **Step 4: Run final verification**

Run:
- `npm test`
- `npm run build`
- `git diff --check`

## Self-Review

- Spec coverage:
  - Bullet indentation, paragraph spacing, char spacing, font size, title tables, body table policy, source table policy, UI report, and LLM-free deterministic behavior are covered.
- Placeholder scan:
  - This plan intentionally avoids open TODOs; every task has a test-first command and concrete implementation target.
- Type consistency:
  - `HwpxFormatProfile`, `HwpxFormatGrammar`, source nodes, and assignment rows are explicitly named and flow in one direction.
