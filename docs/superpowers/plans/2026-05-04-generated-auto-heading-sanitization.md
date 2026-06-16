# Generated Auto Heading Sanitization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent generated non-bullet headings such as `울산 소식` from inheriting Hancom automatic bullet/heading paragraph properties, and make the local audit catch the regression.

**Architecture:** Keep low-level formatting deterministic. The renderer may still reuse sample paragraph styles, but before writing generated content it must clone any paragraph style carrying automatic `<hh:heading type="...">` metadata into an output-only plain style. The output audit then inspects generated assignment text against `header.xml` and fails if any non-bullet generated paragraph uses a non-`NONE` heading type.

**Tech Stack:** TypeScript, Vitest, HWPX XML (`Contents/header.xml`, `Contents/section0.xml`), existing local generator and Hancom screenshot review.

---

### Task 1: Add Regression Coverage

**Files:**
- Modify: `src/test/hwpx-output-audit.test.ts`
- Modify: `src/test/hwpx-render.test.ts`

- [ ] **Step 1: Add an audit regression for non-bullet auto heading styles**

Add a test that creates a generated category heading paragraph with `paraPrIDRef="64"` and a header paragraph style containing `<hh:heading type="BULLET" .../>`.

Expected behavior: `auditGeneratedHwpx()` fails with `code: "non-bullet-auto-heading"`.

- [ ] **Step 2: Add a render regression for cloned plain generated styles**

Add a test using `createBulletTitleRegionTemplateZip()` with the sample heading paragraph style modified to include `<hh:heading type="BULLET" .../>`.

Expected behavior: `generateHwpx()` clones a new paragraph style for generated heading text and the generated style has `<hh:heading type="NONE" idRef="0" level="0"/>`.

- [ ] **Step 3: Run the targeted tests to verify RED**

Run:

```bash
npm test -- src/test/hwpx-output-audit.test.ts src/test/hwpx-render.test.ts
```

Expected: the two new tests fail before implementation.

### Task 2: Sanitize Generated Paragraph Styles

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Modify: `src/features/hwpx/outputAudit.ts`

- [ ] **Step 1: Clone auto-heading paragraph styles for generated content**

In `prepareGeneratedParagraphStyles()`, after bullet-indent and left-align normalization, call a new helper that clones the current paragraph style when `readParaPrHeadingType()` is neither `null` nor `NONE`.

The cloned style must preserve existing margins/alignment but replace any heading tag with:

```xml
<hh:heading type="NONE" idRef="0" level="0"/>
```

- [ ] **Step 2: Make existing generated style clones plain**

Update `applyGeneratedBulletParaPr()` and `applyGeneratedLeftAlignParaPr()` so they also remove automatic heading metadata. This avoids double bullets if a sample uses true Hancom bullet numbering.

- [ ] **Step 3: Extend the output audit**

Read paragraph heading types from `header.xml`, count generated non-bullet paragraph text using non-`NONE` heading styles, add `badNonBulletAutoHeadingCount` to the summary, and emit an error with `code: "non-bullet-auto-heading"`.

- [ ] **Step 4: Run targeted tests to verify GREEN**

Run:

```bash
npm test -- src/test/hwpx-output-audit.test.ts src/test/hwpx-render.test.ts
```

Expected: targeted tests pass.

### Task 3: Regenerate and Manually Inspect Current BRIEF Outputs

**Files / artifacts:**
- Write external artifacts only under `/Users/hyeon/Desktop/hwp-result/`

- [ ] **Step 1: Regenerate all three current sample outputs from the public Notion URL**

Run `helper/generate-local.ts` for the 7-8, 9-10, and 6-7 samples, writing `current-*.hwpx` and `current-*.json` under `/Users/hyeon/Desktop/hwp-result/`.

- [ ] **Step 2: Inspect XML for the reported issue**

Verify generated `울산 소식`, `전국 소식`, and `센터 소식` either render as intended structure tables or use paragraph styles with heading type `NONE`; verify generated visible text color remains black.

- [ ] **Step 3: Capture Hancom output**

Open `/Users/hyeon/Desktop/hwp-result/current-7-8.hwpx` in Hancom and capture a screenshot. Confirm the previous automatic bullet before `울산 소식` is gone, and check whether the news title `울산시, 기후위기 대응 중장기 전략 수립 착수` is present in a one-cell structure table.

### Task 4: Verification and Handoff

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

- [ ] **Step 2: Update `HANDOFF.md`**

Record the root cause, changed files, regenerated output paths, verification output, and remaining Hancom visual risks.

- [ ] **Step 3: Commit**

Commit with:

```bash
git add docs/superpowers/plans/2026-05-04-generated-auto-heading-sanitization.md src/features/hwpx/render.ts src/features/hwpx/outputAudit.ts src/test/hwpx-render.test.ts src/test/hwpx-output-audit.test.ts HANDOFF.md
git commit -m "[fix] sanitize generated heading paragraph styles"
```
