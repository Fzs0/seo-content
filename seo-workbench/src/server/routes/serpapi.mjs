import { readJson, sendJson } from "../http.mjs";
import { readSerpApiConfig, saveSerpApiConfig } from "../serpapi-store.mjs";

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function cleanParam(value = "") {
  return String(value || "").trim();
}

function normalizeOrganicResult(result = {}, index = 0) {
  return {
    position: Number(result.position || index + 1),
    title: cleanParam(result.title),
    link: cleanParam(result.link),
    displayedLink: cleanParam(result.displayed_link),
    snippet: cleanParam(result.snippet),
    source: cleanParam(result.source),
  };
}

function normalizeSerpApiResponse(data = {}, params = {}) {
  const organicResults = Array.isArray(data.organic_results)
    ? data.organic_results.map(normalizeOrganicResult).filter((item) => item.title || item.link)
    : [];
  const relatedQuestions = Array.isArray(data.related_questions)
    ? data.related_questions.slice(0, 8).map((item) => ({
        question: cleanParam(item.question),
        snippet: cleanParam(item.snippet),
        title: cleanParam(item.title),
        link: cleanParam(item.link),
      }))
    : [];
  const relatedSearches = Array.isArray(data.related_searches)
    ? data.related_searches.slice(0, 12).map((item) => cleanParam(item.query || item.title)).filter(Boolean)
    : [];
  const inlineImages = Array.isArray(data.inline_images)
    ? data.inline_images.slice(0, 6).map((item) => ({
        title: cleanParam(item.title),
        source: cleanParam(item.source),
        thumbnail: cleanParam(item.thumbnail),
        link: cleanParam(item.link),
      }))
    : [];

  return {
    query: params.q || data.search_parameters?.q || "",
    gl: params.gl || data.search_parameters?.gl || "",
    hl: params.hl || data.search_parameters?.hl || "",
    location: params.location || data.search_parameters?.location || "",
    requestedAt: new Date().toISOString(),
    searchMetadata: {
      id: data.search_metadata?.id || "",
      status: data.search_metadata?.status || "",
      createdAt: data.search_metadata?.created_at || "",
      processedAt: data.search_metadata?.processed_at || "",
      totalTimeTaken: data.search_metadata?.total_time_taken || null,
    },
    searchInformation: {
      totalResults: data.search_information?.total_results || null,
      timeTakenDisplayed: data.search_information?.time_taken_displayed || "",
      queryDisplayed: data.search_information?.query_displayed || "",
    },
    answerBox: data.answer_box
      ? {
          title: cleanParam(data.answer_box.title),
          answer: cleanParam(data.answer_box.answer || data.answer_box.snippet),
          link: cleanParam(data.answer_box.link),
        }
      : null,
    organicResults,
    relatedQuestions,
    relatedSearches,
    inlineImages,
    topUrls: organicResults.slice(0, 10).map((item) => item.link).filter(Boolean),
    rawFeatureKeys: Object.keys(data).filter((key) => !["search_metadata", "search_parameters", "organic_results"].includes(key)).sort(),
  };
}

async function runSerpApiSearch({ query, locale = {}, location = "", num = 10 } = {}) {
  const config = readSerpApiConfig({ includeSecrets: true });
  if (!config.apiKey) throw new Error("SerpApi API Key is not configured.");
  const cleanQuery = cleanParam(query);
  if (!cleanQuery) throw new Error("SERP query is required.");

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", config.defaultEngine || "google");
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("num", String(clampNumber(num, 10, 1, 20)));
  url.searchParams.set("no_cache", "true");
  if (locale.googleGl) url.searchParams.set("gl", cleanParam(locale.googleGl));
  if (locale.googleHl) url.searchParams.set("hl", cleanParam(locale.googleHl));
  if (location) url.searchParams.set("location", cleanParam(location));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SEO-Workbench/0.2 serpapi",
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.error) {
    throw new Error(data.error || data.message || data.raw || `SerpApi returned ${response.status}`);
  }
  return normalizeSerpApiResponse(data, {
    q: cleanQuery,
    gl: locale.googleGl || "",
    hl: locale.googleHl || "",
    location,
  });
}

export async function handleSerpApiRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/serpapi/config") {
    sendJson(response, 200, readSerpApiConfig());
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJson(request);

  if (pathname === "/api/serpapi/config") {
    sendJson(response, 200, saveSerpApiConfig(body.config || body || {}));
    return;
  }

  if (pathname === "/api/serpapi/search") {
    sendJson(response, 200, await runSerpApiSearch({
      query: body.query,
      locale: body.locale || {},
      location: body.location || "",
      num: body.num || 10,
    }));
    return;
  }

  if (pathname === "/api/serpapi/test") {
    sendJson(response, 200, await runSerpApiSearch({
      query: body.query || "test",
      locale: body.locale || {},
      location: body.location || "",
      num: 3,
    }));
    return;
  }

  sendJson(response, 404, { error: "SerpApi endpoint not found" });
}
