import { normalizeImportedKeywords, parseCsv } from "./csv.mjs";
import { xlsxBufferToRows } from "./xlsx.mjs";

function bufferToText(buffer) {
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function tsvToCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .split("\t")
        .map((cell) => {
          const value = cell.replace(/"/g, '""');
          return /[",\n]/.test(value) ? `"${value}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export function importKeywordsFromFile({ filename = "", contentBase64 = "", contentText = "" } = {}) {
  const lowerName = filename.toLowerCase();
  const buffer = contentBase64 ? Buffer.from(contentBase64, "base64") : Buffer.from(contentText || "", "utf8");

  if (lowerName.endsWith(".xlsx")) {
    return normalizeImportedKeywords(xlsxBufferToRows(buffer));
  }

  if (lowerName.endsWith(".tsv")) {
    return normalizeImportedKeywords(parseCsv(tsvToCsv(bufferToText(buffer))));
  }

  return normalizeImportedKeywords(parseCsv(bufferToText(buffer)));
}
