import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicNotionText } from "../features/notion-link/client";

describe("fetchPublicNotionText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads public Notion text through the localhost helper", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ title: "BRIEF 9", text: "BRIEF 9\n- 센터 소식", lineCount: 2 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicNotionText("https://example.notion.site/BRIEF-34f1e6afd42e8029a30bd4cb4b0523d6")).resolves.toEqual({
      title: "BRIEF 9",
      text: "BRIEF 9\n- 센터 소식",
      lineCount: 2
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8765/notion/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.notion.site/BRIEF-34f1e6afd42e8029a30bd4cb4b0523d6"
      })
    });
  });

  it("decodes structured public Notion image blocks from the helper", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "BRIEF 9",
          text: "BRIEF 9\n이미지 뒤 본문",
          lineCount: 2,
          blocks: [
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
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicNotionText("https://example.notion.site/page")).resolves.toEqual({
      title: "BRIEF 9",
      text: "BRIEF 9\n이미지 뒤 본문",
      lineCount: 2,
      blocks: [
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
      ]
    });
  });

  it("surfaces helper errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "Public Notion page could not be read" }), { status: 500 })
      )
    );

    await expect(fetchPublicNotionText("https://example.notion.site/bad")).rejects.toThrow(
      "Public Notion page could not be read"
    );
  });
});
