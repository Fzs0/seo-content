import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const storeUrl = new URL("../../config/product-assets.local.json", import.meta.url);
const storePath = fileURLToPath(storeUrl);

const DEFAULT_STORE = {
  api: {
    endpoint: "",
    method: "GET",
    headersText: "",
  },
  products: [],
  updatedAt: "",
  extractedAt: "",
};

function readStoreRaw() {
  if (!existsSync(storePath)) return { ...DEFAULT_STORE };
  return {
    ...DEFAULT_STORE,
    ...JSON.parse(readFileSync(storePath, "utf8")),
  };
}

function writeStoreRaw(store) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function previewSecret(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.length <= 8) return "****";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function sanitizeHeadersText(headersText = "") {
  return String(headersText || "")
    .split(/\r?\n/)
    .map((line) => {
      const [name, ...rest] = line.split(":");
      if (!rest.length) return line;
      const key = String(name || "").trim();
      const value = rest.join(":").trim();
      if (/authorization|token|key|secret|cookie/i.test(key)) return `${key}: ${previewSecret(value)}`;
      return `${key}: ${value}`;
    })
    .join("\n");
}

export function readProductAssets({ includeSecrets = false } = {}) {
  const store = readStoreRaw();
  if (includeSecrets) return store;
  return {
    ...store,
    api: {
      ...store.api,
      headersText: "",
      headersSet: Boolean(String(store.api?.headersText || "").trim()),
      headersPreview: sanitizeHeadersText(store.api?.headersText || ""),
    },
  };
}

export function saveProductApiConfig(api = {}) {
  const store = readStoreRaw();
  const incomingHeaders = String(api.headersText || "");
  const next = {
    ...store,
    api: {
      endpoint: String(api.endpoint || "").trim(),
      method: String(api.method || "GET").toUpperCase(),
      headersText: incomingHeaders.trim() ? incomingHeaders : store.api?.headersText || "",
    },
    updatedAt: new Date().toISOString(),
  };

  if (api.clearHeaders) next.api.headersText = "";
  writeStoreRaw(next);
  return readProductAssets();
}

export function saveExtractedProducts(products = [], meta = {}) {
  const store = readStoreRaw();
  const next = {
    ...store,
    products,
    sourceMeta: meta,
    extractedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeStoreRaw(next);
  return readProductAssets();
}
