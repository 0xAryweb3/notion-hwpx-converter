import { Download, FileText, FileUp, Plus, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizeLinesToBlocks } from "../features/document/detect";
import type { DocumentBlock, DocumentBlockRole } from "../features/document/types";
import { generateHwpx } from "../features/hwpx/render";
import { loadHwpxTemplate } from "../features/hwpx/template";
import type { HwpxTemplate } from "../features/hwpx/template";
import { parseNotionSource } from "../features/notion-export/parse";

const roleOptions: Array<{ value: DocumentBlockRole; label: string }> = [
  { value: "title", label: "제목" },
  { value: "noticeNumber", label: "공고번호" },
  { value: "body", label: "본문" },
  { value: "section", label: "1. 대항목" },
  { value: "koreanItem", label: "가. 항목" },
  { value: "dashItem", label: "- 세부항목" },
  { value: "note", label: "※ 참고" }
];

const emptyDraft = `환경부공고 제2025-436호
「제12회 대학생 물환경 정책‧기술 공모전」 입찰 공고

1. 입찰내용
  가. 용 역 명: 제12회 대학생 물환경 정책‧기술 공모전
  나. 용역기간: 계약일로부터 6개월
     - 평가기관 : 환경부`;

export function App() {
  const [template, setTemplate] = useState<HwpxTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [draftText, setDraftText] = useState(emptyDraft);
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [status, setStatus] = useState("샘플 HWPX 양식을 먼저 올려주세요.");

  const canGenerate = useMemo(() => template !== null && blocks.length > 0, [blocks.length, template]);

  async function handleTemplateFile(file: File): Promise<void> {
    try {
      const loadedTemplate = loadHwpxTemplate(await file.arrayBuffer());
      setTemplate(loadedTemplate);
      setTemplateName(file.name);
      setStatus("양식 분석 완료. 새 내용을 넣고 문단 역할을 확인하세요.");
    } catch (error) {
      setTemplate(null);
      setTemplateName("");
      setStatus(readErrorMessage(error));
    }
  }

  async function handleSourceFile(file: File): Promise<void> {
    try {
      const parsedBlocks = parseNotionSource({ name: file.name, data: await file.arrayBuffer() });
      setBlocks(parsedBlocks);
      setSourceName(file.name);
      setStatus(`${parsedBlocks.length}개 문단을 감지했습니다.`);
    } catch (error) {
      setStatus(readErrorMessage(error));
    }
  }

  function parseDraftText(): void {
    const parsedBlocks = normalizeLinesToBlocks(draftText.split(/\r?\n/));
    setBlocks(parsedBlocks);
    setSourceName("붙여넣은 내용");
    setStatus(`${parsedBlocks.length}개 문단을 감지했습니다.`);
  }

  function updateBlock(id: string, patch: Partial<Pick<DocumentBlock, "role" | "text">>): void {
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) => (block.id === id ? { ...block, ...patch } : block))
    );
  }

  function updateBlockRole(id: string, value: string): void {
    const role = readBlockRole(value);

    if (role !== null) {
      updateBlock(id, { role });
    }
  }

  function addBlock(): void {
    setBlocks((currentBlocks) => [
      ...currentBlocks,
      { id: `block-${Date.now()}`, role: "body", text: "" }
    ]);
  }

  function removeBlock(id: string): void {
    setBlocks((currentBlocks) => currentBlocks.filter((block) => block.id !== id));
  }

  function downloadHwpx(): void {
    if (template === null) {
      setStatus("HWPX 양식을 먼저 올려주세요.");
      return;
    }

    if (blocks.length === 0) {
      setStatus("변환할 내용이 없습니다.");
      return;
    }

    const output = generateHwpx(template, blocks);
    downloadBytes(output, "notion-converted.hwpx");
    setStatus("HWPX 파일을 생성했습니다.");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Notion HWPX</h1>
          <p>샘플 한글 양식에서 문단 서식을 추출해 새 내용에 적용합니다.</p>
        </div>
      </header>

      <section className="panel-section">
        <div className="section-title">
          <FileUp size={18} aria-hidden="true" />
          <h2>양식 분석</h2>
        </div>
        <label className="file-input">
          <span>HWPX 샘플 양식</span>
          <input
            type="file"
            accept=".hwpx"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) {
                void handleTemplateFile(file);
              }
            }}
          />
        </label>
        {template !== null ? (
          <div className="template-summary">
            <strong>{templateName}</strong>
            <dl>
              {roleOptions.map((role) => {
                const style = template.styleMap[role.value];
                return (
                  <div key={role.value}>
                    <dt>{role.label}</dt>
                    <dd>
                      p{style.paraPrIDRef} / c{style.charPrIDRef}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : null}
      </section>

      <section className="panel-section">
        <div className="section-title">
          <FileText size={18} aria-hidden="true" />
          <h2>내용 넣기</h2>
        </div>
        <label className="file-input">
          <span>Notion export ZIP / MD / HTML</span>
          <input
            type="file"
            accept=".zip,.md,.markdown,.html,.htm"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) {
                void handleSourceFile(file);
              }
            }}
          />
        </label>
        <textarea
          className="draft-input"
          value={draftText}
          spellCheck={false}
          aria-label="붙여넣은 내용"
          onChange={(event) => setDraftText(event.currentTarget.value)}
        />
        <button className="secondary-button" type="button" onClick={parseDraftText}>
          <Wand2 size={16} aria-hidden="true" />
          문단 감지
        </button>
      </section>

      <section className="panel-section">
        <div className="section-title with-action">
          <div>
            <Wand2 size={18} aria-hidden="true" />
            <h2>문단 매칭</h2>
          </div>
          <button className="icon-button" type="button" onClick={addBlock} aria-label="문단 추가">
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {sourceName.length > 0 ? <p className="source-name">{sourceName}</p> : null}
        <div className="block-list">
          {blocks.map((block, index) => (
            <div className="block-row" key={block.id}>
              <div className="block-meta">
                <span>{index + 1}</span>
                <select
                  value={block.role}
                  aria-label={`${index + 1}번 문단 역할`}
                  onChange={(event) => updateBlockRole(block.id, event.currentTarget.value)}
                >
                  {roleOptions.map((role) => (
                    <option value={role.value} key={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  aria-label={`${index + 1}번 문단 삭제`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
              <textarea
                value={block.text}
                spellCheck={false}
                aria-label={`${index + 1}번 문단 내용`}
                onChange={(event) => updateBlock(block.id, { text: event.currentTarget.value })}
              />
            </div>
          ))}
        </div>
      </section>

      <footer className="action-bar">
        <p aria-live="polite">{status}</p>
        <button className="primary-button" type="button" disabled={!canGenerate} onClick={downloadHwpx}>
          <Download size={16} aria-hidden="true" />
          HWPX 생성
        </button>
      </footer>
    </main>
  );
}

function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const url = URL.createObjectURL(new Blob([blobBytes.buffer], { type: "application/hwp+zip" }));
  const chromeApi = globalThis.chrome;

  if (chromeApi?.downloads !== undefined) {
    chromeApi.downloads.download({ url, filename, saveAs: true }, () => {
      URL.revokeObjectURL(url);
    });
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
}

function readBlockRole(value: string): DocumentBlockRole | null {
  return roleOptions.find((role) => role.value === value)?.value ?? null;
}
