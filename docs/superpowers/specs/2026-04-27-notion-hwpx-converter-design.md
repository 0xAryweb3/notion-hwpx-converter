# Notion to HWPX Converter Design

## Goal

Build a Chrome extension MVP that lets a user upload a Notion export and an HWPX template, review the detected document structure, edit paragraph roles/text, and download a new HWPX document that reuses the template's official-looking Korean formatting.

## Scope

The first version supports local files only:

- Input A: a Notion export ZIP, Markdown file, or HTML file.
- Input B: an HWPX template file, such as the provided bid notice sample.
- Output: a generated `.hwpx` file.

Notion API import is intentionally deferred. Private pages are already supported through manual Notion export because the user exports content they can access. API import needs OAuth and a small backend because a Chrome extension cannot safely hold an OAuth client secret.

## Product Flow

1. The user opens the extension side panel.
2. The user uploads an HWPX template.
3. The user uploads a Notion export ZIP, Markdown file, or HTML file.
4. The extension parses content into paragraph blocks.
5. The editor shows each block with a role:
   - title
   - notice number
   - intro/body
   - section heading (`1.`, `2.`, `3.`)
   - Korean alpha item (`가.`, `나.`, `다.`)
   - dash item (`-`)
   - note (`※`)
6. The user can edit text and role assignments.
7. The user downloads a generated HWPX file.

## Architecture

The extension has a small UI layer and a pure TypeScript conversion core.

- `src/features/notion-export/*` parses Notion files into normalized blocks.
- `src/features/hwpx/*` loads the HWPX ZIP, extracts reusable template section metadata, and renders a new `Contents/section0.xml`.
- `src/features/document/*` owns the shared block model and role detection.
- `src/panel/*` renders the side panel editor and calls the conversion core.
- `src/background.ts` opens the side panel from the toolbar icon.

The conversion core is browser-compatible and testable under Vitest. File IO stays at the UI boundary.

## HWPX Strategy

HWPX is a ZIP package with XML files. The template's `Contents/header.xml` contains reusable paragraph and character style definitions, while `Contents/section0.xml` contains body paragraphs that reference those definitions with `paraPrIDRef` and `charPrIDRef`.

The MVP keeps the original package files and replaces `Contents/section0.xml` with a generated section that:

- copies the original first-section page setup controls;
- references known style IDs from the template;
- escapes XML text safely;
- includes simple line segment metadata so the document remains structurally complete.

Template style IDs are inferred from the source document where possible. If inference is incomplete, the renderer falls back to the style IDs observed in the provided bid notice template.

## Notion Import Strategy

Markdown is the primary interchange format. ZIP imports prefer `.md` files, then `.html` files. HTML is converted into plain structural lines through DOM traversal.

Role detection is deliberately rule-based for MVP:

- `# Heading` or the first prominent line becomes `title`.
- `환경부공고 제...호`-like lines become `noticeNumber`.
- `^\d+\.\s+` becomes `section`.
- `^\s*[가-힣]\.\s+` becomes `koreanItem`.
- `^\s*-\s+` becomes `dashItem`.
- `^\s*※` becomes `note`.
- everything else becomes `body`.

## Testing

Core behavior must be covered before implementation:

- Markdown role detection.
- ZIP import preference and text extraction.
- HWPX template loading.
- HWPX rendering preserves package files and injects escaped text.

The UI is smoke-tested by building the extension bundle. Browser QA can follow after the core generator works.

## Non-Goals

- No Notion OAuth in MVP.
- No remote AI rewriting in MVP.
- No exact HWP page layout preview in the browser.
- No table reconstruction beyond text block extraction in MVP.

## References

- Notion export supports HTML and Markdown/CSV ZIP exports.
- Notion API supports markdown content endpoints, but API import is a later phase.
- Chrome MV3 supports side panels and programmatic downloads.
- HWPX is ZIP plus XML, making template-based generation feasible.
