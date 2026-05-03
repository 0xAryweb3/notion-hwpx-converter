# Structure Motif Engine Design

## Goal
Improve generated HWPX quality by analyzing and reusing sample document structures, not only paragraph styles.

## Problem
The current renderer mostly maps source blocks to paragraph roles such as `bodyHeading`, `bullet`, and `newsTitle`. That is too shallow for BRIEF-style HWPX samples. In the real samples, several meaningful headings are not plain paragraphs:

- the lead article title is often a one-cell table,
- `탄소중립 정보공유` is a one-cell or two-row table,
- news item titles are one-cell tables,
- center/news section labels may also be one-cell tables,
- data tables and decorative/source-image tables are different from these heading tables.

The renderer currently drops one-cell body tables because `extractTableTemplates()` filters for `colCount > 1`. That prevents the output from preserving important intermediate title blocks, underlined/table-framed headings, and section rhythm.

## Design
Add a deterministic "structure motif" layer between raw format profiling and rendering.

The motif layer should treat a sample table as a reusable structure only when it has a semantic role:

- `leadHeading`: the first one-cell body heading table after the title region.
- `pageHeading`: a one-cell table whose text matches a page-level heading such as `탄소중립 정보공유`.
- `categoryHeading`: a one-cell table whose text matches section labels such as `센터 소식` or `센터운영소식`.
- `newsTitle`: a one-cell body table used repeatedly for news item titles.
- `dataTable`: multi-column body tables, used only when the source contains table rows.

Source content should also be grouped more explicitly. The first short body paragraph after the title/issue block is a `leadHeading`, not ordinary body text. News sections remain paragraph/bullet groups, but news titles can render through a heading-table motif if the sample has one.

Rendering stays deterministic and LLM-free:

1. HWPX XML is parsed into page/style/table/text metrics.
2. Grammar infers reusable paragraph roles and table motifs.
3. Source blocks are classified into structured nodes.
4. Style assignment marks which nodes should render through a structure table.
5. Renderer clones only the matching one-cell table motif for that source node.
6. Data tables are still generated only from source `tableRow` groups.

## Non-Goals
- Do not preserve arbitrary sample body tables when the source has no corresponding content.
- Do not ask an LLM to write HWPX XML.
- Do not use sample raster images unless the source supplies images.
- Do not attempt full visual clone fidelity for all possible HWPX layouts in this pass.

## Quality Gates
- No source table rows means no data table, but heading-table motifs are allowed when assigned to source headings.
- Heading-table output must replace stale sample text and not leak old table content.
- All source text assigned to headings/bullets/body must appear in generated HWPX.
- Existing visual checks for non-black generated text, bad bullet indent, justify spacing, page overflow, and missing blank paragraph remain active.

