import { readJson, sendJson } from "../http.mjs";
import { readProductAssets } from "../product-assets-store.mjs";

function parseHeaders(headersText = "") {
  const headers = {};
  const clean = String(headersText || "").trim();
  if (!clean) return headers;

  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
    }
  } catch {
    // Support "Header: value" lines too.
  }

  for (const line of clean.split(/\r?\n/)) {
    const [name, ...rest] = line.split(":");
    if (!name || !rest.length) continue;
    headers[name.trim()] = rest.join(":").trim();
  }
  return headers;
}

function summarizeJson(data) {
  if (Array.isArray(data)) {
    return {
      type: "array",
      count: data.length,
      sampleKeys: data[0] && typeof data[0] === "object" ? Object.keys(data[0]).slice(0, 12) : [],
    };
  }

  if (data && typeof data === "object") {
    const keys = Object.keys(data);
    const arrayKey = keys.find((key) => Array.isArray(data[key]));
    return {
      type: "object",
      keys: keys.slice(0, 20),
      count: arrayKey ? data[arrayKey].length : undefined,
      arrayKey,
      sampleKeys:
        arrayKey && data[arrayKey][0] && typeof data[arrayKey][0] === "object"
          ? Object.keys(data[arrayKey][0]).slice(0, 12)
          : [],
    };
  }

  return {
    type: typeof data,
  };
}

async function fetchSource(source) {
  const startedAt = Date.now();
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: "application/json",
        ...(source.headers || {}),
      },
    });
    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      label: source.label,
      url: source.url,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      summary: summarizeJson(data),
    };
  } catch (error) {
    return {
      label: source.label,
      url: source.url,
      ok: false,
      error: error.message,
      ms: Date.now() - startedAt,
    };
  }
}

export async function handleSiteSnapshotRoute(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }

  const body = await readJson(request);
  const siteApis = body.project?.siteApis || {};
  const savedProductAssets = readProductAssets({ includeSecrets: true });
  const productApi = {
    ...savedProductAssets.api,
    ...(body.productApi || {}),
    headersText: body.productApi?.headersText || savedProductAssets.api?.headersText || "",
  };
  const sources = [
    siteApis.mainPagesApi ? { label: "主站页面 API", url: siteApis.mainPagesApi } : null,
    siteApis.mainBlogApi ? { label: "主站文章 API", url: siteApis.mainBlogApi } : null,
    ...(siteApis.blogApis || []).map((url, index) => ({ label: `博客站 API ${index + 1}`, url })),
    productApi.endpoint
      ? { label: "主站产品 API", url: productApi.endpoint, headers: parseHeaders(productApi.headersText) }
      : null,
  ].filter(Boolean);

  if (!sources.length) {
    sendJson(response, 200, {
      sources: [],
      message: "还没有填写可测试的数据源 API。请至少填写产品 API、主站页面 API、主站文章 API 或博客站 API。",
    });
    return true;
  }

  sendJson(response, 200, {
    sources: await Promise.all(sources.map(fetchSource)),
  });
  return true;
}
