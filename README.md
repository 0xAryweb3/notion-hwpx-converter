# Notion HWPX Converter

Chrome extension MVP for converting a Notion export or pasted text into a Korean HWPX document using an uploaded sample HWPX file as the formatting template.

## What Works

- Upload a sample `.hwpx` document.
- Extract reusable paragraph and character style references from the sample.
- Upload a Notion export `.zip`, `.md`, or `.html`, or paste text directly.
- Detect document block roles such as title, notice number, `1.`, `가.`, `-`, and `※`.
- Review and correct each block role in the side panel editor.
- Generate and download a new `.hwpx` file.

## Formatting Approach

The reliable part is not AI guessing visual styles. HWPX is a ZIP package with XML files. The extension reads the sample document's `Contents/section0.xml`, finds paragraphs like `1. 입찰내용` or `가. 용역기간`, and reuses their `paraPrIDRef`, `charPrIDRef`, and `styleIDRef` for matching new content.

This can preserve important official-document formatting patterns such as:

- heading and body fonts;
- character spacing;
- paragraph spacing;
- indentation;
- line spacing;
- `1.`, `가.`, `-`, and `※` paragraph styles.

AI is best used later for semantic matching: deciding which new paragraph should use which sample paragraph style. Exact low-level formatting should remain deterministic XML extraction.

## Current Limitations

- MVP targets `.hwpx`, not binary `.hwp`.
- Complex tables, merged cells, footnotes, page breaks, highlights, and inline mixed formatting need additional template rules.
- If the sample document does not contain an example of a paragraph type, the app falls back to observed default bid-notice styles.
- Browser preview is structural, not an exact HWP page rendering.
- Notion API OAuth import is not implemented yet. Local export/import is the first supported path.

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
