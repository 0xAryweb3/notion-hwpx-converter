# Hancom Manual Review Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable `hancom-review.md` packet to each HWPX batch QA run.

**Architecture:** Keep the change in the QA reporting layer. Add one pure Markdown renderer to `src/features/hwpx/qaRun.ts`, write the generated packet from `helper/qa-run.ts`, and document the new artifact in `README.md` and `HANDOFF.md`.

**Tech Stack:** TypeScript, Vitest, Vite Node helper scripts, existing HWPX QA summary model.

---

### File Structure

- Modify: `src/features/hwpx/qaRun.ts`
  - Add `renderHancomReviewMarkdown(summary)` and link the manual review packet from `renderQaRunMarkdown()`.
- Modify: `src/test/hwpx-qa-run.test.ts`
  - Add regression coverage for the Hancom review packet and summary link.
- Modify: `helper/qa-run.ts`
  - Write `hancom-review.md` and include `hancomReviewPath` in stdout.
- Modify: `README.md`
  - Document the new manual review packet in the Batch QA section.
- Modify: `HANDOFF.md`
  - Record the new workflow and verification results.

### Task 1: Pure Hancom Review Markdown

**Files:**
- Modify: `src/features/hwpx/qaRun.ts`
- Modify: `src/test/hwpx-qa-run.test.ts`

- [ ] **Step 1: Write failing tests**

Add `renderHancomReviewMarkdown` to the import list in `src/test/hwpx-qa-run.test.ts`, then add this test:

```ts
it("renders a Hancom manual review packet with editable evidence fields", () => {
  const summary = buildQaRunSummary({
    generatedAt: "2026-06-10T00:00:00.000Z",
    source: { url: "https://example.notion.site/page", blockCount: 3 },
    artifactsDir: "/tmp/hwp-qa",
    samples: [
      {
        label: "7-8",
        samplePath: "/tmp/sample-7-8.hwpx",
        outputPath: "/tmp/hwp-qa/7-8.hwpx",
        reportPath: "/tmp/hwp-qa/7-8.json",
        svgPath: "/tmp/hwp-qa/7-8.svg",
        outputAudit: { passed: true, errors: 0, warnings: 0 },
        visualDogfood: {
          errors: 0,
          warnings: 0,
          pageCount: 2,
          pageOverflowRiskCount: 0,
          pageBottomTightRiskCount: 0
        },
        counts: {
          outputTables: 8,
          outputBodyTables: 6,
          missingSourceTextCount: 0,
          badBulletIndentCount: 0,
          badNonBulletIndentCount: 0,
          badBulletStyleIndentCount: 0,
          badNonBulletAutoHeadingCount: 0
        }
      }
    ]
  });

  const markdown = renderHancomReviewMarkdown(summary);

  expect(markdown).toContain("# Hancom Manual Review");
  expect(markdown).toContain("/tmp/hwp-qa/7-8.hwpx");
  expect(markdown).toContain("/tmp/hwp-qa/7-8.json");
  expect(markdown).toContain("/tmp/hwp-qa/7-8.svg");
  expect(markdown).toContain("Expected proxy pages");
  expect(markdown).toContain("Hancom page count");
  expect(markdown).toContain("Later pages status");
  expect(markdown).toContain("Screenshot path");
  expect(markdown).toContain("Inspect every page after page 1");
});
```

Also update the existing Markdown summary test:

```ts
expect(markdown).toContain("hancom-review.md");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: FAIL because `renderHancomReviewMarkdown` does not exist and the summary does not link to `hancom-review.md`.

- [ ] **Step 3: Implement the pure Markdown renderer**

In `src/features/hwpx/qaRun.ts`, export:

```ts
export function renderHancomReviewMarkdown(summary: QaRunSummary): string {
  const rows = summary.samples.map((sample) =>
    `| ${sample.label} | ${sample.visualDogfood.pageCount} |  |  |  |  |  | ${sample.outputPath} | ${sample.reportPath} | ${sample.svgPath} |`
  ).join("\n");

  return [
    "# Hancom Manual Review",
    "",
    `- Generated at: ${summary.generatedAt}`,
    `- Source: ${summary.source.url ?? "source text"}`,
    `- Deterministic QA result: ${summary.passed ? "PASS" : "FAIL"}`,
    `- Artifacts: ${summary.artifactsDir}`,
    "",
    "## Procedure",
    "",
    "1. Open each generated HWPX in Hancom Viewer.",
    "2. Record Hancom's actual page count, even when it differs from the expected proxy pages.",
    "3. Verify page 1 for title tables, readable text, bullet indentation, and missing content.",
    "4. Inspect every page after page 1 for overflow, unexpected blank pages, bad wrapping, non-black generated text, and missing section titles.",
    "5. Compare suspicious pages against the SVG preview and JSON report.",
    "6. Add screenshot paths for any issue or for the final accepted evidence.",
    "",
    "## Review Matrix",
    "",
    "| Sample | Expected proxy pages | Hancom page count | Page 1 status | Later pages status | Screenshot path | Reviewer notes | HWPX | JSON | SVG |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    "## Manual Gate",
    "",
    "- PASS only when every sample has page 1 and later pages marked acceptable.",
    "- Record any Hancom page-count mismatch in Reviewer notes.",
    "- Leave the deterministic QA result unchanged; this manual gate is separate evidence."
  ].join("\n");
}
```

Update `renderQaRunMarkdown(summary)` to include:

```ts
`- Hancom manual review packet: ${summary.artifactsDir}/hancom-review.md`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: PASS.

### Task 2: CLI Artifact Writing

**Files:**
- Modify: `helper/qa-run.ts`
- Test: `src/test/hwpx-qa-run.test.ts`

- [ ] **Step 1: Add CLI writer**

Modify the import in `helper/qa-run.ts`:

```ts
import {
  buildQaRunSummary,
  parseQaRunArgs,
  renderHancomReviewMarkdown,
  renderQaRunMarkdown
} from "../src/features/hwpx/qaRun";
```

After writing `qa-summary.md`, add:

```ts
const hancomReviewPath = join(options.outputDir, "hancom-review.md");
await writeFile(hancomReviewPath, `${renderHancomReviewMarkdown(summary)}\n`);
```

Include `hancomReviewPath` in the final console JSON.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: PASS.

### Task 3: Docs And Handoff

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update README Batch QA section**

Add after the existing artifact explanation:

```md
The runner also writes `hancom-review.md`. Use it as the manual Hancom checklist: open each generated HWPX, record Hancom's actual page count, inspect page 1 and later pages, and attach screenshot paths or notes for any mismatch. This is separate from the deterministic JSON/SVG gate because Hancom can reflow pages differently.
```

- [ ] **Step 2: Update HANDOFF**

Record:

- current branch and latest commit before this work;
- remote restored to `origin`;
- added Hancom manual review packet;
- verification commands and results;
- next action after push.

### Task 4: Verification And Push

**Files:**
- All changed files from Tasks 1-3.

- [ ] **Step 1: Run verification**

Run:

```bash
npm test -- src/test/hwpx-qa-run.test.ts
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Commit**

Run:

```bash
git status --short
git add src/features/hwpx/qaRun.ts src/test/hwpx-qa-run.test.ts helper/qa-run.ts README.md HANDOFF.md docs/superpowers/specs/2026-06-10-hancom-manual-review-packet-design.md docs/superpowers/plans/2026-06-10-hancom-manual-review-packet.md
git commit -m "[feat] add hancom manual review packet"
```

- [ ] **Step 3: Push**

Run:

```bash
git push -u origin feat/codex-goals-workflow
```

Expected: branch pushes to `https://github.com/0xAryweb3/notion-hwpx-converter`.

---

## Self-Review

- Spec coverage: The plan implements the manual review packet, summary link, CLI writing, docs, handoff update, verification, commit, and push.
- Placeholder scan: No `TBD`, `TODO`, or vague "add tests" instructions remain.
- Type consistency: The new function consumes the existing `QaRunSummary` type and does not change the sample summary contract.
