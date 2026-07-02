import { inflateRawSync } from "node:zlib";

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function decodeXml(value = "") {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) return offset;
  }
  throw new Error("无法识别 xlsx 文件结构。");
}

function unzipXlsx(buffer) {
  const files = new Map();
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = readUInt16(buffer, eocd + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocd + 16);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) break;

    const method = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const fileNameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    const localNameLength = readUInt16(buffer, localHeaderOffset + 26);
    const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`暂不支持这个 xlsx 压缩方式：${method}`);
    }

    files.set(name, data.toString("utf8"));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}

function parseSharedStrings(xml = "") {
  const strings = [];
  const siMatches = xml.matchAll(/<si[\s\S]*?<\/si>/g);

  for (const match of siMatches) {
    const parts = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    strings.push(parts.join(""));
  }

  return strings;
}

function columnIndex(cellRef = "") {
  const letters = String(cellRef).match(/[A-Z]+/i)?.[0] || "A";
  let index = 0;

  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index - 1;
}

function cellValue(cellXml, sharedStrings) {
  const type = cellXml.match(/<c[^>]*\st="([^"]+)"/)?.[1] || "";

  if (type === "inlineStr") {
    const text = [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
    return text;
  }

  const rawValue = decodeXml(cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "");
  if (type === "s") return sharedStrings[Number(rawValue)] || "";
  return rawValue;
}

function worksheetRows(xml = "", sharedStrings = []) {
  const rows = [];
  const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);

  for (const rowMatch of rowMatches) {
    const row = [];
    const cellMatches = rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g);

    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/\sr="([^"]+)"/)?.[1] || "";
      row[columnIndex(ref)] = cellValue(`<c${attrs}>${cellMatch[2]}</c>`, sharedStrings);
    }

    rows.push(row.map((cell) => cell ?? ""));
  }

  return rows.filter((row) => row.some((cell) => String(cell).trim()));
}

export function xlsxBufferToRows(buffer) {
  const files = unzipXlsx(buffer);
  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml") || "");
  const worksheetNames = [...files.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => {
      const aIndex = Number(a.match(/sheet(\d+)\.xml$/)?.[1] || 0);
      const bIndex = Number(b.match(/sheet(\d+)\.xml$/)?.[1] || 0);
      return aIndex - bIndex;
    });

  if (!worksheetNames.length) {
    throw new Error("没有在 xlsx 中找到工作表。");
  }

  function headerInfo(rows) {
    const headerWindow = rows.slice(0, 30);
    let headerRowIndex = -1;
    let headers = [];

    for (let index = 0; index < headerWindow.length; index += 1) {
      const normalized = headerWindow[index].map((cell) => String(cell || "").toLowerCase().trim());
      if (normalized.some((cell) => cell === "keyword")) {
        headerRowIndex = index;
        headers = normalized;
        break;
      }
    }

    if (headerRowIndex === -1) {
      for (let index = 0; index < headerWindow.length; index += 1) {
        const normalized = headerWindow[index].map((cell) => String(cell || "").toLowerCase().trim());
        if (normalized.some((cell) => cell.includes("keyword"))) {
          headerRowIndex = index;
          headers = normalized;
          break;
        }
      }
    }

    const keywordIndex = headers.findIndex((header) => header === "keyword" || header.includes("keyword"));
    const keywordCount =
      keywordIndex === -1
        ? 0
        : rows.slice(headerRowIndex + 1).filter((row) => String(row[keywordIndex] || "").trim()).length;
    const hasKeywordHeader = headers.some((header) => header === "keyword");
    const hasLooseKeywordHeader = headers.some((header) => header.includes("keyword"));
    const qualityHeaders = ["database", "volume", "keyword difficulty", "intent", "serp features", "content reference 1"];
    const qualityScore = qualityHeaders.filter((header) => headers.includes(header)).length;
    const pivotPenalty = rows
      .slice(0, 5)
      .some((row) => row.some((cell) => String(cell || "").toLowerCase().includes("pivot table")))
      ? 50000
      : 0;

    return {
      headerRowIndex,
      headers,
      hasKeywordHeader,
      hasLooseKeywordHeader,
      keywordCount,
      qualityScore,
      pivotPenalty,
    };
  }

  const candidates = worksheetNames.map((name) => {
    const rows = worksheetRows(files.get(name), sharedStrings);
    const info = headerInfo(rows);

    return {
      name,
      rows,
      score:
        (info.hasKeywordHeader ? 100000 : 0) +
        (info.hasLooseKeywordHeader ? 10000 : 0) +
        (info.headerRowIndex === 0 ? 50000 : 0) +
        info.keywordCount * 10 +
        info.qualityScore * 5000 -
        info.pivotPenalty +
        rows.length,
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.rows || [];
}
