import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const storeUrl = new URL("../../config/serpapi.local.json", import.meta.url);
const storePath = fileURLToPath(storeUrl);

const DEFAULT_STORE = {
  apiKey: "",
  defaultEngine: "google",
  updatedAt: "",
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

function envApiKey() {
  return process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY || "";
}

export function readSerpApiConfig({ includeSecrets = false } = {}) {
  const store = readStoreRaw();
  const localKey = String(store.apiKey || "").trim();
  const envKey = String(envApiKey() || "").trim();
  const effectiveKey = localKey || envKey;
  return {
    defaultEngine: store.defaultEngine || "google",
    enabled: Boolean(effectiveKey),
    source: localKey ? "local" : envKey ? "env" : "",
    keyPreview: previewSecret(effectiveKey),
    updatedAt: store.updatedAt || "",
    ...(includeSecrets ? { apiKey: effectiveKey, localApiKey: localKey } : {}),
  };
}

export function saveSerpApiConfig(config = {}) {
  const current = readSerpApiConfig({ includeSecrets: true });
  const apiKey = String(config.apiKey || "").trim();
  const next = {
    apiKey: config.clearApiKey ? "" : apiKey || current.localApiKey || "",
    defaultEngine: String(config.defaultEngine || current.defaultEngine || "google").trim() || "google",
    updatedAt: new Date().toISOString(),
  };
  writeStoreRaw(next);
  return readSerpApiConfig();
}
