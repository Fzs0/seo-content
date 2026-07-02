import { readJson, sendJson } from "../http.mjs";

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
  const sources = [
    siteApis.mainPagesApi ? { label: "主站页面 API", url: siteApis.mainPagesApi } : null,
    siteApis.mainBlogApi ? { label: "主站文章 API", url: siteApis.mainBlogApi } : null,
    ...(siteApis.blogApis || []).map((url, index) => ({ label: `博客站 API ${index + 1}`, url })),
  ].filter(Boolean);

  if (!sources.length) {
    sendJson(response, 200, {
      sources: [],
      message: "还没有填写站点 API。",
    });
    return true;
  }

  sendJson(response, 200, {
    sources: await Promise.all(sources.map(fetchSource)),
  });
  return true;
}
