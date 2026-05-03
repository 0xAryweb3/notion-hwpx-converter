# Public Notion Link Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public Notion URL import and fix localhost helper browser access.

**Architecture:** Keep Notion scraping out of the browser because public Notion content is loaded through internal APIs without browser-friendly CORS. Extend the existing localhost helper with a public Notion proxy endpoint and expose a small typed client in the panel.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, Node HTTP helper, Notion public `loadPageChunk`.

---

### Task 1: Public Notion Parser

**Files:**
- Create: `helper/notion-public.mjs`
- Test: `helper/notion-public.test.mjs`

- [ ] Write tests for extracting 32-char Notion IDs, converting record maps into plain text, stripping Markdown emphasis, and shortening URL-only link text.
- [ ] Implement pure helper functions for page ID parsing, block traversal, text cleanup, and public page fetch payload construction.
- [ ] Run `npm test -- helper/notion-public.test.mjs`.

### Task 2: Helper Endpoints And CORS

**Files:**
- Modify: `helper/codex-helper.mjs`

- [ ] Add `POST /notion/public` returning `{ title, text, lineCount }`.
- [ ] Add `Access-Control-Allow-Private-Network: true` and request method/header coverage for Chrome localhost calls.
- [ ] Manually verify `GET /health`, `OPTIONS /match`, and `POST /notion/public`.

### Task 3: Panel Link Import

**Files:**
- Create: `src/features/notion-link/client.ts`
- Test: `src/test/notion-link-client.test.ts`
- Modify: `src/panel/App.tsx`
- Modify: `src/panel/styles.css`

- [ ] Write tests for client response parsing and helper error messages.
- [ ] Add a typed client that calls the helper endpoint.
- [ ] Add URL input and load button in the content section.
- [ ] Normalize returned plain text into editable document blocks.

### Task 4: Verification

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Update docs with public Notion link usage and localhost helper requirements.

### Task 5: High-Fidelity HWPX Rendering For Table Templates

**Files:**
- Modify: `src/features/hwpx/template.ts`
- Modify: `src/features/hwpx/render.ts`
- Test: `src/test/hwpx-render.test.ts`

- [ ] Write a failing test using a table-containing template that proves generated HWPX keeps `hp:tbl`, cell paragraph style IDs, and char style IDs.
- [ ] Write a failing test for BRIEF title splitting so `울산광역시 탄소중립지원센터 BRIEF 통권 제9호(...)` fills the title and issue-number template paragraphs separately.
- [ ] Implement a template-preserving renderer path when the uploaded sample contains tables.
- [ ] Strip stale `hp:linesegarray` elements in generated output so Hancom can reflow changed text.
- [ ] Keep the existing flat renderer as fallback for simple non-table notice templates.
