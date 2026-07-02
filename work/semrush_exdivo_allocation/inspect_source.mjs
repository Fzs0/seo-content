import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath =
  process.argv[2]?.trim() ||
  process.env.SEMRUSH_SOURCE_XLSX ||
  path.join(currentDir, "source.xlsx");

await fs.access(sourcePath).catch(() => {
  throw new Error(
    `找不到源 Excel：${sourcePath}。请运行 node work/semrush_exdivo_allocation/inspect_source.mjs <你的xlsx路径>，或设置 SEMRUSH_SOURCE_XLSX。`,
  );
});

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 18,
  tableMaxCellChars: 80,
});

console.log(summary.ndjson);
