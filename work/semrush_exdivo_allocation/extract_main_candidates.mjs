import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..", "..");
const workbookPath =
  process.argv[2]?.trim() ||
  process.env.SEMRUSH_ALLOCATION_XLSX ||
  path.join(projectRoot, "outputs", "semrush_exdivo_allocation", "exdivo_keyword_allocation_result.xlsx");

const blob = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(blob);
const sheet = workbook.worksheets.getItem("关键词分站结果");
const values = sheet.getUsedRange(true).values;
const headers = values[0].map((v) => String(v ?? "").trim());
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

const rows = values.slice(1).map((row) => {
  const item = {};
  for (const [name, i] of Object.entries(idx)) item[name] = row[i];
  return item;
});

const candidates = rows
  .filter((row) => String(row["最终站点"] ?? row["推荐站点"]) === "主站")
  .filter((row) => String(row["优先级(公式)"] ?? "").startsWith("P0") || String(row["优先级(公式)"] ?? "").startsWith("P1"))
  .filter((row) => !String(row["合规/竞争风险"] ?? "").includes("高风险"))
  .sort((a, b) => Number(b["总分(公式)"] ?? 0) - Number(a["总分(公式)"] ?? 0) || Number(b.volume ?? 0) - Number(a.volume ?? 0))
  .slice(0, 40);

console.log(
  JSON.stringify(
    candidates.map((row) => ({
      keyword: row["关键词"],
      volume: row["volume"],
      kd: row["keyword difficulty"],
      intent: row["Semrush intent"],
      cluster: row["主题簇"],
      role: row["关键词角色"],
      pageType: row["推荐页面/文章类型"],
      score: row["总分(公式)"],
      priority: row["优先级(公式)"],
      target: row["主站承接页/内链目标"],
      risk: row["合规/竞争风险"],
    })),
    null,
    2,
  ),
);
