import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../config/main-sites.local.json", import.meta.url);
const configPath = fileURLToPath(configUrl);

function readConfig() {
  if (!existsSync(configPath)) return { sites: [] };
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function writeConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function normalizeApiBaseUrl(value = "") {
  let raw = String(value || "").trim();
  if (!raw) return "https://openapi.oemapps.com";
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/g, "").replace(/\/posts$/i, "");
    return url.toString().replace(/\/+$/g, "");
  } catch {
    return raw.replace(/\/+$/g, "").replace(/\/posts$/i, "");
  }
}

function sanitizeSite(site) {
  const tokenA = site.tokenA || "";
  const tokenB = site.tokenB || "";
  return {
    ...site,
    tokenA: "",
    tokenB: "",
    tokenASet: Boolean(tokenA),
    tokenBSet: Boolean(tokenB),
    tokenAPreview: tokenA ? `${tokenA.slice(0, 4)}...${tokenA.slice(-4)}` : "",
    tokenBPreview: tokenB ? `${tokenB.slice(0, 4)}...${tokenB.slice(-4)}` : "",
  };
}

function cleanIncomingSite(incoming = {}, existing = {}) {
  const next = {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id || randomUUID(),
    name: String(incoming.name || existing.name || incoming.apiBaseUrl || "Main Site").trim(),
    apiBaseUrl: normalizeApiBaseUrl(incoming.apiBaseUrl || existing.apiBaseUrl || "https://openapi.oemapps.com"),
    defaultAuthor: String(incoming.defaultAuthor ?? existing.defaultAuthor ?? "Admin").trim() || "Admin",
    defaultStatus: Number(incoming.defaultStatus ?? existing.defaultStatus ?? 0),
    defaultSrcPrefix: String(incoming.defaultSrcPrefix ?? existing.defaultSrcPrefix ?? "/blogs/").trim() || "/blogs/",
    defaultImageId: String(incoming.defaultImageId ?? existing.defaultImageId ?? "").trim(),
    collectContentImages: Number(incoming.collectContentImages ?? existing.collectContentImages ?? 0),
    defaultRelatedProductIds: String(incoming.defaultRelatedProductIds ?? existing.defaultRelatedProductIds ?? "").trim(),
    targetMarket: String(incoming.targetMarket ?? existing.targetMarket ?? "").trim(),
    targetLanguage: String(incoming.targetLanguage ?? existing.targetLanguage ?? "").trim(),
    contentRole: String(incoming.contentRole ?? existing.contentRole ?? "主站-博客").trim(),
    contentScope: String(incoming.contentScope ?? existing.contentScope ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };

  if (incoming.tokenA) next.tokenA = String(incoming.tokenA).trim();
  else if (existing.tokenA) next.tokenA = existing.tokenA;

  if (incoming.tokenB) next.tokenB = String(incoming.tokenB).trim();
  else if (existing.tokenB) next.tokenB = existing.tokenB;

  if (!next.createdAt) next.createdAt = new Date().toISOString();
  return next;
}

export function readMainSites({ includeSecrets = false } = {}) {
  const config = readConfig();
  const sites = Array.isArray(config.sites) ? config.sites : [];
  return includeSecrets ? sites : sites.map(sanitizeSite);
}

export function saveMainSite(incomingSite = {}) {
  const config = readConfig();
  const sites = Array.isArray(config.sites) ? config.sites : [];
  const existingIndex = sites.findIndex((site) => site.id === incomingSite.id);
  const existing = existingIndex >= 0 ? sites[existingIndex] : {};
  const next = cleanIncomingSite(incomingSite, existing);

  if (!next.apiBaseUrl) throw new Error("请填写主站 OpenAPI 地址。");
  if (!next.tokenA || !next.tokenB) throw new Error("请填写两个 token 请求头。");

  if (existingIndex >= 0) sites[existingIndex] = next;
  else sites.push(next);

  writeConfig({ sites, updatedAt: new Date().toISOString() });
  return sanitizeSite(next);
}

export function deleteMainSite(siteId) {
  const config = readConfig();
  const sites = (Array.isArray(config.sites) ? config.sites : []).filter((site) => site.id !== siteId);
  writeConfig({ sites, updatedAt: new Date().toISOString() });
  return sites.map(sanitizeSite);
}

export function getMainSite(siteId, { includeSecrets = false } = {}) {
  const site = readMainSites({ includeSecrets: true }).find((item) => item.id === siteId);
  if (!site) throw new Error("未找到主站 OpenAPI 配置。");
  return includeSecrets ? site : sanitizeSite(site);
}

export { normalizeApiBaseUrl };
