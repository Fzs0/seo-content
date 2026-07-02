import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/汪海枭/Documents/Codex/2026-06-27/seo/outputs/article_keyword_framework/google_seo_article_keyword_standard_framework_linked.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 10000,
  tableMaxRows: 6,
  tableMaxCols: 10,
  tableMaxCellChars: 100,
});

await fs.writeFile(
  "C:/Users/汪海枭/Documents/Codex/2026-06-27/seo/outputs/article_keyword_framework_enhanced/original_workbook_inspect.ndjson",
  summary.ndjson,
  "utf8",
);

console.log(summary.ndjson);
