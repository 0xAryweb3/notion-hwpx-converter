#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.CODEX_HWPX_HELPER_PORT ?? "8765", 10);
const timeoutMs = Number.parseInt(process.env.CODEX_HWPX_HELPER_TIMEOUT_MS ?? "120000", 10);

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assignments"],
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "role", "reason"],
        properties: {
          id: { type: "string" },
          role: {
            type: "string",
            enum: ["title", "noticeNumber", "body", "section", "koreanItem", "dashItem", "note"]
          },
          reason: { type: "string" }
        }
      }
    }
  }
};

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.url !== "/match" || request.method !== "POST") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const payload = JSON.parse(await readRequestBody(request));
    const result = await runCodexMatcher(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, { error: readErrorMessage(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Codex HWPX helper listening on http://${host}:${port}`);
});

async function runCodexMatcher(payload) {
  const dir = await mkdtemp(join(tmpdir(), "codex-hwpx-"));
  const schemaPath = join(dir, "schema.json");
  const outputPath = join(dir, "output.json");

  try {
    await writeFile(schemaPath, JSON.stringify(responseSchema), "utf8");
    const prompt = buildPrompt(payload);
    await runCommand(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--ask-for-approval",
        "never",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-"
      ],
      prompt
    );

    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function buildPrompt(payload) {
  return `You are matching Korean HWPX document blocks to paragraph style roles.

Return JSON only through the provided schema.

Rules:
- Keep each id exactly as provided.
- Pick exactly one role per block.
- Use section for numbered outline headings like "1. 입찰내용", not dates.
- Use koreanItem for "가.", "나.", "다." style outline items.
- Use dashItem for hyphen bullet details.
- Use note for "※" notes.
- Use title for the main document title, often after a notice number.
- Use noticeNumber for lines like "환경부공고 제2025-436호".
- Use body when no specific role fits.

Available roles:
title, noticeNumber, body, section, koreanItem, dashItem, note

Template style summary:
${JSON.stringify(payload.templateSummary ?? {}, null, 2)}

Blocks to classify:
${JSON.stringify(payload.blocks ?? [], null, 2)}
`;
}

function runCommand(command, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex matcher timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`codex exec failed with code ${code}\n${stderr || stdout}`));
    });

    child.stdin.end(stdin);
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function readErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error";
}
