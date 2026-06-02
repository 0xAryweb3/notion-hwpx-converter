import { normalizeLinesToBlocks } from "../document/detect";
import type { DocumentBlock, DocumentImageAsset } from "../document/types";
import { cleanNotionLine } from "../notion-text/clean";

export type PublicNotionBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; text: string; asset: PublicNotionImageAsset };

export interface PublicNotionImageAsset {
  id: string;
  kind: "image";
  fileName: string;
  mimeType: string;
  url?: string;
  altText?: string;
  bytesBase64?: string;
}

export function publicNotionBlocksToDocumentBlocks(blocks: PublicNotionBlock[]): DocumentBlock[] {
  const textBlocks = normalizeLinesToBlocks(blocks
    .filter((block): block is { kind: "text"; text: string } => block.kind === "text")
    .map((block) => cleanNotionLine(block.text)));
  const documentBlocks: DocumentBlock[] = [];
  let textBlockIndex = 0;

  for (const block of blocks) {
    if (block.kind === "text") {
      const textBlock = textBlocks[textBlockIndex];
      textBlockIndex += 1;

      if (textBlock !== undefined) {
        documentBlocks.push({ ...textBlock, id: `block-${documentBlocks.length + 1}` });
      }

      continue;
    }

    documentBlocks.push({
      id: `block-${documentBlocks.length + 1}`,
      role: "image",
      text: cleanNotionLine(block.text),
      asset: decodePublicNotionImageAsset(block.asset)
    });
  }

  return documentBlocks;
}

function decodePublicNotionImageAsset(asset: PublicNotionImageAsset): DocumentImageAsset {
  return {
    id: asset.id,
    kind: "image",
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    url: asset.url,
    altText: asset.altText,
    bytes: asset.bytesBase64 === undefined ? undefined : base64ToBytes(asset.bytesBase64)
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
