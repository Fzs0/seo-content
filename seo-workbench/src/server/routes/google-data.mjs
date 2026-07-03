import { createSign } from "node:crypto";
import { deleteGoogleDataSource, getGoogleDataSource, readGoogleDataSources, saveGoogleDataSource } from "../google-data-store.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const tokenCache = new Map();
const proxyAgentCache = new Map();

function networkErrorMessage(label, url, error) {
  const cause = error?.cause;
  const causeParts = [cause?.code, cause?.message].filter(Boolean).join(" / ");
  return `${label}：${error.message}${causeParts ? `（${causeParts}）` : ""}。当前请求地址：${url}`;
}

function proxyUrlFor(source = {}) {
  return (
    source.googleProxyUrl ||
    process.env.GOOGLE_API_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    ""
  ).trim();
}

async function dispatcherFor(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyAgentCache.has(proxyUrl)) return proxyAgentCache.get(proxyUrl);

  try {
    const { ProxyAgent } = await import("undici");
    const dispatcher = new ProxyAgent(proxyUrl);
    proxyAgentCache.set(proxyUrl, dispatcher);
    return dispatcher;
  } catch (error) {
    throw new Error(
      `Google API 代理需要安装 undici 依赖。请在 seo-workbench 目录运行 npm install 后重启服务。原始错误：${error.message}`,
    );
  }
}

async function googleFetch(url, options = {}, source = {}) {
  const proxyUrl = proxyUrlFor(source);
  const dispatcher = await dispatcherFor(proxyUrl);
  return fetch(url, dispatcher ? { ...options, dispatcher } : options);
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function signJwt(serviceAccount, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key, "base64");
  return `${unsigned}.${signature.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

async function getAccessToken(serviceAccount, scope, source = {}) {
  const cacheKey = `${serviceAccount.client_email}:${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  let response;
  try {
    response = await googleFetch(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signJwt(serviceAccount, scope),
        }),
      },
      source,
    );
  } catch (error) {
    throw new Error(
      `${networkErrorMessage("Google OAuth 连接失败", TOKEN_URL, error)}。这通常不是 GSC 权限问题，而是本地 Node 服务无法访问 Google；浏览器能打开 Google 不代表 Node 也能走同一个代理。`,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google OAuth failed: ${response.status}`);

  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

function isoDateNDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function resolveDateRange(body = {}, source = {}) {
  return {
    startDate: body.startDate || source.defaultStartDate || isoDateNDaysAgo(30),
    endDate: body.endDate || source.defaultEndDate || isoDateNDaysAgo(2),
  };
}

function encodeSiteUrl(siteUrl) {
  return encodeURIComponent(siteUrl).replaceAll("%2F", "%2F");
}

async function queryGsc(source, body = {}, dimensions = ["query"], rowLimit = 100) {
  if (!source.gscSiteUrl) return { skipped: true, reason: "未配置 GSC 站点地址。" };
  const accessToken = await getAccessToken(source.serviceAccount, GSC_SCOPE, source);
  const { startDate, endDate } = resolveDateRange(body, source);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(source.gscSiteUrl)}/searchAnalytics/query`;
  let response;
  try {
    response = await googleFetch(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions,
          rowLimit,
          startRow: 0,
          dataState: "final",
        }),
      },
      source,
    );
  } catch (error) {
    throw new Error(networkErrorMessage("GSC 查询连接失败", url, error));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        `GSC query failed: ${response.status}。请确认 GSC 站点地址和 Search Console 资源完全一致，例如 https://example.com/ 与 https://example.com 是不同资源。`,
    );
  }
  return { startDate, endDate, dimensions, rows: data.rows || [] };
}

async function queryGa4(source, body = {}, rowLimit = 100) {
  if (!source.ga4PropertyId) return { skipped: true, reason: "未配置 GA4 Property ID。" };
  const accessToken = await getAccessToken(source.serviceAccount, GA4_SCOPE, source);
  const { startDate, endDate } = resolveDateRange(body, source);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${source.ga4PropertyId}:runReport`;
  let response;
  try {
    response = await googleFetch(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagementRate" }, { name: "averageSessionDuration" }],
          limit: String(rowLimit),
        }),
      },
      source,
    );
  } catch (error) {
    throw new Error(networkErrorMessage("GA4 查询连接失败", url, error));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `GA4 runReport failed: ${response.status}`);
  return {
    startDate,
    endDate,
    rows: (data.rows || []).map((row) => ({
      pagePath: row.dimensionValues?.[0]?.value || "",
      pageTitle: row.dimensionValues?.[1]?.value || "",
      sessions: Number(row.metricValues?.[0]?.value || 0),
      activeUsers: Number(row.metricValues?.[1]?.value || 0),
      engagementRate: Number(row.metricValues?.[2]?.value || 0),
      averageSessionDuration: Number(row.metricValues?.[3]?.value || 0),
    })),
  };
}

function pickSource(body = {}) {
  return getGoogleDataSource(body.sourceId, { includeSecrets: true });
}

async function testSource(source) {
  const checks = [];
  if (source.gscSiteUrl) {
    const gsc = await queryGsc(source, {}, ["query"], 1);
    checks.push({ type: "GSC", ok: true, rows: gsc.rows.length, siteUrl: source.gscSiteUrl });
  }
  if (source.ga4PropertyId) {
    const ga4 = await queryGa4(source, {}, 1);
    checks.push({ type: "GA4", ok: true, rows: ga4.rows.length, propertyId: source.ga4PropertyId });
  }
  return checks;
}

export async function handleGoogleDataRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/google-data-sources") {
    sendJson(response, 200, { sources: readGoogleDataSources() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/google-data-sources") {
    const body = await readJson(request);
    sendJson(response, 200, { source: saveGoogleDataSource(body.source || body), sources: readGoogleDataSources(), saved: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/google-data-sources/delete") {
    const body = await readJson(request);
    sendJson(response, 200, { sources: deleteGoogleDataSource(body.sourceId), deleted: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/google-data-sources/test") {
    const body = await readJson(request);
    const source = pickSource(body);
    sendJson(response, 200, { ok: true, checks: await testSource(source) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/google-data-sources/monthly-review") {
    const body = await readJson(request);
    const source = pickSource(body);
    const rowLimit = Math.min(Number(body.rowLimit || 100), 500);
    const [gscQueries, gscPages, ga4Pages] = await Promise.all([
      queryGsc(source, body, ["query"], rowLimit),
      queryGsc(source, body, ["page"], rowLimit),
      queryGa4(source, body, rowLimit),
    ]);
    sendJson(response, 200, {
      ok: true,
      source: getGoogleDataSource(source.id),
      dateRange: resolveDateRange(body, source),
      gscQueries,
      gscPages,
      ga4Pages,
      note: "这是月度复盘数据底座：GSC 看需求与排名入口，GA4 看页面质量。下一步可接 AI 生成 Action Plan。",
    });
    return true;
  }

  methodNotAllowed(response);
  return true;
}
