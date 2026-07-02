# Notion HWPX Converter

Chrome extension MVP for converting a Notion export or pasted text into a Korean HWPX document using an uploaded sample HWPX file as the formatting template.

## What Works

- Upload a sample `.hwpx` document.
- Extract a deterministic format profile from the sample: page margins, paragraph styles, character styles, tables, cells, and text slots.
- Load a public Notion page URL through the local helper.
- Upload a Notion export `.zip`, `.md`, or `.html`, or paste text directly.
- Detect document block roles such as title, notice number, `1.`, `가.`, `-`, and `※`.
- Review and correct each block role in the side panel editor.
- Generate and download a new `.hwpx` file.

## Formatting Approach

The reliable part is not AI guessing visual styles. HWPX is a ZIP package with XML files. The extension now builds a deterministic `HwpxFormatProfile` from the sample document before generation. That profile reads:

- page size and top/bottom/left/right/header/footer/gutter margins;
- paragraph style IDs, alignment, indentation/margins, and line spacing;
- character style IDs, font face, font size, character spacing, width ratio, color, and bold;
- table sizes, row/column counts, cell sizes, cell margins, and border/fill references;
- every non-empty text slot, including whether the slot lives inside a table.

Rule-only and Codex-assisted outputs share this same analyzer. Codex may help decide which source block maps to which slot, but it must not guess fonts, margins, spacing, or table measurements.

The extension also reads paragraph samples from `Contents/section0.xml` and builds a `HwpxFormatGrammar`. That grammar turns measured sample paragraphs into reusable roles such as title, issue, body heading, category heading, news title, bullet, and news bullet. Source blocks are then grouped into a `sourceStructure` and mapped through `styleAssignment`, so generation follows an explicit chain:

`sample XML -> format profile -> format grammar -> source structure -> style assignment -> generated HWPX`

This can preserve important official-document formatting patterns such as:

- heading and body fonts;
- character spacing;
- paragraph spacing;
- paragraph before/after spacing;
- indentation;
- hanging indentation for wrapped round-bullet paragraphs;
- line spacing;
- `1.`, `가.`, `-`, and `※` paragraph styles.

AI is only appropriate for semantic matching: deciding which new paragraph should use which sample slot. Exact low-level formatting remains deterministic XML extraction.

## Current Limitations

- MVP targets `.hwpx`, not binary `.hwp`.
- Complex tables, merged cells, footnotes, page breaks, highlights, and inline mixed formatting need additional template rules.
- If the sample document does not contain an example of a paragraph type, the app falls back to observed default bid-notice styles.
- Browser preview is structural, not an exact HWP page rendering.
- Public Notion URL import requires the local helper because Notion page content is loaded through internal APIs that are not browser-CORS friendly.
- Private Notion pages and Notion API OAuth import are not implemented yet.

## Setup

```bash
npm install
npm test
npm run build
```

## Local Web Comparison Mode

For accuracy testing, use the app as a local web UI first. The Chrome extension shell is optional at this stage.

Terminal 1:

```bash
npm run helper:codex
```

Terminal 2:

```bash
npm run dev
```

Then open the Vite local URL, upload the same HWPX sample and input content, and download both outputs:

- `rules-output.hwpx`
- `codex-output.hwpx`

Open both in Hancom and judge which one needs less manual correction.

Public Notion link import also uses Terminal 1. Paste the public Notion URL into `공개 Notion 링크`, click `불러오기`, then review the detected blocks before downloading HWPX.

The default output path is content-driven. It preserves the sample's leading title area, including title tables when the sample uses them, then rebuilds the body from the input blocks using measured sample styles. If the input has no table rows, sample body tables are removed. If the input has table rows, the closest sample body table is cloned and filled. This keeps stale sample layout from surviving just because it existed in the template.

Sample raster graphics are removed by default because text baked into images cannot be rewritten through HWPX text slots. Images from the Notion input are treated as source content and embedded as new `BinData/source-image-*` assets when their bytes are available.

When the sample uses tables, the `표 글자 스타일` panel can override table title/body font family, font size, character spacing, and bold styling. Font family choices are limited to fonts already declared in the uploaded sample HWPX.

For repeatable local checks without clicking through the UI, run:

```bash
node_modules/.bin/vite-node helper/generate-local.ts \
  --sample "/path/to/sample.hwpx" \
  --source-url "https://public.notion.site/page-id" \
  --output "/Users/hyeon/Desktop/hwp-result/rules-output.hwpx" \
  --report "/Users/hyeon/Desktop/hwp-result/rules-output.json"
```

The JSON report includes a post-generation `outputAudit` with a score, pass/fail status, source coverage checks, output table/image counts, red style usage, line-layout cache counts, wrapped-bullet indentation checks, long-paragraph overflow warnings, and a `hancomReflowRiskCount` for deterministic Hancom-visible layout risks.

## Batch QA

For repeatable multi-sample checks, run the QA runner. It generates one HWPX, one JSON report, and one SVG visual preview per sample, plus `qa-summary.json`, `qa-summary.md`, and `hancom-review.md`.

```bash
node_modules/.bin/vite-node helper/qa-run.ts \
  --source-url "https://public.notion.site/page-id" \
  --output-dir "/Users/hyeon/Desktop/hwp-result/qa-current" \
  --sample "7-8::/path/to/sample-7-8.hwpx" \
  --sample "9-10::/path/to/sample-9-10.hwpx" \
  --sample "6-7::/path/to/sample-6-7.hwpx"
```

Add `--open-hancom` to open each generated HWPX in Hancom Viewer after writing it. The QA summary does not depend on Hancom automation; it uses deterministic output audit and visual-dogfood checks.

Use `hancom-review.md` as the manual Hancom checklist. Open each generated HWPX, record Hancom's actual page count, inspect page 1 and later pages, and attach screenshot paths or notes for any mismatch. This is separate from the deterministic JSON/SVG gate because Hancom can reflow pages differently.

The manual packet also includes a page evidence checklist. It creates one row per expected proxy page, labels page 1 separately from later pages, and suggests screenshot paths under the QA output directory so Hancom review evidence can be filled consistently.

## Load in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this repo's `dist/` directory.
6. Click the extension icon to open the side panel.

## Development Notes

Core conversion code lives in:

- `src/features/document/`
- `src/features/notion-export/`
- `src/features/hwpx/`

The side panel UI lives in `src/panel/`.
