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

const brandish = [
  "foger",
  "fogger",
  "kang",
  "airfuze",
  "swft",
  "swift",
  "logic",
  "spaceman",
  "miami mint",
  "rl vapes",
  "puff bar",
  "elf bar",
  "geek bar",
  "lost mary",
  "vuse",
  "juul",
];

const risky = [
  "teen",
  "kid",
  "school",
  "thc",
  "weed",
  "cannabis",
  "cbd",
  "quit smoking",
  "pregnant",
  "cancer",
  "lungs",
  "healthy",
  "safe",
];

const articleSignals = [
  "what",
  "how",
  "why",
  "guide",
  "difference",
  "different",
  "types",
  "last",
  "long",
  "charge",
  "refill",
  "recharge",
  "nicotine free",
  "zero nicotine",
  "vs",
  "versus",
  "starter",
  "beginner",
  "flavors",
  "flavoured",
  "flavored",
];

const productFitSignals = [
  "disposable",
  "vape",
  "vapes",
  "e cigarette",
  "e-cigarette",
  "ecig",
  "pod",
  "pods",
  "nicotine",
  "flavor",
  "flavors",
  "rechargeable",
  "refillable",
  "starter kit",
  "charger",
];

const transactionSignals = ["buy", "shop", "sale", "price", "cheap", "coupon", "discount", "near me", "for sale"];

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function score(row) {
  const keyword = String(row["关键词"] ?? "").toLowerCase();
  const intent = String(row["Semrush intent"] ?? "").toLowerCase();
  const volume = Number(row.volume ?? 0);
  const kd = Number(row["keyword difficulty"] ?? 0);
  const risk = String(row["合规/竞争风险"] ?? "");
  const finalSite = String(row["最终站点"] ?? row["推荐站点"] ?? "");

  if (!hasAny(keyword, productFitSignals)) return -999;
  if (hasAny(keyword, risky) || risk.includes("高风险")) return -999;
  if (hasAny(keyword, brandish)) return -80;
  if (hasAny(keyword, transactionSignals)) return -50;

  let s = 0;
  if (intent.includes("informational")) s += 25;
  if (intent.includes("commercial")) s += 12;
  if (finalSite === "主站") s += 10;
  if (hasAny(keyword, articleSignals)) s += 28;
  if (keyword.includes("disposable")) s += 15;
  if (keyword.includes("nicotine free") || keyword.includes("zero nicotine")) s += 12;
  if (keyword.includes("flavor") || keyword.includes("flavors")) s += 10;
  if (keyword.includes("charger") || keyword.includes("refill") || keyword.includes("recharge")) s += 8;
  if (volume >= 10000) s += 18;
  else if (volume >= 3000) s += 15;
  else if (volume >= 1000) s += 12;
  else if (volume >= 300) s += 8;
  else s += 3;
  if (kd <= 20) s += 12;
  else if (kd <= 35) s += 8;
  else if (kd <= 50) s += 4;
  else s -= 8;
  if (String(row["关键词角色"] ?? "").includes("交易")) s -= 15;
  if (String(row["推荐页面/文章类型"] ?? "").includes("集合页")) s -= 5;
  return s;
}

const candidates = rows
  .map((row) => ({ row, score: score(row) }))
  .filter((item) => item.score > 35)
  .sort((a, b) => b.score - a.score || Number(b.row.volume ?? 0) - Number(a.row.volume ?? 0))
  .slice(0, 25)
  .map(({ row, score }) => ({
    score,
    keyword: row["关键词"],
    volume: row.volume,
    kd: row["keyword difficulty"],
    semrushIntent: row["Semrush intent"],
    currentFinalSite: row["最终站点"] || row["推荐站点"],
    currentPageType: row["推荐页面/文章类型"],
    priority: row["优先级(公式)"],
    mainTarget: row["主站承接页/内链目标"],
    risk: row["合规/竞争风险"],
    note: row["意图校验备注"],
  }));

console.log(JSON.stringify(candidates, null, 2));
