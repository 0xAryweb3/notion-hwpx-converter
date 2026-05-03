import { describe, expect, it } from "vitest";
import { publicNotionBlocksToDocumentBlocks } from "../features/notion-link/publicBlocks";

describe("generate-local source normalization", () => {
  it("preserves public Notion image blocks between text blocks", () => {
    const blocks = publicNotionBlocksToDocumentBlocks([
      { kind: "text", text: "BRIEF 9" },
      {
        kind: "image",
        text: "차트",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "https://example.com/chart.png",
          altText: "차트",
          bytesBase64: "iVBORw=="
        }
      },
      { kind: "text", text: "이미지 뒤 본문" }
    ]);

    expect(blocks).toEqual([
      { id: "block-1", role: "title", text: "BRIEF 9" },
      {
        id: "block-2",
        role: "image",
        text: "차트",
        asset: {
          id: "asset-1",
          kind: "image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "https://example.com/chart.png",
          altText: "차트",
          bytes: new Uint8Array([137, 80, 78, 71])
        }
      },
      { id: "block-3", role: "body", text: "이미지 뒤 본문" }
    ]);
  });
});
