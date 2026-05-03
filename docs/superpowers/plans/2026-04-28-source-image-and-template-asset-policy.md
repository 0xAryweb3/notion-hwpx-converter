# Source Image and Template Asset Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents unless the user explicitly asks for parallel agents.

**Goal:** Separate template assets from source assets so stale sample images are not copied into generated HWPX files, while images that actually exist in the Notion input can be imported and placed deliberately.

**Architecture:** Treat uploaded HWPX assets as template-only formatting hints unless the renderer explicitly keeps them. Treat Notion images as source content blocks with their own bytes/URL metadata. The HWPX writer owns package-level asset bookkeeping: section XML references, `BinData/*` files, and `Contents/content.hpf` manifest entries must agree.

**Tech Stack:** TypeScript, Vite/React, fflate ZIP read/write, Vitest/jsdom, Chrome side panel, local Node helper for public Notion import.

**Execution Status:** Implemented in the current session. Automated verification passed with `npm test` and `npm run build`; real sample outputs were generated under `/Users/hyeon/Desktop/hwp-result/`.

---

## File Structure

- `src/features/document/types.ts`: add the source asset model and `image` block role.
- `src/features/document/detect.ts`: keep text-only detection stable; image blocks are produced by parsers, not inferred from normal text lines.
- `src/features/notion-export/parse.ts`: parse Markdown/HTML/ZIP image references into image blocks and resolve ZIP-local asset bytes.
- `src/features/notion-link/client.ts`: accept a structured helper response with text and image blocks, keeping the current text response as backward-compatible fallback.
- `helper/notion-public.mjs`: return public Notion image blocks and, when possible, downloaded image bytes as base64.
- `src/features/hwpx/render.ts`: enforce template/source asset policy, remove dropped template graphics from section XML and package metadata, and render source images as new HWPX image objects.
- `src/features/hwpx/quality.ts`: report template image count, dropped template image count, source image count, and skipped image count.
- `src/panel/App.tsx`: show image blocks in the editor, make policy wording explicit, and show quality warnings.
- Tests:
  - `src/test/notion-export-parse.test.ts`
  - `src/test/notion-link-client.test.ts`
  - `src/test/hwpx-render.test.ts`
  - `src/test/hwpx-quality.test.ts`

---

### Task 1: Define Source Asset Blocks

**Files:**
- Modify: `src/features/document/types.ts`
- Modify: `src/features/document/detect.ts`
- Test: `src/test/document-detect.test.ts`

- [ ] **Step 1: Write the failing type-level behavior test**

Add this test to `src/test/document-detect.test.ts` to prove normal text parsing still does not invent image blocks:

```ts
it("does not infer image blocks from plain text image-looking lines", () => {
  expect(normalizeLinesToBlocks(["![alt](image.png)"])).toEqual([
    { id: "block-1", role: "body", text: "![alt](image.png)" }
  ]);
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm test -- src/test/document-detect.test.ts -t "does not infer image blocks"`

Expected: PASS. This confirms images must come from structured parsers, not generic line detection.

- [ ] **Step 3: Add asset types without changing text detection behavior**

Update `src/features/document/types.ts`:

```ts
export type DocumentBlockRole =
  | "title"
  | "noticeNumber"
  | "body"
  | "section"
  | "koreanItem"
  | "dashItem"
  | "tableRow"
  | "image"
  | "note";

export interface DocumentImageAsset {
  id: string;
  kind: "image";
  fileName: string;
  mimeType: string;
  bytes?: Uint8Array;
  url?: string;
  altText?: string;
}

export interface DocumentBlock {
  id: string;
  role: DocumentBlockRole;
  text: string;
  asset?: DocumentImageAsset;
}
```

No change is required in `src/features/document/detect.ts` except ensuring `detectBlockRole` never returns `"image"`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/document-detect.test.ts`

Expected: all document detection tests pass.

---

### Task 2: Parse Notion Export Images As Source Blocks

**Files:**
- Modify: `src/features/notion-export/parse.ts`
- Test: `src/test/notion-export-parse.test.ts`

- [ ] **Step 1: Write failing Markdown image tests**

Add tests that cover standalone Markdown image syntax and ZIP-local image resolution:

```ts
it("parses markdown image syntax as source image blocks", () => {
  const blocks = parseNotionSource({
    name: "page.md",
    data: strToU8("본문\n\n![설명](assets/card.png)\n\n다음 문단")
  });

  expect(blocks).toEqual([
    { id: "block-1", role: "title", text: "본문" },
    {
      id: "block-2",
      role: "image",
      text: "설명",
      asset: {
        id: "asset-1",
        kind: "image",
        fileName: "card.png",
        mimeType: "image/png",
        url: "assets/card.png",
        altText: "설명"
      }
    },
    { id: "block-3", role: "body", text: "다음 문단" }
  ]);
});

it("resolves markdown images from a Notion export zip", () => {
  const zip = zipSync({
    "page.md": strToU8("![차트](images/chart.jpg)"),
    "images/chart.jpg": new Uint8Array([255, 216, 255, 217])
  });

  const blocks = parseNotionSource({ name: "export.zip", data: zip });

  expect(blocks[0]?.role).toBe("image");
  expect(blocks[0]?.asset?.mimeType).toBe("image/jpeg");
  expect(blocks[0]?.asset?.bytes).toEqual(new Uint8Array([255, 216, 255, 217]));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/test/notion-export-parse.test.ts -t "image"`

Expected: FAIL because `parseNotionSource` currently returns only normalized text blocks.

- [ ] **Step 3: Implement structured Markdown/HTML collection**

Replace text-only parsing with a `ParsedSourceItem` collector:

```ts
type ParsedSourceItem =
  | { kind: "text"; text: string }
  | { kind: "image"; altText: string; src: string; bytes?: Uint8Array; mimeType: string };

function itemsToBlocks(items: ParsedSourceItem[]): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const pendingText: string[] = [];
  let assetIndex = 1;

  function flushText(): void {
    const textBlocks = normalizeLinesToBlocks(pendingText);
    for (const block of textBlocks) {
      blocks.push({ ...block, id: `block-${blocks.length + 1}` });
    }
    pendingText.length = 0;
  }

  for (const item of items) {
    if (item.kind === "text") {
      pendingText.push(item.text);
      continue;
    }

    flushText();
    blocks.push({
      id: `block-${blocks.length + 1}`,
      role: "image",
      text: item.altText,
      asset: {
        id: `asset-${assetIndex}`,
        kind: "image",
        fileName: fileNameFromSource(item.src),
        mimeType: item.mimeType,
        bytes: item.bytes,
        url: item.src,
        altText: item.altText
      }
    });
    assetIndex += 1;
  }

  flushText();
  return blocks;
}
```

Markdown collector rule:

```ts
const markdownImagePattern = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/u;
```

HTML collector rule: when visiting `<img>`, emit an image item using `alt` and `src`, without also emitting parent text content for that `<img>`.

ZIP rule: pass a normalized `Map<string, Uint8Array>` of ZIP entries into Markdown/HTML parsers and resolve `src` paths against it.

- [ ] **Step 4: Run focused parser tests**

Run: `npm test -- src/test/notion-export-parse.test.ts`

Expected: all Notion export parser tests pass.

---

### Task 3: Return Public Notion Images From The Helper

**Files:**
- Modify: `helper/notion-public.mjs`
- Modify: `src/features/notion-link/client.ts`
- Modify: `src/panel/App.tsx`
- Test: `helper/notion-public.test.mjs`
- Test: `src/test/notion-link-client.test.ts`

- [ ] **Step 1: Write failing helper/client contract tests**

Expected helper response shape:

```ts
{
  title: "Page title",
  text: "plain text fallback",
  lineCount: 3,
  blocks: [
    { kind: "text", text: "plain text" },
    {
      kind: "image",
      text: "chart",
      asset: {
        id: "asset-1",
        kind: "image",
        fileName: "chart.png",
        mimeType: "image/png",
        url: "https://...",
        bytesBase64: "iVBORw0KGgo="
      }
    }
  ]
}
```

Add a client validation test that rejects malformed image assets and accepts the shape above.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- helper/notion-public.test.mjs src/test/notion-link-client.test.ts`

Expected: FAIL because the helper/client currently expose only text.

- [ ] **Step 3: Implement backward-compatible client model**

In `src/features/notion-link/client.ts`, keep `text` and `lineCount`, and add optional structured blocks:

```ts
export interface PublicNotionText {
  title: string;
  text: string;
  lineCount: number;
  blocks?: DocumentBlock[];
}
```

Decode image `bytesBase64` into `Uint8Array` in the client so the app and renderer never handle base64.

- [ ] **Step 4: Implement helper image extraction**

In `helper/notion-public.mjs`, when Notion public blocks include an image URL:

1. Emit a text fallback line only if there is a caption.
2. Fetch image bytes server-side.
3. Infer MIME type from response `content-type` or URL extension.
4. Return `bytesBase64` only when bytes were fetched successfully.
5. If download fails, return the URL-only image block and let quality reporting mark it as skipped by HWPX generation.

- [ ] **Step 5: Update app ingestion**

In `src/panel/App.tsx`, when `result.blocks` exists, use it directly:

```ts
const parsedBlocks = result.blocks ?? normalizeLinesToBlocks(result.text.split(/\r?\n/).map((line) => cleanNotionLine(line)));
```

- [ ] **Step 6: Run focused tests**

Run: `npm test -- helper/notion-public.test.mjs src/test/notion-link-client.test.ts`

Expected: helper and client tests pass.

---

### Task 4: Make Template Graphics A First-Class Drop Policy

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Test: `src/test/hwpx-render.test.ts`

- [ ] **Step 1: Expand the existing graphics regression test**

Extend the current raster removal test so it also checks package cleanup:

```ts
expect(output["BinData/image1.png"]).toBeUndefined();
expect(strFromU8(output["Contents/content.hpf"])).not.toContain('id="image1"');
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/test/hwpx-render.test.ts -t "removes sample raster graphics"`

Expected: FAIL if unreferenced `BinData` files or manifest items still remain.

- [ ] **Step 3: Refactor options into explicit asset policy**

Add:

```ts
export interface HwpxAssetPolicy {
  templateGraphics?: "drop" | "keep";
  sourceImages?: "place" | "skip";
}

export interface GenerateHwpxOptions {
  mode?: HwpxRenderMode;
  tableStyles?: TableStyleOverrides;
  assetPolicy?: HwpxAssetPolicy;
}
```

Default policy:

```ts
const defaultAssetPolicy: Required<HwpxAssetPolicy> = {
  templateGraphics: "drop",
  sourceImages: "place"
};
```

- [ ] **Step 4: Clean HWPX package entries when dropping template graphics**

After section rendering, collect remaining `binaryItemIDRef` values from `Contents/section0.xml`. Remove unreferenced `BinData/*` files and matching `<opf:item id="imageN".../>` entries from `Contents/content.hpf`.

```ts
function pruneUnreferencedBinData(files: Record<string, Uint8Array>, sectionXml: string): void {
  const usedIds = new Set(Array.from(sectionXml.matchAll(/binaryItemIDRef="([^"]+)"/g), (match) => match[1] ?? ""));

  for (const path of Object.keys(files)) {
    if (!path.startsWith("BinData/")) {
      continue;
    }

    const id = path.split("/").pop()?.replace(/\.[^.]+$/u, "");
    if (id !== undefined && !usedIds.has(id)) {
      delete files[path];
    }
  }

  const contentPath = "Contents/content.hpf";
  const content = files[contentPath];
  if (content !== undefined) {
    const xml = strFromU8(content).replace(/<opf:item\b(?=[^>]*\bid="image[^"]*")[^>]*\/>/g, (item) => {
      const id = item.match(/\bid="([^"]+)"/)?.[1] ?? "";
      return usedIds.has(id) ? item : "";
    });
    files[contentPath] = new Uint8Array(strToU8(xml));
  }
}
```

- [ ] **Step 5: Run renderer tests**

Run: `npm test -- src/test/hwpx-render.test.ts`

Expected: renderer tests pass.

---

### Task 5: Render Source Images Into HWPX

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Test: `src/test/hwpx-render.test.ts`

- [ ] **Step 1: Write failing source image rendering test**

Add:

```ts
it("embeds source image blocks as new HWPX BinData images", () => {
  const template = loadHwpxTemplate(createTableTemplateZip());
  const output = unzipSync(
    generateHwpx(
      template,
      [
        { id: "block-1", role: "title", text: "새 제목" },
        {
          id: "block-2",
          role: "image",
          text: "차트",
          asset: {
            id: "asset-1",
            kind: "image",
            fileName: "chart.png",
            mimeType: "image/png",
            bytes: new Uint8Array([137, 80, 78, 71])
          }
        },
        { id: "block-3", role: "body", text: "이미지 뒤 본문" }
      ],
      { mode: "preserveTemplate" }
    )
  );
  const sectionXml = strFromU8(output["Contents/section0.xml"]);
  const contentHpf = strFromU8(output["Contents/content.hpf"]);

  expect(output["BinData/source-image-1.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(sectionXml).toContain('binaryItemIDRef="source-image-1"');
  expect(contentHpf).toContain('id="source-image-1"');
  expect(contentHpf).toContain('href="BinData/source-image-1.png"');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/test/hwpx-render.test.ts -t "embeds source image blocks"`

Expected: FAIL because source image blocks are currently ignored by text-slot replacement.

- [ ] **Step 3: Add source image package writer**

Add source image assets after rendering text:

```ts
interface HwpxPackageAsset {
  id: string;
  path: string;
  mediaType: string;
  bytes: Uint8Array;
}

function collectSourceImageAssets(blocks: DocumentBlock[]): HwpxPackageAsset[] {
  return blocks
    .filter((block) => block.role === "image" && block.asset?.bytes !== undefined)
    .map((block, index) => {
      const extension = extensionFromMimeType(block.asset?.mimeType ?? "image/png");
      return {
        id: `source-image-${index + 1}`,
        path: `BinData/source-image-${index + 1}.${extension}`,
        mediaType: block.asset?.mimeType ?? "image/png",
        bytes: block.asset?.bytes ?? new Uint8Array()
      };
    });
}
```

Add every package asset to `files` and append matching manifest items before `</opf:manifest>`.

- [ ] **Step 4: Insert image paragraphs at source order**

Do not place source images inside dropped sample image objects. Insert an HWPX image paragraph after the last assigned text paragraph before that image block. Use a conservative default width based on the first available sample page body width; if unavailable, use `42520`.

The image paragraph should be generated from a simple, deterministic XML template:

```ts
function renderSourceImageParagraph(asset: HwpxPackageAsset, paragraphId: string, charPrIDRef: string): string {
  return `<hp:p id="${paragraphId}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${charPrIDRef}">` +
    `<hp:pic id="${paragraphId}-pic" zOrder="1" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${paragraphId}">` +
    `<hp:offset x="0" y="0"/><hp:orgSz width="42520" height="24000"/><hp:curSz width="42520" height="24000"/>` +
    `<hp:flip horizontal="0" vertical="0"/><hc:img binaryItemIDRef="${asset.id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
    `</hp:pic></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>` +
    `</hp:p>`;
}
```

Use the sample's common body `charPrIDRef` instead of hardcoding when possible.

- [ ] **Step 5: Run renderer tests**

Run: `npm test -- src/test/hwpx-render.test.ts`

Expected: all renderer tests pass.

---

### Task 6: Surface Asset Policy In UI And Quality Report

**Files:**
- Modify: `src/features/hwpx/quality.ts`
- Modify: `src/panel/App.tsx`
- Test: `src/test/hwpx-quality.test.ts`

- [ ] **Step 1: Write failing quality tests**

Add:

```ts
it("reports dropped template images and source images", () => {
  const template = loadHwpxTemplate(createTemplateZipWithImage());
  const blocks: DocumentBlock[] = [
    {
      id: "block-1",
      role: "image",
      text: "차트",
      asset: { id: "asset-1", kind: "image", fileName: "chart.png", mimeType: "image/png", bytes: new Uint8Array([1]) }
    }
  ];

  expect(analyzeGenerationQuality(template, blocks).issues).toContainEqual({
    severity: "info",
    message: "샘플 이미지는 텍스트가 박혀 있을 수 있어 기본 제거하고, 입력 이미지 1개를 새 이미지로 배치합니다."
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/test/hwpx-quality.test.ts -t "dropped template images"`

Expected: FAIL.

- [ ] **Step 3: Implement image counts**

Count template graphics from `template.sectionXml` and source image blocks from `blocks`:

```ts
const templateImageCount = (template.sectionXml.match(/<hp:(?:pic|container)\b/g) ?? []).length;
const sourceImageCount = blocks.filter((block) => block.role === "image").length;
const embeddableSourceImageCount = blocks.filter((block) => block.role === "image" && block.asset?.bytes !== undefined).length;
```

Report URL-only images as warning:

```ts
if (sourceImageCount > embeddableSourceImageCount) {
  issues.push({
    severity: "warning",
    message: `입력 이미지 ${sourceImageCount - embeddableSourceImageCount}개는 파일 바이트가 없어 이번 HWPX에는 배치하지 않습니다.`
  });
}
```

- [ ] **Step 4: Update UI wording**

In `src/panel/App.tsx`, keep the rule short:

```tsx
<li>샘플 이미지는 복사하지 않고, Notion 원문 이미지만 새 이미지로 배치합니다.</li>
```

Display image rows in the block list with the existing role selector and `text` as the caption/alt text.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/test/hwpx-quality.test.ts`

Expected: quality tests pass.

---

### Task 7: Real Sample Verification Loop

**Files:**
- Modify only if tests expose a concrete bug.
- Output files: `/Users/hyeon/Desktop/hwp-result/`

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected:
- `npm test`: all tests pass.
- `npm run build`: TypeScript and Vite build pass.
- `git diff --check`: no whitespace errors.

- [ ] **Step 2: Generate comparison files from all three BRIEF samples**

Create a temporary script with `apply_patch`, run it with `node_modules/.bin/vite-node`, then delete it with `apply_patch`. The script should generate:

- `/Users/hyeon/Desktop/hwp-result/source-asset-policy-sample1.hwpx`
- `/Users/hyeon/Desktop/hwp-result/source-asset-policy-sample2.hwpx`
- `/Users/hyeon/Desktop/hwp-result/source-asset-policy-sample3.hwpx`

It must print these counts for each output:

```ts
{
  paragraphs,
  tables,
  templatePicsRemaining,
  templateContainersRemaining,
  binaryRefs,
  binDataFiles,
  sourceImageRefs,
  lineSegArrays,
  lineSegs
}
```

- [ ] **Step 3: Verify expected XML/package invariants**

Expected for text-only Notion input:
- `templatePicsRemaining` is `0`.
- `templateContainersRemaining` is `0`.
- `sourceImageRefs` is `0`.
- `binDataFiles` has no stale sample-only image files.
- paragraph/table counts remain close to the sample because the editable layout is preserved.

Expected for Notion input with images:
- source images are present in `BinData/source-image-N.*`.
- section XML references `binaryItemIDRef="source-image-N"`.
- content manifest contains matching `opf:item` rows.
- no original sample image references remain unless the user explicitly sets `assetPolicy.templateGraphics = "keep"`.

- [ ] **Step 4: Manual Hancom check**

Open generated files in Hancom and inspect:
- no stale sample card/book/news images,
- Notion images appear only where the input has image blocks,
- text does not overlap at the image insertion point,
- title tables and body tables still follow the sample layout.

---

## Self-Review

- Spec coverage: template images are separated from source images in Tasks 1, 4, and 5; Notion export/public image ingestion is covered in Tasks 2 and 3; UI/quality communication is covered in Task 6; real sample verification is covered in Task 7.
- Placeholder scan: no `TBD`, `TODO`, or open-ended "add tests" steps remain.
- Type consistency: `DocumentImageAsset`, `DocumentBlock.role === "image"`, `assetPolicy.templateGraphics`, and `assetPolicy.sourceImages` are used consistently across tasks.
- Scope check: this is intentionally one product slice: asset policy and image flow. It does not redesign semantic text matching, table layout inference, or AI-assisted matching.
