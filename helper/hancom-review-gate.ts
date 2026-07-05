import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateHancomReviewMarkdown } from "../src/features/hwpx/qaRun";

async function main(): Promise<void> {
  const reviewPath = process.argv[2];

  if (reviewPath === undefined) {
    throw new Error("Usage: vite-node helper/hancom-review-gate.ts <hancom-review.md>");
  }

  const markdown = await readFile(reviewPath, "utf8");
  const result = validateHancomReviewMarkdown(markdown);

  console.log(JSON.stringify({
    reviewPath,
    ...result
  }, null, 2));

  if (!result.passed) {
    process.exitCode = 1;
  }
}

function isCliEntrypoint(): boolean {
  if (process.env.VITEST === "true") {
    return false;
  }

  const directEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
  const viteNodeEntry = process.argv.some((arg) => arg.endsWith("helper/hancom-review-gate.ts"));

  return directEntry || viteNodeEntry || import.meta.url.endsWith("/helper/hancom-review-gate.ts");
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
