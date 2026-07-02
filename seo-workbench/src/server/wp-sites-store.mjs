import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../config/wp-sites.local.json", import.meta.url);
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

export function normalizeSiteUrl(siteUrl = "") {
  let value = String(siteUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `https://${value}`;

  try {
    const url = new URL(value);
    if (url.protocol === "http:" && !shouldKeepHttpHost(url.hostname)) {
      url.protocol = "https:";
    }
    url.hash = "";
    return url.toString().replace(/\/+$/g, "");
  } catch {
    return value.replace(/\/+$/g, "");
  }
}

function sanitizeSite(site) {
  const applicationPassword = site.applicationPassword || "";
  return {
    ...site,
    applicationPassword: "",
    applicationPasswordSet: Boolean(applicationPassword),
    applicationPasswordPreview: applicationPassword ? `${applicationPassword.slice(0, 4)}...${applicationPassword.slice(-4)}` : "",
  };
}

function cleanIncomingSite(incoming = {}, existing = {}) {
  const next = {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id || randomUUID(),
    name: String(incoming.name || existing.name || incoming.siteUrl || "WordPress Site").trim(),
    siteUrl: normalizeSiteUrl(incoming.siteUrl || existing.siteUrl || ""),
    username: String(incoming.username || existing.username || "").trim(),
    defaultStatus: incoming.defaultStatus || existing.defaultStatus || "draft",
    defaultCategoryId: String(incoming.defaultCategoryId ?? existing.defaultCategoryId ?? "").trim(),
    targetMarket: String(incoming.targetMarket ?? existing.targetMarket ?? "").trim(),
    targetLanguage: String(incoming.targetLanguage ?? existing.targetLanguage ?? "").trim(),
    contentRole: String(incoming.contentRole ?? existing.contentRole ?? "博客A-知识教程").trim(),
    contentScope: String(incoming.contentScope ?? existing.contentScope ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };

  if (incoming.applicationPassword) {
    next.applicationPassword = String(incoming.applicationPassword).trim();
  } else if (existing.applicationPassword) {
    next.applicationPassword = existing.applicationPassword;
  }

  if (!next.createdAt) next.createdAt = new Date().toISOString();
  return next;
}

export function readWpSites({ includeSecrets = false } = {}) {
  const config = readConfig();
  const sites = Array.isArray(config.sites) ? config.sites : [];
  return includeSecrets ? sites : sites.map(sanitizeSite);
}

export function saveWpSite(incomingSite = {}) {
  const config = readConfig();
  const sites = Array.isArray(config.sites) ? config.sites : [];
  const existingIndex = sites.findIndex((site) => site.id === incomingSite.id);
  const existing = existingIndex >= 0 ? sites[existingIndex] : {};
  const next = cleanIncomingSite(incomingSite, existing);

  if (!next.siteUrl) throw new Error("请填写 WordPress 站点地址。");
  if (!next.username) throw new Error("请填写 WordPress 用户名。");
  if (!next.applicationPassword) throw new Error("请填写 WordPress 应用密码。");

  if (existingIndex >= 0) sites[existingIndex] = next;
  else sites.push(next);

  writeConfig({ sites, updatedAt: new Date().toISOString() });
  return sanitizeSite(next);
}

export function deleteWpSite(siteId) {
  const config = readConfig();
  const sites = (Array.isArray(config.sites) ? config.sites : []).filter((site) => site.id !== siteId);
  writeConfig({ sites, updatedAt: new Date().toISOString() });
  return sites.map(sanitizeSite);
}

export function getWpSite(siteId, { includeSecrets = false } = {}) {
  const site = readWpSites({ includeSecrets: true }).find((item) => item.id === siteId);
  if (!site) throw new Error("未找到 WordPress 站点配置。");
  return includeSecrets ? site : sanitizeSite(site);
}
