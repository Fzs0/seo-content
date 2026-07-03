import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../config/google-data-sources.local.json", import.meta.url);
const configPath = fileURLToPath(configUrl);

function readConfig() {
  if (!existsSync(configPath)) return { sources: [] };
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function writeConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function parseServiceAccount(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return null;
  return JSON.parse(text);
}

function previewServiceAccount(serviceAccount = {}) {
  const email = serviceAccount.client_email || "";
  return {
    serviceAccountSet: Boolean(email && serviceAccount.private_key),
    serviceAccountEmail: email,
    serviceAccountProjectId: serviceAccount.project_id || "",
  };
}

function previewProxyUrl(proxyUrl = "") {
  if (!proxyUrl) return "";
  try {
    const url = new URL(proxyUrl);
    if (url.username || url.password) {
      url.username = "****";
      url.password = "****";
    }
    return url.toString();
  } catch {
    return proxyUrl.replace(/:\/\/([^:@]+):([^@]+)@/, "://****:****@");
  }
}

function sanitizeSource(source = {}) {
  const { serviceAccount, ...rest } = source;
  return {
    ...rest,
    serviceAccount: undefined,
    googleProxyUrl: undefined,
    googleProxyUrlSet: Boolean(source.googleProxyUrl),
    googleProxyUrlPreview: previewProxyUrl(source.googleProxyUrl),
    ...previewServiceAccount(serviceAccount),
  };
}

function normalizeGscSiteUrl(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed;
}

function cleanIncomingSource(incoming = {}, existing = {}) {
  const parsedServiceAccount = parseServiceAccount(incoming.serviceAccountJson || incoming.serviceAccount);
  const next = {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id || randomUUID(),
    name: String(incoming.name || existing.name || incoming.gscSiteUrl || "Google Data Source").trim(),
    gscSiteUrl: normalizeGscSiteUrl(incoming.gscSiteUrl || existing.gscSiteUrl || ""),
    ga4PropertyId: String(incoming.ga4PropertyId || existing.ga4PropertyId || "").replace(/^properties\//, "").trim(),
    googleProxyUrl: String(incoming.googleProxyUrl || existing.googleProxyUrl || "").trim(),
    defaultStartDate: String(incoming.defaultStartDate || existing.defaultStartDate || "").trim(),
    defaultEndDate: String(incoming.defaultEndDate || existing.defaultEndDate || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  delete next.serviceAccountJson;

  if (parsedServiceAccount) {
    next.serviceAccount = parsedServiceAccount;
  } else if (existing.serviceAccount) {
    next.serviceAccount = existing.serviceAccount;
  }

  if (!next.createdAt) next.createdAt = new Date().toISOString();
  return next;
}

export function readGoogleDataSources({ includeSecrets = false } = {}) {
  const config = readConfig();
  const sources = Array.isArray(config.sources) ? config.sources : [];
  return includeSecrets ? sources : sources.map(sanitizeSource);
}

export function getGoogleDataSource(sourceId, { includeSecrets = false } = {}) {
  const source = readGoogleDataSources({ includeSecrets: true }).find((item) => item.id === sourceId);
  if (!source) throw new Error("未找到 Google 复盘数据源配置。");
  return includeSecrets ? source : sanitizeSource(source);
}

export function saveGoogleDataSource(incomingSource = {}) {
  const config = readConfig();
  const sources = Array.isArray(config.sources) ? config.sources : [];
  const existingIndex = sources.findIndex((source) => source.id === incomingSource.id);
  const existing = existingIndex >= 0 ? sources[existingIndex] : {};
  const next = cleanIncomingSource(incomingSource, existing);

  if (!next.name) throw new Error("请填写数据源名称。");
  if (!next.gscSiteUrl && !next.ga4PropertyId) throw new Error("请至少填写 GSC 站点地址或 GA4 Property ID。");
  if (!next.serviceAccount?.client_email || !next.serviceAccount?.private_key) {
    throw new Error("请上传或粘贴 Google 服务账号 JSON 密钥。");
  }

  if (existingIndex >= 0) sources[existingIndex] = next;
  else sources.push(next);

  writeConfig({ sources, updatedAt: new Date().toISOString() });
  return sanitizeSource(next);
}

export function deleteGoogleDataSource(sourceId) {
  const config = readConfig();
  const sources = (Array.isArray(config.sources) ? config.sources : []).filter((source) => source.id !== sourceId);
  writeConfig({ sources, updatedAt: new Date().toISOString() });
  return sources.map(sanitizeSource);
}
