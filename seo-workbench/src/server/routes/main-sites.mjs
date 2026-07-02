import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { deleteMainSite, getMainSite, normalizeApiBaseUrl, readMainSites, saveMainSite } from "../main-sites-store.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

const MAIN_POSTS_LIST_CACHE_TTL_MS = 15000;
const mainPostsListCache = new Map();

function requestHeaders(site, bodyText = "") {
  const headers = {
    Accept: "application/json",
    "User-Agent": "SEO-Workbench/0.2",
    token: [site.tokenA || "", site.tokenB || ""],
  };
  if (bodyText) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(bodyText);
  }
  return headers;
}

function apiUrl(site, path = "") {
  return `${normalizeApiBaseUrl(site.apiBaseUrl)}${path}`;
}

async function requestMain(site, path, options = {}) {
  const targetUrl = apiUrl(site, path);
  const bodyText = options.body ? String(options.body) : "";
  const url = new URL(targetUrl);
  const requestFn = url.protocol === "http:" ? httpRequest : httpsRequest;

  const { statusCode, text } = await new Promise((resolve, reject) => {
    const req = requestFn(
      url,
      {
        method: options.method || "GET",
        headers: requestHeaders(site, bodyText),
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (bodyText) req.write(bodyText);
    req.end();
  }).catch((error) => {
    throw new Error(`无法连接主站 OpenAPI：${error?.cause?.message || error.message}\n当前请求地址：${targetUrl}`);
  });

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (statusCode < 200 || statusCode >= 300 || (typeof data.code !== "undefined" && Number(data.code) !== 0)) {
    throw new Error(data.msg || data.message || data.error || data.raw || `Main site API returned ${statusCode}`);
  }

  return data;
}

function siteForRequest(incoming = {}) {
  if (incoming.id && (!incoming.tokenA || !incoming.tokenB)) {
    const existing = getMainSite(incoming.id, { includeSecrets: true });
    return {
      ...existing,
      ...incoming,
      tokenA: incoming.tokenA || existing.tokenA,
      tokenB: incoming.tokenB || existing.tokenB,
      apiBaseUrl: incoming.apiBaseUrl || existing.apiBaseUrl,
    };
  }
  return incoming;
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMainPost(post = {}, { includeContent = false } = {}) {
  const contentText = stripHtml(post.content || "");
  return {
    id: post.id,
    date: post.published_at || "",
    modified: post.updated_at || post.published_at || "",
    slug: post.handle || "",
    status: post.status ?? "",
    link: post.src || "",
    title: stripHtml(post.title || "Untitled"),
    excerpt: stripHtml(post.descript || post.meta_descript || "").slice(0, 320),
    contentPreview: contentText.slice(0, 900),
    wordApprox: contentText ? contentText.split(/\s+/).filter(Boolean).length : 0,
    author: post.author_name || "",
    meta_title: post.meta_title || "",
    meta_keywords: post.meta_keywords || [],
    meta_descript: post.meta_descript || "",
    handle: post.handle || "",
    image_alt: post.image_alt || "",
    source: "main_site",
    ...(includeContent ? { content: post.content || "", contentText } : {}),
  };
}

function extractSectionValue(content, label) {
  const markdown = String(content || "");
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^##\\s+${escaped}(?:\\s*:\\s*(.*))?\\s*$`, "im");
  const match = regex.exec(markdown);
  if (!match) return "";
  const inlineValue = String(match[1] || "").trim();
  if (inlineValue) return inlineValue;
  const rest = markdown.slice(match.index + match[0].length);
  const next = rest.search(/\n(?:#\s+|##\s+)/);
  return rest.slice(0, next >= 0 ? next : undefined).trim();
}

function slugify(value = "") {
  return String(value || "seo-article")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractArticleBody(content) {
  const markdown = String(content || "").trim();
  const firstH1 = markdown.search(/^#\s+/m);
  const bodyStart = firstH1 >= 0 ? firstH1 : 0;
  const cutPatterns = ["References", "Sources Used", "Image Placement Map", "Internal Link Suggestions", "Evidence Needed", "Content QA Checklist"];
  const cutPositions = cutPatterns
    .map((pattern) => new RegExp(`^##\\s+${pattern}\\s*$`, "im").exec(markdown)?.index ?? -1)
    .filter((index) => index >= bodyStart);
  const bodyEnd = cutPositions.length ? Math.min(...cutPositions) : markdown.length;
  return markdown.slice(bodyStart, bodyEnd).trim();
}

function inlineMarkdownToHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown = "") {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdownToHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, Math.max(1, heading[1].length));
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      html.push(`<ul><li>${inlineMarkdownToHtml(line.replace(/^[-*]\s+/, ""))}</li></ul>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return html.join("\n");
}

function splitKeywords(value = "") {
  return String(value || "")
    .split(/[,，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function articlePayloadFromMarkdown(site, content, override = {}) {
  const title = extractSectionValue(content, "Title") || String(content || "").match(/^#\s+(.+)$/m)?.[1] || "Untitled";
  const metaTitle = extractSectionValue(content, "Meta Title") || title;
  const metaDescription = extractSectionValue(content, "Meta Description");
  const primaryKeyword = extractSectionValue(content, "Primary Keyword");
  const secondaryKeywords = splitKeywords(extractSectionValue(content, "Secondary Keywords"));
  const slug = slugify(override.handle || extractSectionValue(content, "URL Slug") || title);
  const srcPrefix = String(override.srcPrefix || site.defaultSrcPrefix || "/blogs/").replace(/\/?$/g, "/");
  const body = extractArticleBody(content);

  const payload = {
    published_at: override.publishedAt || new Date().toISOString().slice(0, 10),
    title,
    status: Number(override.status ?? site.defaultStatus ?? 0),
    src: override.src || `${srcPrefix}${slug}`,
    content: markdownToHtml(body),
    collect_content_images: Number(override.collectContentImages ?? site.collectContentImages ?? 0),
    author_name: override.authorName || site.defaultAuthor || "Admin",
    meta_keywords: [primaryKeyword, ...secondaryKeywords].filter(Boolean),
    meta_descript: override.metaDescript || metaDescription || "",
    meta_title: override.metaTitle || metaTitle,
    handle: slug,
    descript: override.descript || metaDescription || "",
    related_product_ids: override.relatedProductIds ?? site.defaultRelatedProductIds ?? "",
  };

  const imageId = String(override.imageId ?? site.defaultImageId ?? "").trim();
  if (imageId) payload.image_id = Number(imageId);
  return payload;
}

async function listMainPosts(site, options = {}) {
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 100)));
  const maxPages = Math.min(50, Math.max(1, Number(options.maxPages || 20)));
  const posts = [];
  let page = 1;
  let total = 0;
  let pageTotal = 1;

  while (page <= pageTotal && page <= maxPages) {
    const params = new URLSearchParams({ page: String(page), pagesize: String(pageSize) });
    const data = await requestMain(site, `/posts?${params.toString()}`, { method: "GET" });
    const list = data.data?.list || data.list || [];
    const paginate = data.data?.paginate || data.paginate || {};
    posts.push(...list.map((post) => normalizeMainPost(post)));
    total = Number(paginate.total || total || posts.length);
    pageTotal = Number(paginate.pageTotal || pageTotal || 1);
    if (!paginate.next) break;
    page = Number(paginate.next);
  }

  return {
    ok: true,
    total,
    fetched: posts.length,
    pageTotal,
    maxPages,
    truncated: page <= pageTotal && posts.length < total,
    posts,
  };
}

function mainPostsListCacheKey(site, options = {}) {
  return JSON.stringify({
    id: site.id || "",
    apiBaseUrl: normalizeApiBaseUrl(site.apiBaseUrl || ""),
    pageSize: Math.min(100, Math.max(1, Number(options.pageSize || 100))),
    maxPages: Math.min(50, Math.max(1, Number(options.maxPages || 20))),
  });
}

// Cache and dedupe list reads so repeated UI triggers do not fan out to the remote OpenAPI.
async function listMainPostsCached(site, options = {}) {
  const key = mainPostsListCacheKey(site, options);
  const now = Date.now();
  const cached = mainPostsListCache.get(key);

  if (cached?.result && now - cached.at < MAIN_POSTS_LIST_CACHE_TTL_MS) {
    return {
      ...cached.result,
      cached: true,
      cachedAt: new Date(cached.at).toISOString(),
    };
  }

  if (cached?.promise) {
    const result = await cached.promise;
    return {
      ...result,
      cached: true,
      shared: true,
    };
  }

  const promise = listMainPosts(site, options);
  mainPostsListCache.set(key, {
    at: cached?.at || now,
    result: cached?.result || null,
    promise,
  });

  try {
    const result = await promise;
    mainPostsListCache.set(key, {
      at: Date.now(),
      result,
      promise: null,
    });
    return {
      ...result,
      cached: false,
    };
  } catch (error) {
    if (cached?.result) {
      mainPostsListCache.set(key, {
        at: cached.at,
        result: cached.result,
        promise: null,
      });
    } else {
      mainPostsListCache.delete(key);
    }
    throw error;
  }
}

export async function handleMainSitesRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/main-sites") {
    sendJson(response, 200, { sites: readMainSites() });
    return true;
  }

  if (request.method !== "POST") {
    methodNotAllowed(response);
    return true;
  }

  const body = await readJson(request);

  if (pathname === "/api/main-sites/save") {
    const site = saveMainSite(body.site || {});
    sendJson(response, 200, { site, sites: readMainSites(), saved: true });
    return true;
  }

  if (pathname === "/api/main-sites/delete") {
    sendJson(response, 200, { sites: deleteMainSite(body.siteId), deleted: true });
    return true;
  }

  if (pathname === "/api/main-sites/test") {
    const site = body.site?.apiBaseUrl ? siteForRequest(body.site) : getMainSite(body.siteId, { includeSecrets: true });
    const result = await listMainPosts(site, { pageSize: 10, maxPages: 1 });
    const savedSite = body.site?.apiBaseUrl ? saveMainSite(body.site) : getMainSite(site.id);
    sendJson(response, 200, { ...result, site: savedSite });
    return true;
  }

  if (pathname === "/api/main-sites/list") {
    const site = getMainSite(body.siteId, { includeSecrets: true });
    const options = { pageSize: body.pageSize, maxPages: body.maxPages };
    const result = body.force
      ? { ...(await listMainPosts(site, options)), cached: false, forced: true }
      : await listMainPostsCached(site, options);
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === "/api/main-sites/upload") {
    const site = getMainSite(body.siteId, { includeSecrets: true });
    const payload = articlePayloadFromMarkdown(site, body.content || "", body.override || {});
    const result = await requestMain(site, "/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    sendJson(response, 200, { ok: true, result, payloadPreview: payload });
    return true;
  }

  sendJson(response, 404, { error: "Main site endpoint not found" });
  return true;
}
