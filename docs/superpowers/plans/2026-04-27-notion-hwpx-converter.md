# Notion HWPX Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension MVP that converts a local Notion export plus an HWPX template into a downloadable HWPX document.

**Architecture:** Use a React/TypeScript MV3 extension with a pure TypeScript conversion core. The side panel handles file input and editing; `features/notion-export`, `features/document`, and `features/hwpx` perform deterministic parsing and rendering.

**Tech Stack:** TypeScript, React, Vite, Vitest, fflate, lucide-react, Chrome MV3.

---

## File Map

- Create `package.json`: npm scripts and dependencies.
- Create `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`: build/test configuration.
- Create `manifest.json`: Chrome MV3 extension manifest.
- Create `src/background.ts`: side panel launch behavior.
- Create `src/panel/App.tsx`, `src/panel/main.tsx`, `src/panel/styles.css`: extension UI.
- Create `src/features/document/types.ts`: normalized document block model.
- Create `src/features/document/detect.ts`: rule-based paragraph role detection.
- Create `src/features/notion-export/parse.ts`: Markdown/HTML/ZIP import.
- Create `src/features/hwpx/xml.ts`: XML escaping helpers.
- Create `src/features/hwpx/template.ts`: HWPX ZIP/template loading.
- Create `src/features/hwpx/render.ts`: HWPX section rendering and output ZIP generation.
- Create `src/test/*.test.ts`: core tests.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `manifest.json`
- Create: `src/background.ts`

- [ ] Add build/test scripts and dependencies.
- [ ] Configure Vite to output a static extension bundle.
- [ ] Add MV3 manifest with `sidePanel`, `downloads`, and `storage` permissions.
- [ ] Add a background service worker that opens the side panel when the toolbar icon is clicked.
- [ ] Run `npm install`.
- [ ] Run `npm run build` and confirm the scaffold compiles.
- [ ] Commit with `[chore] scaffold extension project`.

## Task 2: Document Role Detection

**Files:**
- Create: `src/features/document/types.ts`
- Create: `src/features/document/detect.ts`
- Create: `src/test/document-detect.test.ts`

- [ ] Write failing tests for title, notice number, numeric section, Korean alpha item, dash item, note, and body detection.
- [ ] Run `npm test -- src/test/document-detect.test.ts` and confirm the tests fail because the module does not exist.
- [ ] Implement the block model and role detection.
- [ ] Run the test and confirm it passes.
- [ ] Commit with `[feat] add document role detection`.

## Task 3: Notion Export Parser

**Files:**
- Create: `src/features/notion-export/parse.ts`
- Create: `src/test/notion-export-parse.test.ts`

- [ ] Write failing tests for Markdown parsing and ZIP parsing that prefers Markdown over HTML.
- [ ] Run the parser tests and confirm they fail because the parser does not exist.
- [ ] Implement Markdown parsing, HTML text extraction, and ZIP file selection with `fflate`.
- [ ] Run parser tests and confirm they pass.
- [ ] Commit with `[feat] parse notion export files`.

## Task 4: HWPX Template Loader and Renderer

**Files:**
- Create: `src/features/hwpx/xml.ts`
- Create: `src/features/hwpx/template.ts`
- Create: `src/features/hwpx/render.ts`
- Create: `src/test/hwpx-render.test.ts`

- [ ] Write failing tests that load a synthetic HWPX ZIP, generate a new HWPX, preserve non-section files, and escape XML text.
- [ ] Run renderer tests and confirm they fail because the HWPX modules do not exist.
- [ ] Implement ZIP loading, section setup extraction, style inference/fallbacks, XML rendering, and output ZIP generation.
- [ ] Run renderer tests and confirm they pass.
- [ ] Commit with `[feat] generate hwpx documents`.

## Task 5: Side Panel Editor

**Files:**
- Create: `src/panel/App.tsx`
- Create: `src/panel/main.tsx`
- Create: `src/panel/styles.css`
- Modify: `index.html`

- [ ] Build the side panel UI with template upload, Notion export upload, block editor, status messages, and download action.
- [ ] Use lucide icons for file upload, generate, download, delete, and add actions.
- [ ] Keep controls dense and utility-focused, not landing-page styled.
- [ ] Run `npm run build` and confirm the extension bundle builds.
- [ ] Commit with `[feat] add extension side panel editor`.

## Task 6: Verification and Handoff

**Files:**
- Create: `README.md`
- Create: `HANDOFF.md`

- [ ] Add setup, build, test, and Chrome loading instructions.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Update `HANDOFF.md` with branch, status, files changed, failures, and next action.
- [ ] Commit with `[docs] document converter workflow`.
