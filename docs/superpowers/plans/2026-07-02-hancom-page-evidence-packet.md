# Hancom Page Evidence Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each batch QA run produce a `hancom-review.md` packet that guides reviewers through page-by-page Hancom evidence capture, especially later pages.

**Architecture:** Keep the change in the QA reporting layer. Extend `renderHancomReviewMarkdown()` so it renders the existing sample summary table plus a deterministic page evidence checklist derived from proxy page counts and artifact paths. No Hancom automation, OCR, screenshot capture, or renderer changes are introduced.

**Tech Stack:** TypeScript, Vitest, existing HWPX QA summary model.

## Global Constraints

- The product remains HWPX-only.
- Do not depend on Hancom UI automation, screenshots, OCR, or AppleScript.
- Deterministic JSON/SVG QA remains separate from the manual Hancom gate.
- The manual packet must make later-page review explicit, not optional.

---

### Task 1: Page-Level Manual Evidence Packet

**Files:**
- Modify: `src/features/hwpx/qaRun.ts`
- Modify: `src/test/hwpx-qa-run.test.ts`

**Interfaces:**
- Consumes: `renderHancomReviewMarkdown(summary: QaRunSummary): string`
- Produces: a `hancom-review.md` section named `## Page Evidence Checklist`

- [ ] **Step 1: Write the failing test**

Add assertions to the existing Hancom packet test proving the packet includes a page-level checklist, later-page rows, and screenshot path hints:

```ts
expect(markdown).toContain("## Page Evidence Checklist");
expect(markdown).toContain("| 7-8 | 1 | page 1 |");
expect(markdown).toContain("| 7-8 | 2 | later page |");
expect(markdown).toContain("/tmp/hwp-qa/screenshots/7-8-page-2.png");
expect(markdown).toContain("Record one row per Hancom-rendered page");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: FAIL because the page evidence checklist does not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `src/features/hwpx/qaRun.ts`, add helpers that render page rows from `summary.samples`:

```ts
function renderHancomPageEvidenceRows(summary: QaRunSummary): string {
  return summary.samples
    .flatMap((sample) => {
      const expectedPages = Math.max(1, sample.visualDogfood.pageCount);
      return Array.from({ length: expectedPages }, (_, index) => {
        const pageNumber = index + 1;
        const pageKind = pageNumber === 1 ? "page 1" : "later page";
        return `| ${sample.label} | ${pageNumber} | ${pageKind} |  |  | ${summary.artifactsDir}/screenshots/${sample.label}-page-${pageNumber}.png | ${sample.outputPath} | ${sample.svgPath} |`;
      });
    })
    .join("\n");
}
```

Then append this section to `renderHancomReviewMarkdown()`:

```ts
"## Page Evidence Checklist",
"",
"Record one row per Hancom-rendered page. If Hancom shows more pages than the proxy count, add rows manually and mark the page kind as `extra Hancom page`.",
"",
"| Sample | Page | Page kind | Hancom status | Notes | Suggested screenshot path | HWPX | SVG |",
"| --- | ---: | --- | --- | --- | --- | --- | --- |",
renderHancomPageEvidenceRows(summary),
"",
```

- [ ] **Step 4: Run targeted test**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: PASS.

### Task 2: Verification And Ship

**Files:**
- Verify: `src/features/hwpx/qaRun.ts`
- Verify: `src/test/hwpx-qa-run.test.ts`
- Update: `HANDOFF.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test -- src/test/hwpx-qa-run.test.ts
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Update handoff**

Record the page-level Hancom evidence packet, branch, verification commands, and any PR/auth caveat.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-02-hancom-page-evidence-packet.md src/features/hwpx/qaRun.ts src/test/hwpx-qa-run.test.ts HANDOFF.md
git commit -m "[feat] add hancom page evidence packet"
```

- [ ] **Step 4: Push and create PR**

Run:

```bash
git push -u origin "$(git branch --show-current)"
```

Create a PR against `main` if the GitHub auth identity is acceptable. If `gh` is authenticated as the wrong account, push the branch and provide the compare URL instead of creating a wrong-author PR.

## Self-Review

- Spec coverage: The plan covers page-level manual evidence, later-page review, tests, verification, handoff, commit, push, and PR handling.
- Placeholder scan: No open `TODO`, `TBD`, or vague implementation steps remain.
- Type consistency: The plan uses the existing `QaRunSummary` and `renderHancomReviewMarkdown()` interfaces.
