import type { DocumentBlock } from "../document/types";
import {
  publicNotionBlocksToDocumentBlocks,
  type PublicNotionBlock,
  type PublicNotionImageAsset
} from "./publicBlocks";

export interface PublicNotionText {
  title: string;
  text: string;
  lineCount: number;
  blocks?: DocumentBlock[];
}

const helperUrl = "http://127.0.0.1:8765/notion/public";

export async function fetchPublicNotionText(url: string): Promise<PublicNotionText> {
  let response: Response;

  try {
    response = await fetch(helperUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
  } catch {
    throw new Error("Notion helper에 연결할 수 없습니다. helper 실행: npm run helper:codex");
  }

  if (!response.ok) {
    throw new Error(await readHelperError(response));
  }

  const payload: unknown = await response.json();

  if (!isPublicNotionText(payload)) {
    throw new Error("Notion helper returned an invalid response");
  }

  return normalizePublicNotionPayload(payload);
}

async function readHelperError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();

    if (isErrorPayload(payload)) {
      return payload.error;
    }
  } catch {
    return `Notion helper failed with status ${response.status}`;
  }

  return `Notion helper failed with status ${response.status}`;
}

function isPublicNotionText(value: unknown): value is PublicNotionText {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.title === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.lineCount === "number" &&
    (candidate.blocks === undefined || isHelperPublicNotionBlocks(candidate.blocks))
  );
}

function isErrorPayload(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}

function normalizePublicNotionPayload(payload: PublicNotionText): PublicNotionText {
  const helperBlocks = payload.blocks as unknown;

  if (!isHelperPublicNotionBlocks(helperBlocks)) {
    return payload;
  }

  return {
    ...payload,
    blocks: publicNotionBlocksToDocumentBlocks(helperBlocks)
  };
}

function isHelperPublicNotionBlocks(value: unknown): value is PublicNotionBlock[] {
  return Array.isArray(value) && value.every(isHelperPublicNotionBlock);
}

function isHelperPublicNotionBlock(value: unknown): value is PublicNotionBlock {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.kind === "text") {
    return typeof candidate.text === "string";
  }

  return candidate.kind === "image" && typeof candidate.text === "string" && isHelperPublicNotionImageAsset(candidate.asset);
}

function isHelperPublicNotionImageAsset(value: unknown): value is PublicNotionImageAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.kind === "image" &&
    typeof candidate.id === "string" &&
    typeof candidate.fileName === "string" &&
    typeof candidate.mimeType === "string" &&
    (candidate.url === undefined || typeof candidate.url === "string") &&
    (candidate.altText === undefined || typeof candidate.altText === "string") &&
    (candidate.bytesBase64 === undefined || typeof candidate.bytesBase64 === "string")
  );
}
