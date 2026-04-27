## Goal
Build a Chrome extension MVP that converts a Notion export or pasted text into an HWPX document by extracting formatting from an uploaded sample HWPX file.

## Current Status
Branch: `feat/notion-hwpx-converter`
Last implementation commit before this handoff update: `2b3cb32`

Implemented:
- Project scaffold for a Vite/React/TypeScript Chrome MV3 extension.
- Document role detection for title, notice number, body, `1.`, `가.`, `-`, and `※`.
- Notion export parsing for `.zip`, `.md`, `.markdown`, `.html`, and `.htm`.
- HWPX template loading and section rendering by reusing template paragraph/character style references.
- Side panel UI for template upload, content upload/paste, block role editing, and HWPX download.
- Review fixes for date detection, notice-number-then-title detection, first-match style inference, and generated preview text.
- Accuracy comparison path: rule-only output and Codex CLI-assisted output via local helper.

## What Was Tried
- Confirmed the provided sample HWPX is a ZIP package and contains `Contents/header.xml` plus `Contents/section0.xml`.
- Extracted sample style references such as `paraPrIDRef` and `charPrIDRef` from existing paragraphs.
- Used TDD for document role detection, Notion export parsing, and HWPX rendering.
- Fixed build config issues by splitting Vite and Vitest configs.
- Fixed fflate ZIP test data construction by ensuring typed arrays are created in the active runtime realm.
- Code review found that the real sample could infer wrong styles from later paragraphs; fixed by keeping first matched role styles and rejecting date-like section matches.

## Next Steps
Run `npm run helper:codex` and `npm run dev`, then manually test both `rules-output.hwpx` and `codex-output.hwpx` with the sample file at `/Users/hyeon/Downloads/입찰공고문(2025-436) (제12회 대학생 물환경 정책·기술 공모전).hwpx`.

## Context
The product direction is now clearer: the core value is not general Notion import, but using a sample HWPX as a formatting teacher. Exact style extraction should be deterministic through HWPX XML. AI should be introduced later for semantic block matching and ambiguity resolution, not for low-level style guessing.
