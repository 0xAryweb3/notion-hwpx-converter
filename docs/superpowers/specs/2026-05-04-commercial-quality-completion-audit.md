# Commercial Quality Completion Audit

## Objective

Audit whether the current converter satisfies the thread goal: a sample-HWPX-based Notion/public-content converter that can approach commercial-quality drafting by deterministically extracting and reusing document formatting.

## User Requirements

- Use the public Notion page as the source content.
- Use the supplied BRIEF HWPX samples as formatting references.
- Preserve sample-derived title tables when the sample title is a table.
- Do not keep arbitrary sample body/data tables when the Notion source has no table rows.
- Reuse one-cell structure tables for section/news-title motifs when the sample uses those motifs.
- Keep text black unless the source/sample role intentionally says otherwise.
- Preserve paragraph/bullet indentation, line spacing, character spacing, and blank rhythm closely enough to avoid Hancom overlap and obvious layout damage.
- Make generated output inspectable so the user can see what style was chosen and why.
- Support deterministic operation without an LLM as the preferred baseline; LLM/Codex should only assist semantic ambiguity later.

## Evidence Checked

- Current branch: `feat/codex-goals-workflow`.
- Latest committed renderer/report fix: `[fix] avoid tight generated pages`.
- Current uncommitted layout plan: `docs/superpowers/plans/2026-05-04-page-bottom-headroom-audit.md`.
- Regenerated outputs:
  - `/Users/hyeon/Desktop/hwp-result/current-7-8.hwpx`
  - `/Users/hyeon/Desktop/hwp-result/current-9-10.hwpx`
  - `/Users/hyeon/Desktop/hwp-result/current-6-7.hwpx`
- All three regenerated JSON reports passed with score `100`, no output-audit errors/warnings, no visual-dogfood errors/warnings, no red generated runs, no non-black generated runs, no bad bullet indentation, no bad non-bullet indentation, no automatic-heading leakage, no missing source text, `pageOverflowRiskCount: 0`, and `pageBottomTightRiskCount: 0`.
- The 7-8 JSON report now shows:
  - `울산 소식`: paragraph, 12pt, `#000000`, no indent label.
  - `울산시, 기후위기 대응 중장기 전략 수립 착수`: `structureTable`, 13pt, `#000000`.
  - `센터 소식`: `structureTable`, 12pt, `#000000`.
  - `울산‘탄소영감(Net-Zero) 실험실’프로젝트 참여자 모집`: `structureTable`, 13pt, `#000000`.
  - bullet rows: `글머리 들여쓰기 1,448hu` or `1,718hu`, not a misleading negative hanging-indent label.
- Direct Hancom screenshot capture now works after the user granted screen-recording permission. A unique fresh-open copy, `/Users/hyeon/Desktop/hwp-result/current-7-8-verified.hwpx`, showed the first page in Hancom with black text, visible title tables, and indented round bullets.
- The visual dogfood audit now includes structure-table geometry for page overflow/headroom checks. The renderer also moves generated paragraphs and structure tables to the next page when they would leave less than `2000hu` of bottom headroom, eliminating the prior 7-8 and 6-7 tight-bottom warnings.

## Remaining Gaps

- Final commercial-quality completion cannot be claimed yet. Hancom visual review is now partially possible, but app-control permissions for `System Events` are still denied, and a low-level PageDown attempt produced unusable black screenshots, so automated navigation to later pages and repeatable full-document screenshots are limited.
- The current validation is strongest for the three supplied BRIEF samples and the current public Notion page. Generalization to arbitrary HWPX samples still needs a larger corpus and screenshot-based visual comparison.
- The SVG visual dogfood is a useful proxy but not a complete Hancom renderer; Hancom may still report page counts differently because it performs its own layout and zoomed page display.
- Structure-table policy is deterministic but still heuristic. In the 7-8 sample, `울산 소식` itself is a plain heading while the news title below it is a one-cell structure table; other samples may encode those motifs differently.

## Decision

Do not mark the active goal complete yet. The converter is materially better and now has direct Hancom evidence for the first page, but the commercial-quality gate requires repeatable later-page visual review and broader sample coverage.
