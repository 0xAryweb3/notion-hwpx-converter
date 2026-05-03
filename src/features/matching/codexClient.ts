import type { DocumentBlock } from "../document/types";
import type { HwpxTemplate } from "../hwpx/template";
import { applyRoleAssignments } from "./assignments";
import type { RoleAssignment } from "./assignments";

const helperUrl = "http://127.0.0.1:8765/match";

interface CodexMatchResponse {
  assignments: RoleAssignment[];
}

export async function matchBlocksWithCodex(template: HwpxTemplate, blocks: DocumentBlock[]): Promise<DocumentBlock[]> {
  const matchableBlocks = blocks.filter((block) => block.role !== "image");
  const response = await fetch(helperUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateSummary: template.styleMap,
      blocks: matchableBlocks.map((block) => ({ id: block.id, role: block.role, text: block.text }))
    })
  });

  if (!response.ok) {
    throw new Error(await readHelperError(response));
  }

  const payload = await readCodexMatchResponse(response);
  return applyRoleAssignments(blocks, payload.assignments);
}

async function readHelperError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isErrorPayload(payload)) {
      return payload.error;
    }
  } catch {
    return `Codex helper failed with status ${response.status}`;
  }

  return `Codex helper failed with status ${response.status}`;
}

async function readCodexMatchResponse(response: Response): Promise<CodexMatchResponse> {
  const payload: unknown = await response.json();

  if (!isCodexMatchResponse(payload)) {
    throw new Error("Codex helper returned an invalid response");
  }

  return payload;
}

function isCodexMatchResponse(value: unknown): value is CodexMatchResponse {
  if (typeof value !== "object" || value === null || !("assignments" in value)) {
    return false;
  }

  const assignments = value.assignments;

  return Array.isArray(assignments) && assignments.every(isRoleAssignment);
}

function isRoleAssignment(value: unknown): value is RoleAssignment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && isDocumentBlockRole(candidate.role);
}

function isDocumentBlockRole(value: unknown): value is RoleAssignment["role"] {
  return (
    value === "title" ||
    value === "noticeNumber" ||
    value === "body" ||
    value === "section" ||
    value === "koreanItem" ||
    value === "dashItem" ||
    value === "tableRow" ||
    value === "image" ||
    value === "note"
  );
}

function isErrorPayload(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}
