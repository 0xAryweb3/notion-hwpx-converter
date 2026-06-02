import { describe, expect, it } from "vitest";
import { applyRoleAssignments } from "../features/matching/assignments";
import type { DocumentBlock } from "../features/document/types";

describe("applyRoleAssignments", () => {
  it("updates only blocks with matching assignment ids", () => {
    const blocks: DocumentBlock[] = [
      { id: "block-1", role: "body", text: "환경부공고 제2025-436호" },
      { id: "block-2", role: "body", text: "1. 입찰내용" }
    ];

    expect(applyRoleAssignments(blocks, [{ id: "block-2", role: "section" }])).toEqual([
      { id: "block-1", role: "body", text: "환경부공고 제2025-436호" },
      { id: "block-2", role: "section", text: "1. 입찰내용" }
    ]);
  });
});
