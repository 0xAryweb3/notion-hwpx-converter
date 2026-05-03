import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { analyzeHwpxVisualDogfood, renderVisualDogfoodSvg } from "../src/features/hwpx/visualDogfood";

interface CliOptions {
  inputPath: string;
  svgPath: string;
  reportPath: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const files = unzipSync(await readFile(options.inputPath));
  const headerXml = strFromU8(files["Contents/header.xml"]);
  const sectionXml = strFromU8(files["Contents/section0.xml"]);
  const report = analyzeHwpxVisualDogfood(headerXml, sectionXml);
  const svg = renderVisualDogfoodSvg(report);

  await mkdir(dirname(options.svgPath), { recursive: true });
  await mkdir(dirname(options.reportPath), { recursive: true });
  await writeFile(options.svgPath, `${svg}\n`);
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    inputPath: options.inputPath,
    svgPath: options.svgPath,
    reportPath: options.reportPath,
    issues: report.issues.length,
    errors: report.issues.filter((issue) => issue.severity === "error").length,
    warnings: report.issues.filter((issue) => issue.severity === "warning").length,
    summary: report.summary
  }, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Usage: vite-node helper/visual-dogfood.ts --input <file.hwpx> --svg <out.svg> --report <out.json>");
    }

    values.set(key.slice(2), value);
  }

  const inputPath = values.get("input");
  const svgPath = values.get("svg");
  const reportPath = values.get("report") ?? svgPath?.replace(/\.svg$/u, ".json");

  if (inputPath === undefined || svgPath === undefined || reportPath === undefined) {
    throw new Error("--input and --svg are required.");
  }

  return { inputPath, svgPath, reportPath };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
