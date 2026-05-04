import { Download, FileText, FileUp, Link2, Plus, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizeLinesToBlocks } from "../features/document/detect";
import type { DocumentBlock, DocumentBlockRole } from "../features/document/types";
import { generateHwpx } from "../features/hwpx/render";
import type { TableStyleOverrides } from "../features/hwpx/render";
import { analyzeGenerationQuality } from "../features/hwpx/quality";
import type { GenerationQualityReport } from "../features/hwpx/quality";
import { loadHwpxTemplate } from "../features/hwpx/template";
import type { HwpxTemplate, HwpxTextStyleSummary } from "../features/hwpx/template";
import type { HwpxFormatProfile, HwpxPageMargins } from "../features/hwpx/formatProfile";
import { matchBlocksWithCodex } from "../features/matching/codexClient";
import { fetchPublicNotionText } from "../features/notion-link/client";
import { parseNotionSource } from "../features/notion-export/parse";
import { cleanNotionLine } from "../features/notion-text/clean";

const roleOptions: Array<{ value: DocumentBlockRole; label: string }> = [
  { value: "title", label: "제목" },
  { value: "noticeNumber", label: "공고번호" },
  { value: "body", label: "본문" },
  { value: "section", label: "1. 대항목" },
  { value: "koreanItem", label: "가. 항목" },
  { value: "dashItem", label: "- 세부항목" },
  { value: "tableRow", label: "표 행" },
  { value: "image", label: "이미지" },
  { value: "note", label: "※ 참고" }
];

const emptyDraft = `환경부공고 제2025-436호
「제12회 대학생 물환경 정책‧기술 공모전」 입찰 공고

1. 입찰내용
  가. 용 역 명: 제12회 대학생 물환경 정책‧기술 공모전
  나. 용역기간: 계약일로부터 6개월
     - 평가기관 : 환경부`;

type TableStyleGroup = "title" | "body";

interface TableStyleControl {
  enabled: boolean;
  fontFamily: string;
  fontSizePt: number;
  charSpacing: number;
  bold: boolean;
}

const defaultTableStyleControls: Record<TableStyleGroup, TableStyleControl> = {
  title: { enabled: false, fontFamily: "", fontSizePt: 16, charSpacing: 0, bold: true },
  body: { enabled: false, fontFamily: "", fontSizePt: 11, charSpacing: 0, bold: false }
};

export function App() {
  const [template, setTemplate] = useState<HwpxTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [tableStyleControls, setTableStyleControls] =
    useState<Record<TableStyleGroup, TableStyleControl>>(defaultTableStyleControls);
  const [draftText, setDraftText] = useState(emptyDraft);
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [status, setStatus] = useState("샘플 HWPX 양식을 먼저 올려주세요.");
  const [isLoadingNotion, setIsLoadingNotion] = useState(false);

  const canGenerate = useMemo(() => template !== null && blocks.length > 0, [blocks.length, template]);
  const qualityReport = useMemo(
    () => (template === null ? null : analyzeGenerationQuality(template, blocks)),
    [blocks, template]
  );

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
    const parsedBlocks = normalizeLinesToBlocks(draftText.split(/\r?\n/).map((line) => cleanNotionLine(line)));
    setBlocks(parsedBlocks);
    setSourceName("붙여넣은 내용");
    setStatus(`${parsedBlocks.length}개 문단을 감지했습니다.`);
  }

  async function handlePublicNotionUrl(): Promise<void> {
    const url = notionUrl.trim();

    if (url.length === 0) {
      setStatus("공개 Notion 링크를 입력해주세요.");
      return;
    }

    try {
      setIsLoadingNotion(true);
      setStatus("공개 Notion 페이지를 불러오는 중입니다.");
      const result = await fetchPublicNotionText(url);
      const parsedBlocks = result.blocks ??
        normalizeLinesToBlocks(result.text.split(/\r?\n/).map((line) => cleanNotionLine(line)));

      setDraftText(result.text);
      setBlocks(parsedBlocks);
      setSourceName(result.title.length > 0 ? result.title : "공개 Notion 링크");
      setStatus(`${result.lineCount}개 줄을 불러와 ${parsedBlocks.length}개 문단을 감지했습니다.`);
    } catch (error) {
      setStatus(readErrorMessage(error));
    } finally {
      setIsLoadingNotion(false);
    }
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

  function updateTableStyle(group: TableStyleGroup, patch: Partial<TableStyleControl>): void {
    setTableStyleControls((currentControls) => ({
      ...currentControls,
      [group]: { ...currentControls[group], ...patch }
    }));
  }

  function downloadRulesHwpx(): void {
    if (template === null) {
      setStatus("HWPX 양식을 먼저 올려주세요.");
      return;
    }

    if (blocks.length === 0) {
      setStatus("변환할 내용이 없습니다.");
      return;
    }

    const output = generateHwpx(template, blocks, {
      mode: "auto",
      tableStyles: buildTableStyleOverrides(tableStyleControls)
    });
    downloadBytes(output, "rules-output.hwpx");
    setStatus("샘플 양식을 적용한 HWPX 파일을 생성했습니다.");
  }

  async function downloadCodexHwpx(): Promise<void> {
    if (template === null) {
      setStatus("HWPX 양식을 먼저 올려주세요.");
      return;
    }

    if (blocks.length === 0) {
      setStatus("변환할 내용이 없습니다.");
      return;
    }

    try {
      setStatus("Codex CLI로 문단 역할을 다시 매칭하는 중입니다.");
      const codexBlocks = await matchBlocksWithCodex(template, blocks);
      const output = generateHwpx(template, codexBlocks, {
        mode: "auto",
        tableStyles: buildTableStyleOverrides(tableStyleControls)
      });
      downloadBytes(output, "codex-output.hwpx");
      setStatus("Codex HWPX 파일을 생성했습니다.");
    } catch (error) {
      setStatus(`${readErrorMessage(error)} helper 실행: npm run helper:codex`);
    }
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
            <div className="template-insights">
              <span>문단 {template.analysis.paragraphCount}개</span>
              <span>표 {template.analysis.tableCount}개</span>
              <span>제목 표 {template.analysis.leadingTitleTableCount}개</span>
              <span>본문 표 {template.analysis.bodyTableCount}개</span>
            </div>
            <dl>
              {roleOptions.map((role) => {
                const style = template.styleMap[role.value];
                const details = template.styleDetails[role.value];
                return (
                  <div key={role.value}>
                    <dt>{role.label}</dt>
                    <dd>
                      p{style.paraPrIDRef} / c{style.charPrIDRef}
                      {details !== null ? <small>{formatStyleDetails(details)}</small> : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {renderFormatProfile(template.formatProfile)}
            {renderMeasuredRoleStyles(template)}
          </div>
        ) : null}
        <div className="template-rule-panel">
          <strong>자동 적용 규칙</strong>
          <ul>
            <li>
              제목 영역은 샘플 구조를 그대로 씁니다.
              {template === null
                ? null
                : template.analysis.leadingTitleTableCount > 0
                  ? ` 제목 표 ${template.analysis.leadingTitleTableCount}개가 유지됩니다.`
                  : " 샘플에 제목 표가 없으므로 새 표를 만들지 않습니다."}
            </li>
            <li>본문은 입력 내용 기준으로 다시 배치하고, 샘플의 글꼴, 자간, 들여쓰기, 줄 간격을 재사용합니다.</li>
            <li>입력에 표 행이 있을 때만 샘플 본문 표를 복제하고, 입력에 표가 없으면 샘플 본문 표는 제거합니다.</li>
            <li>샘플 이미지는 복사하지 않고, Notion 원문 이미지만 새 이미지로 배치합니다.</li>
          </ul>
          {renderPipelineModes()}
        </div>
        <div className="table-style-panel">
          <div className="table-style-header">
            <span>고급 보정</span>
            <small>표 글자만 직접 조정</small>
          </div>
          {renderTableStyleControls("title", "표 제목", tableStyleControls.title, template, updateTableStyle)}
          {renderTableStyleControls("body", "표 본문", tableStyleControls.body, template, updateTableStyle)}
        </div>
        {qualityReport !== null ? renderQualityReport(qualityReport) : null}
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
        <label className="url-input">
          <span>공개 Notion 링크</span>
          <div>
            <input
              type="url"
              value={notionUrl}
              spellCheck={false}
              placeholder="https://example.notion.site/..."
              onChange={(event) => setNotionUrl(event.currentTarget.value)}
            />
            <button
              className="secondary-button"
              type="button"
              disabled={isLoadingNotion}
              onClick={() => {
                void handlePublicNotionUrl();
              }}
            >
              <Link2 size={16} aria-hidden="true" />
              불러오기
            </button>
          </div>
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
        <div className="download-actions">
          <button className="primary-button" type="button" disabled={!canGenerate} onClick={downloadRulesHwpx}>
            <Download size={16} aria-hidden="true" />
            양식 적용 HWPX
          </button>
          <button
            className="primary-button codex"
            type="button"
            disabled={!canGenerate}
            onClick={() => {
              void downloadCodexHwpx();
            }}
          >
            <Download size={16} aria-hidden="true" />
            Codex 매칭 HWPX
          </button>
        </div>
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

function renderQualityReport(report: GenerationQualityReport) {
  if (report.issues.length === 0 && report.assignmentRows.length === 0) {
    return null;
  }

  return (
    <div className="quality-report">
      <strong>생성 전 점검</strong>
      {report.issues.length > 0 ? (
        <ul>
          {report.issues.map((issue) => (
            <li className={issue.severity} key={`${issue.severity}-${issue.message}`}>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {report.assignmentRows.length > 0 ? (
        <div className="assignment-report">
          <div className="assignment-report-title">
            <span>서식 매핑 보고서</span>
            <small>{report.assignmentRows.length}개 출력 단위</small>
          </div>
          <table>
            <thead>
              <tr>
                <th>입력</th>
                <th>역할</th>
                <th>스타일</th>
                <th>수치</th>
              </tr>
            </thead>
            <tbody>
              {report.assignmentRows.map((row, index) => (
                <tr key={`${row.grammarRole}-${index}`}>
                  <td>{row.outputText}</td>
                  <td>{row.type === "structureTable" ? `${row.grammarRole} · 표` : row.grammarRole}</td>
                  <td>{row.style ?? "-"}</td>
                  <td>
                    {[
                      row.fontSizePt === null ? null : `${formatDecimal(row.fontSizePt)}pt`,
                      row.textColor,
                      row.charSpacing === null ? null : `자간 ${row.charSpacing}`,
                      row.indentLabel
                    ].filter((value): value is string => value !== null).join(" · ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function formatStyleDetails(details: HwpxTextStyleSummary): string {
  const parts = [
    details.fontSizePt === null ? null : `${Number.isInteger(details.fontSizePt) ? details.fontSizePt : details.fontSizePt.toFixed(1)}pt`,
    details.textColor,
    details.charSpacing === null ? null : `자간 ${details.charSpacing}`,
    details.bold ? "굵게" : null
  ].filter((part): part is string => part !== null && part.length > 0);

  return parts.join(" · ");
}

function renderFormatProfile(profile: HwpxFormatProfile) {
  const firstTable = profile.tables[0];
  const firstCell = firstTable?.firstCell;

  return (
    <div className="format-profile">
      <div className="format-profile-header">
        <span>서식 분석</span>
        <small>LLM 없이 HWPX XML에서 읽은 수치</small>
      </div>
      <div className="format-grid">
        <div className="format-card">
          <span>페이지</span>
          <strong>{profile.page === null ? "미감지" : `${formatHwpxUnit(profile.page.width)} x ${formatHwpxUnit(profile.page.height)}`}</strong>
          <small>{profile.page === null ? "여백 정보 없음" : formatPageMargins(profile.page.margins)}</small>
        </div>
        <div className="format-card">
          <span>스타일</span>
          <strong>{profile.counts.paragraphStyles}P / {profile.counts.characterStyles}C</strong>
          <small>문단/글자 스타일, border {profile.counts.borderFills}개</small>
        </div>
        <div className="format-card">
          <span>슬롯</span>
          <strong>{profile.counts.textSlots}개</strong>
          <small>표 안 {profile.textSlots.filter((slot) => slot.insideTable).length}개</small>
        </div>
        <div className="format-card">
          <span>표/셀</span>
          <strong>{profile.counts.tables}표 / {profile.counts.cells}셀</strong>
          <small>{firstCell?.margin === undefined || firstCell.margin === null ? "첫 셀 여백 없음" : `첫 셀 ${formatBox(firstCell.margin)}`}</small>
        </div>
      </div>
      {firstTable !== undefined ? (
        <div className="table-profile-line">
          <span>첫 표</span>
          <strong>{firstTable.rowCount}행 x {firstTable.colCount}열</strong>
          <small>
            {firstTable.width === null ? "폭 미감지" : `폭 ${formatHwpxUnit(firstTable.width)}`}
            {firstTable.height === null ? "" : ` · 높이 ${formatHwpxUnit(firstTable.height)}`}
          </small>
        </div>
      ) : null}
    </div>
  );
}

function renderMeasuredRoleStyles(template: HwpxTemplate) {
  const roles = roleOptions.slice(0, 6);

  return (
    <div className="measured-style-table">
      <div className="format-profile-header">
        <span>역할별 실측 스타일</span>
        <small>paraPr / charPr 연결</small>
      </div>
      <table>
        <thead>
          <tr>
            <th>역할</th>
            <th>글자</th>
            <th>문단</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const style = template.styleMap[role.value];
            const charStyle = template.formatProfile.characterStyles.find((item) => item.id === style.charPrIDRef);
            const paraStyle = template.formatProfile.paragraphStyles.find((item) => item.id === style.paraPrIDRef);

            return (
              <tr key={`measured-${role.value}`}>
                <td>{role.label}</td>
                <td>{formatMeasuredCharStyle(charStyle)}</td>
                <td>{formatMeasuredParaStyle(paraStyle)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderPipelineModes() {
  return (
    <div className="pipeline-modes">
      <div>
        <strong>Rule-only</strong>
        <span>서식 수치는 분석기에서 고정, 슬롯 매칭만 규칙으로 처리</span>
      </div>
      <div>
        <strong>Codex-assisted</strong>
        <span>서식 수치는 동일하게 고정, 애매한 문단-슬롯 매칭만 LLM 보조</span>
      </div>
    </div>
  );
}

function formatMeasuredCharStyle(style: HwpxFormatProfile["characterStyles"][number] | undefined): string {
  if (style === undefined) {
    return "미감지";
  }

  return [
    style.fontFace,
    style.fontSizePt === null ? null : `${formatDecimal(style.fontSizePt)}pt`,
    style.charSpacing === null ? null : `자간 ${style.charSpacing}`,
    style.widthRatio === null ? null : `장평 ${style.widthRatio}`,
    style.bold ? "굵게" : null
  ].filter((value): value is string => value !== null && value.length > 0).join(" · ");
}

function formatMeasuredParaStyle(style: HwpxFormatProfile["paragraphStyles"][number] | undefined): string {
  if (style === undefined) {
    return "미감지";
  }

  return [
    style.align.horizontal,
    `들여 ${style.margins.intent}`,
    `좌 ${style.margins.left}`,
    style.margins.prev === 0 ? null : `앞 ${style.margins.prev}`,
    style.margins.next === 0 ? null : `뒤 ${style.margins.next}`,
    style.lineSpacing.value === null ? null : `행간 ${style.lineSpacing.value}${style.lineSpacing.type === null ? "" : ` ${style.lineSpacing.type}`}`
  ].filter((value): value is string => value !== null && value.length > 0).join(" · ");
}

function formatPageMargins(margins: HwpxPageMargins): string {
  return `상 ${formatHwpxUnit(margins.top)} · 하 ${formatHwpxUnit(margins.bottom)} · 좌 ${formatHwpxUnit(margins.left)} · 우 ${formatHwpxUnit(margins.right)}`;
}

function formatBox(box: { left: number; right: number; top: number; bottom: number }): string {
  return `상 ${formatHwpxUnit(box.top)} · 하 ${formatHwpxUnit(box.bottom)} · 좌 ${formatHwpxUnit(box.left)} · 우 ${formatHwpxUnit(box.right)}`;
}

function formatHwpxUnit(value: number): string {
  return `${value.toLocaleString("ko-KR")}hu`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderTableStyleControls(
  group: TableStyleGroup,
  label: string,
  control: TableStyleControl,
  template: HwpxTemplate | null,
  updateTableStyle: (group: TableStyleGroup, patch: Partial<TableStyleControl>) => void
) {
  return (
    <div className="table-style-row" key={group}>
      <label className="style-enable">
        <input
          type="checkbox"
          checked={control.enabled}
          onChange={(event) => updateTableStyle(group, { enabled: event.currentTarget.checked })}
        />
        <span>{label}</span>
      </label>
      <select
        value={control.fontFamily}
        disabled={!control.enabled || template === null}
        aria-label={`${label} 글꼴`}
        onChange={(event) => updateTableStyle(group, { fontFamily: event.currentTarget.value })}
      >
        <option value="">샘플 폰트</option>
        {template?.availableFonts.map((font) => (
          <option value={font} key={`${group}-${font}`}>
            {font}
          </option>
        ))}
      </select>
      <label>
        <span>크기</span>
        <input
          type="number"
          min="6"
          max="40"
          step="0.5"
          value={control.fontSizePt}
          disabled={!control.enabled}
          onChange={(event) => updateTableStyle(group, { fontSizePt: event.currentTarget.valueAsNumber })}
        />
      </label>
      <label>
        <span>자간</span>
        <input
          type="number"
          min="-50"
          max="50"
          step="1"
          value={control.charSpacing}
          disabled={!control.enabled}
          onChange={(event) => updateTableStyle(group, { charSpacing: event.currentTarget.valueAsNumber })}
        />
      </label>
      <label className="bold-toggle">
        <input
          type="checkbox"
          checked={control.bold}
          disabled={!control.enabled}
          onChange={(event) => updateTableStyle(group, { bold: event.currentTarget.checked })}
        />
        <span>B</span>
      </label>
    </div>
  );
}

function buildTableStyleOverrides(controls: Record<TableStyleGroup, TableStyleControl>): TableStyleOverrides | undefined {
  const overrides: TableStyleOverrides = {};

  if (controls.title.enabled) {
    overrides.title = readTableStyleOverride(controls.title);
  }

  if (controls.body.enabled) {
    overrides.body = readTableStyleOverride(controls.body);
  }

  return overrides.title === undefined && overrides.body === undefined ? undefined : overrides;
}

function readTableStyleOverride(control: TableStyleControl) {
  return {
    fontFamily: control.fontFamily.length > 0 ? control.fontFamily : undefined,
    fontSizePt: Number.isFinite(control.fontSizePt) ? control.fontSizePt : undefined,
    charSpacing: Number.isFinite(control.charSpacing) ? control.charSpacing : undefined,
    bold: control.bold
  };
}
