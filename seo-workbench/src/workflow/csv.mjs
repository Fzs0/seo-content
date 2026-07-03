import { STANDARD } from "./standard.mjs";
import { makeId, toNumber } from "./utils.mjs";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < String(text || "").length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function getColumn(row, headers, field) {
  const aliases = (STANDARD.csvColumnAliases[field] || []).map((alias) => alias.toLowerCase().trim());

  for (const alias of aliases) {
    const index = headers.findIndex((header) => header === alias);
    if (index !== -1) return row[index] || "";
  }

  for (const alias of aliases) {
    const index = headers.findIndex((header) => header.includes(alias));
    if (index !== -1) return row[index] || "";
  }

  return "";
}

function findHeaderRowIndex(rows) {
  const maxScan = Math.min(rows.length, 30);

  for (let index = 0; index < maxScan; index += 1) {
    const headers = rows[index].map((header) => String(header || "").toLowerCase().trim());
    if (getColumn(rows[index], headers, "keyword")) return index;
  }

  return 0;
}

export function normalizeImportedKeywords(rows) {
  if (!rows.length) return [];

  const headerRowIndex = findHeaderRowIndex(rows);
  const headers = rows[headerRowIndex].map((header) => String(header || "").toLowerCase().trim());

  return rows
    .slice(headerRowIndex + 1)
    .map((row, index) => {
      const keyword = getColumn(row, headers, "keyword").trim();
      if (!keyword) return null;

      return {
        id: makeId(keyword, index),
        keyword,
        database: getColumn(row, headers, "database"),
        topicCluster: getColumn(row, headers, "topic") || getColumn(row, headers, "pageGroup") || keyword,
        seedKeyword: getColumn(row, headers, "seedKeyword"),
        pageGroup: getColumn(row, headers, "pageGroup"),
        sourcePageType: getColumn(row, headers, "sourcePageType"),
        serpFeatures: getColumn(row, headers, "serpFeatures"),
        volume: toNumber(getColumn(row, headers, "volume")),
        kd: toNumber(getColumn(row, headers, "difficulty")),
        intent: getColumn(row, headers, "intent") || "unknown",
        url: getColumn(row, headers, "url"),
      };
    })
    .filter(Boolean);
}

export function importCsvKeywords(csvText) {
  return normalizeImportedKeywords(parseCsv(csvText));
}
