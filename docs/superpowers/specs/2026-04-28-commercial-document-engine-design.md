# Commercial Document Engine Design

## Goal

Build the converter as a document automation engine, not a Notion-to-HWPX exporter. A user should be able to upload one or more sample HWPX files, provide new source content, and receive a generated HWPX plus a report that explains whether the output is structurally safe enough to review in Hancom.

## Product Standard

The product cannot rely on "looks okay in one sample." It needs deterministic rules and observable failure modes.

- Source content controls body structure.
- Sample HWPX controls formatting measurements.
- LLM/Codex can assist semantic classification, but must not invent font, spacing, indent, table, or page metrics.
- Every generated document must produce a machine-readable quality report.
- The report must distinguish errors that invalidate the output from warnings that only need human review.

## Architecture

The engine should be a pipeline with explicit boundaries:

1. `HwpxFormatProfile`
   - Extract raw HWPX measurements: page margins, paragraph styles, character styles, table/cell metrics, paragraph samples, and line metrics.
2. `HwpxFormatGrammar`
   - Convert sample measurements into reusable document roles: title, issue, body heading, category heading, news title, bullet, news bullet, body paragraph, and table templates.
3. `HwpxSourceStructure`
   - Convert Notion/Markdown/HTML/pasted text into ordered source nodes: headings, bullet groups, table groups, image blocks, and prose sections.
4. `HwpxStyleAssignment`
   - Map source nodes to grammar roles and concrete HWPX styles with reason/confidence.
5. `HWPX Renderer`
   - Generate the document using assigned styles and content-driven body structure.
6. `GeneratedOutputAudit`
   - Inspect the actual generated HWPX package and score structural correctness.

## Immediate Scope

The current code already has steps 1-5 in basic form. The next commercial-grade slice is step 6: a generated-output audit that checks the actual `.hwpx` content after rendering.

The audit must verify:

- body table policy:
  - source table groups `0` means output body tables must be `0`
  - source table groups `>0` means output body tables should be present or explicitly warned
- image policy:
  - sample images/containers must not survive by default
  - source image refs must match embeddable source images
- style safety:
  - red guide character styles must not be used in generated body text
  - generated headings below 8pt are an error
  - generated headings below 10pt are a warning
- bullet layout:
  - wrapped bullet continuation lines must have positive horizontal indent
  - bullet paragraphs without a measured hanging indent are a warning
- source coverage:
  - every non-image source assignment must appear in the output text
- layout risk:
  - very long generated paragraphs should be flagged when estimated line count exceeds a configurable threshold

## Output

The audit returns:

```ts
interface GeneratedOutputAudit {
  score: number;
  passed: boolean;
  summary: {
    sourceBlocks: number;
    sourceTableGroups: number;
    outputBodyTables: number;
    outputParagraphs: number;
    outputLineSegArrays: number;
    redRunCount: number;
    badBulletIndentCount: number;
    missingSourceTextCount: number;
    overflowRiskCount: number;
  };
  issues: GeneratedOutputAuditIssue[];
}
```

Scores start at 100. Errors reduce the score more than warnings. `passed` is false if any error exists.

## UI/CLI Behavior

- The side panel continues showing pre-generation mapping.
- The local generation helper writes the generated-output audit into the JSON report.
- The helper console output shows `score`, `passed`, and error/warning counts so repeated sample loops can be judged without manually opening every file.

## Non-Goals For This Slice

- No PDF rendering or screenshot comparison yet.
- No true Hancom layout engine emulation.
- No multi-template learning or statistical style voting yet.
- No LLM classification changes in this slice.

## Acceptance Criteria

- A bad output with leftover body tables when the source has no table rows fails the audit.
- A bad output with wrapped bullet lines at `horzpos=0` fails the audit.
- A generated output with red guide style references fails the audit.
- The current three BRIEF sample outputs produce audit reports with no errors.
- `npm test`, `npm run build`, and `git diff --check` pass.
