# Page Bottom Headroom Audit Plan

## Goal

Close the gap where Hancom can show more pages than the SVG/JSON visual dogfood report predicts because generated content ends too close to a page bottom.

## Problem

`current-7-8.hwpx` opened in Hancom as `1/3쪽`, while the visual dogfood summary reported `pageCount: 2`. XML inspection showed only one explicit `pageBreak="1"`, so the mismatch is not an uncounted page-break marker. The first page's last generated content ends at `73345hu` with page content height `74266hu`, leaving only `921hu` of headroom. A small Hancom font/table reflow difference can push content onto an extra page before the later forced page break.

## Implementation

- Add a visual dogfood regression for a page whose last line box has less than `2000hu` of remaining bottom headroom.
- Include table geometry in page-bottom and page-overflow checks, because one-cell structure motifs can be the lowest page element even when no paragraph line overflows.
- Add `page-bottom-tight-risk` as a warning-level visual dogfood issue.
- Add `pageBottomTightRiskCount` to the visual dogfood summary.
- Add renderer pagination guardrails so generated paragraphs and generated structure tables start on the next page when they would leave less than `2000hu` of bottom headroom.
- Regenerate the three current BRIEF outputs and verify the tight-bottom and table-overflow warnings are eliminated.

## Verification

- `npm test -- src/test/hwpx-visual-dogfood.test.ts` must fail before the visual-audit implementation and pass after.
- `npm test -- src/test/hwpx-render.test.ts` must fail before the renderer pagination guardrail and pass after.
- Full `npm test`, `npm run build`, and `git diff --check` must pass.
- Regenerated reports should show:
  - `current-7-8.json`: no output-audit issues, no visual-dogfood issues, `pageOverflowRiskCount: 0`, `pageBottomTightRiskCount: 0`.
  - `current-9-10.json`: no output-audit issues, no visual-dogfood issues, `pageOverflowRiskCount: 0`, `pageBottomTightRiskCount: 0`.
  - `current-6-7.json`: no output-audit issues, no visual-dogfood issues, `pageOverflowRiskCount: 0`, `pageBottomTightRiskCount: 0`.
