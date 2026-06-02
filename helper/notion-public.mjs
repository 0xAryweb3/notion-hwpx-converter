const notionIdPattern = /([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function extractNotionPageId(input) {
  const match = String(input).match(notionIdPattern);

  if (match === null) {
    throw new Error("Notion page id not found in URL");
  }

  return hyphenatePageId(match[1].toLowerCase().replaceAll("-", ""));
}

export async function fetchPublicNotionPageText(pageUrl, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available in this Node runtime");
  }

  const url = new URL(pageUrl);
  const pageId = extractNotionPageId(pageUrl);
  const response = await fetchImpl(`${url.origin}/api/v3/loadPageChunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false
    })
  });

  if (!response.ok) {
    throw new Error(`Public Notion page request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const recordMap = payload.recordMap;

  if (recordMap === undefined || recordMap.block === undefined) {
    throw new Error("Public Notion page did not return readable blocks");
  }

  const parsed = recordMapToPlainText(recordMap, pageId);
  const blocks = await hydratePublicImageBlocks(parsed.blocks, fetchImpl);

  return {
    title: parsed.title,
    text: parsed.lines.join("\n"),
    lineCount: parsed.lines.length,
    blocks
  };
}

export function recordMapToPlainText(recordMap, pageId) {
  const blocks = recordMap?.block ?? {};
  const root = readBlockValue(blocks[pageId]);

  if (root === null) {
    throw new Error("Public Notion page root block was not found");
  }

  const title = cleanNotionText(readBlockTitle(root));
  const lines = title.length > 0 ? [title] : [];
  const outputBlocks = title.length > 0 ? [{ kind: "text", text: title }] : [];
  const visited = new Set([pageId]);
  const state = { assetIndex: 1 };

  collectChildLines(root.content ?? [], blocks, visited, lines, outputBlocks, state);

  return { title, lines, blocks: outputBlocks };
}

export function cleanNotionText(value) {
  return String(value)
    .replace(/^\s*#{1,6}\s+/u, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+(?:\s+"[^"]*")?\)/gu, "$1")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[*_`~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function collectChildLines(ids, blocks, visited, lines, outputBlocks, state) {
  let numberedIndex = 0;

  for (const id of ids) {
    if (visited.has(id)) {
      continue;
    }

    visited.add(id);
    const block = readBlockValue(blocks[id]);

    if (block === null) {
      continue;
    }

    if (block.type === "numbered_list") {
      numberedIndex += 1;
    }

    if (block.type === "image") {
      const imageBlock = formatImageBlock(block, state);

      if (imageBlock !== null) {
        outputBlocks.push(imageBlock);
      }

      continue;
    }

    if (isTableContainerBlock(block)) {
      collectTableRows(block.content ?? [], blocks, visited, lines, outputBlocks, state);
      continue;
    }

    const line = formatBlockLine(block, numberedIndex);

    if (line.length > 0) {
      lines.push(line);
      outputBlocks.push({ kind: "text", text: line });
    }

    collectChildLines(block.content ?? [], blocks, visited, lines, outputBlocks, state);
  }
}

function formatImageBlock(block, state) {
  const src = readBlockImageSource(block);

  if (src.length === 0) {
    return null;
  }

  const altText = cleanNotionText(readBlockTitle(block));
  const assetId = `asset-${state.assetIndex}`;
  state.assetIndex += 1;

  return {
    kind: "image",
    text: altText,
    asset: {
      id: assetId,
      kind: "image",
      fileName: fileNameFromSource(src),
      mimeType: inferMimeType(src),
      url: src,
      altText
    }
  };
}

function formatBlockLine(block, numberedIndex) {
  if (block.type === "table_row") {
    return readTableRowCells(block).join("\t");
  }

  const text = cleanNotionText(readBlockTitle(block));

  if (text.length === 0) {
    return "";
  }

  if (block.type === "numbered_list") {
    return `${numberedIndex}. ${text}`;
  }

  if (block.type === "bulleted_list") {
    return startsWithListMarker(text) ? text : `- ${text}`;
  }

  return text;
}

function collectTableRows(ids, blocks, visited, lines, outputBlocks, state) {
  for (const id of ids) {
    if (visited.has(id)) {
      continue;
    }

    visited.add(id);
    const block = readBlockValue(blocks[id]);

    if (block === null) {
      continue;
    }

    if (block.type === "table_row") {
      const cells = readTableRowCells(block);

      if (cells.length > 0) {
        const line = cells.join("\t");

        lines.push(line);
        outputBlocks.push({ kind: "text", text: line });
      }
      continue;
    }

    collectChildLines([id], blocks, visited, lines, outputBlocks, state);
  }
}

function isTableContainerBlock(block) {
  return block.type === "table" || block.type === "simple_table";
}

function readTableRowCells(block) {
  const properties = block.properties;

  if (properties === undefined || properties === null || typeof properties !== "object") {
    return [];
  }

  return Object.entries(properties)
    .sort(([left], [right]) => comparePropertyKeys(left, right))
    .map(([, richText]) => cleanNotionText(readRichText(richText)))
    .filter((cell) => cell.length > 0);
}

function comparePropertyKeys(left, right) {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function readBlockValue(record) {
  if (record === undefined || record === null || typeof record !== "object") {
    return null;
  }

  const outerValue = record.value;

  if (outerValue === undefined || outerValue === null || typeof outerValue !== "object") {
    return null;
  }

  if (outerValue.value !== undefined && outerValue.value !== null && typeof outerValue.value === "object") {
    return outerValue.value;
  }

  return outerValue;
}

function readBlockTitle(block) {
  return readRichText(block.properties?.title);
}

function readBlockImageSource(block) {
  if (typeof block.format?.display_source === "string") {
    return block.format.display_source;
  }

  const source = readRichText(block.properties?.source);

  if (source.length > 0) {
    return source;
  }

  return "";
}

function readRichText(value) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")).join("");
}

function startsWithListMarker(text) {
  return /^\s*(?:[-–]|\d+\.|[가-힣]\.)\s+/u.test(text);
}

function hyphenatePageId(value) {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function hydratePublicImageBlocks(blocks, fetchImpl) {
  const hydrated = [];

  for (const block of blocks) {
    if (block.kind !== "image" || typeof block.asset?.url !== "string") {
      hydrated.push(block);
      continue;
    }

    hydrated.push({
      ...block,
      asset: await hydratePublicImageAsset(block.asset, fetchImpl)
    });
  }

  return hydrated;
}

async function hydratePublicImageAsset(asset, fetchImpl) {
  try {
    const response = await fetchImpl(asset.url);

    if (!response.ok) {
      return asset;
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? asset.mimeType;

    if (!contentType.startsWith("image/")) {
      return asset;
    }

    return {
      ...asset,
      mimeType: contentType,
      bytesBase64: Buffer.from(await response.arrayBuffer()).toString("base64")
    };
  } catch {
    return asset;
  }
}

function fileNameFromSource(src) {
  const cleanSrc = stripUrlDecorations(src);
  const name = decodeURIComponentSafe(cleanSrc.split("/").filter(Boolean).pop() ?? "image");

  return name.length === 0 ? "image" : name;
}

function stripUrlDecorations(src) {
  return src.split("#")[0]?.split("?")[0] ?? "";
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inferMimeType(src) {
  const extension = fileNameFromSource(src).split(".").pop()?.toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "png":
    default:
      return "image/png";
  }
}
