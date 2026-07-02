import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../config/blog-sites.local.json", import.meta.url);
const configPath = fileURLToPath(configUrl);

function readConfig() {
  if (!existsSync(configPath)) return { sites: [] };
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function writeConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function shouldKeepHttpHost(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

export function normalizeBlogApiBaseUrl(value = "") {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) raw = `https:${raw}`;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && !shouldKeepHttpHost(url.hostname)) {
      url.protocol = "https:";
    }
    url.hash = "";
    url.search = "";

    let pathname = url.pathname.replace(/\/+$/g, "");
    if (pathname.endsWith("/api/open/v1/posts")) {
      pathname = pathname.slice(0, -"/posts".length);
    } else if (!pathname.endsWith("/api/open/v1")) {
      pathname = `${pathname}/api/open/v1`.replace(/\/{2,}/g, "/");
    }
    url.pathname = pathname;
    return url.toString().replace(/\/+$/g, "");
  } catch {
    return raw.replace(/\/+$/g, "");
  }
}

function sanitizeSite(site) {
  const openApiKey = site.openApiKey || "";
  return {
    ...site,
    openApiKey: "",
    openApiKeySet: Boolean(openApiKey),
    openApiKeyPreview: openApiKey ? `${openApiKey.slice(0, 4)}...${openApiKey.slice(-4)}` : "",
  };
}

function cleanIncomingSite(incoming = {}, existing = {}) {
  const next = {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id || randomUUID(),
    name: String(incoming.name || existing.name || incoming.apiBaseUrl || "Blog Site").trim(),
    apiBaseUrl: normalizeBlogApiBaseUrl(incoming.apiBaseUrl || existing.apiBaseUrl || ""),
    defaultAuthor: String(incoming.defaultAuthor ?? existing.defaultAuthor ?? "Admin").trim() || "Admin",
    defaultStatus: incoming.defaultStatus || existing.defaultStatus || "draft",
    defaultCategoryId: String(incoming.defaultCategoryId ?? existing.defaultCategoryId ?? "").trim(),
    defaultCoverUrl: String(incoming.defaultCoverUrl ?? existing.defaultCoverUrl ?? "").trim(),
    targetMarket: String(incoming.targetMarket ?? existing.targetMarket ?? "").trim(),
    targetLanguage: String(incoming.targetLanguage ?? existing.targetLanguage ?? "").trim(),
    contentRole: String(incoming.contentRole ?? existing.contentRole ?? "博客A-知识教程").trim(),
    contentScope: String(incoming.contentScope ?? existing.contentScope ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };

  if (incoming.openApiKey) {
    next.openApiKey = String(incoming.openApiKey).trim();
  } else if (existing.openApiKey) {
    next.openApiKey = existing.openApiKey;
  }

  if (!next.createdAt) next.createdAt = new Date().toISOString();
  return next;
}

export function readBlogSites({ includeSecrets = false } = {}) {
  const config = readConfig();
  const sites = Array.isArray(config.sites) ? config.sites : [];
  return includeSecrets ? sites : sites.map(sanitizeSite);
}

export function saveBlogSite(incomingSite = {}) {
  const config = readConfig();
  const sites = Array.isArray(config.sites) ? config.sites : [];
  const existingIndex = sites.findIndex((site) => site.id === incomingSite.id);
  const existing = existingIndex >= 0 ? sites[existingIndex] : {};
  const next = cleanIncomingSite(incomingSite, existing);

  if (!next.apiBaseUrl) throw new Error("请填写自建博客 API 地址。");
  if (!next.openApiKey) throw new Error("请填写 Open API Key。");

  if (existingIndex >= 0) sites[existingIndex] = next;
  else sites.push(next);

  writeConfig({ sites, updatedAt: new Date().toISOString() });
  return sanitizeSite(next);
}

export function deleteBlogSite(siteId) {
  const config = readConfig();
  const sites = (Array.isArray(config.sites) ? config.sites : []).filter((site) => site.id !== siteId);
  writeConfig({ sites, updatedAt: new Date().toISOString() });
  return sites.map(sanitizeSite);
}

export function getBlogSite(siteId, { includeSecrets = false } = {}) {
  const site = readBlogSites({ includeSecrets: true }).find((item) => item.id === siteId);
  if (!site) throw new Error("未找到自建博客站点配置。");
  return includeSecrets ? site : sanitizeSite(site);
}
