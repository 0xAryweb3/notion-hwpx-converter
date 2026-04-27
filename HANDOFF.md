## Goal
Build a Chrome extension MVP that converts a Notion export or pasted text into an HWPX document by extracting formatting from an uploaded sample HWPX file.

## Current Status
Branch: `feat/notion-hwpx-converter`
Last commit before this handoff update: `21b3965`

Implemented:
- Project scaffold for a Vite/React/TypeScript Chrome MV3 extension.
- Document role detection for title, notice number, body, `1.`, `가.`, `-`, and `※`.
- Notion export parsing for `.zip`, `.md`, `.markdown`, `.html`, and `.htm`.
- HWPX template loading and section rendering by reusing template paragraph/character style references.
- Side panel UI for template upload, content upload/paste, block role editing, and HWPX download.

## What Was Tried
- Confirmed the provided sample HWPX is a ZIP package and contains `Contents/header.xml` plus `Contents/section0.xml`.
- Extracted sample style references such as `paraPrIDRef` and `charPrIDRef` from existing paragraphs.
- Used TDD for document role detection, Notion export parsing, and HWPX rendering.
- Fixed build config issues by splitting Vite and Vitest configs.
- Fixed fflate ZIP test data construction by ensuring typed arrays are created in the active runtime realm.

## Next Steps
Load `dist/` in Chrome and manually test with the sample file at `/Users/hyeon/Downloads/입찰공고문(2025-436) (제12회 대학생 물환경 정책·기술 공모전).hwpx`, then open the generated HWPX in Hancom to verify visual fidelity.

## Context
The product direction is now clearer: the core value is not general Notion import, but using a sample HWPX as a formatting teacher. Exact style extraction should be deterministic through HWPX XML. AI should be introduced later for semantic block matching and ambiguity resolution, not for low-level style guessing.
