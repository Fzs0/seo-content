import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteBlogSite, getBlogSite, normalizeBlogApiBaseUrl, readBlogSites, saveBlogSite } from "../blog-sites-store.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const generatedArticlesRoot = normalize(join(projectRoot, "generated-articles"));

function blogAuthHeader(site) {
  const key = String(site.openApiKey || "").trim();
  if (/^bearer\s+/i.test(key)) return key;
  return `Bearer ${key}`;
}

function blogApiUrl(site, path = "") {
  return `${normalizeBlogApiBaseUrl(site.apiBaseUrl)}${path}`;
}

function requestHeaders(site, options = {}) {
  return {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEO-Workbench/0.2",
    Authorization: blogAuthHeader(site),
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
}

function connectionError(apiUrl, error) {
  const reason = error?.cause?.message || error?.message || "unknown network error";
  return new Error(
    [
      `无法连接自建博客 Open API：${reason}`,
      `当前请求地址：${apiUrl}`,
      "请确认 API 地址可以从本机服务访问，并且 Authorization 请求头使用的是 Bearer <open_api_key>。",
    ].join("\n"),
  );
}

async function requestBlog(site, path, options = {}) {
  const { acceptedStatuses = [], ...fetchOptions } = options;
  const targetUrl = blogApiUrl(site, path);
  let response;
  try {
    response = await fetch(targetUrl, {
      ...fetchOptions,
      headers: requestHeaders(site, fetchOptions),
    });
  } catch (error) {
    throw connectionError(targetUrl, error);
  }

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    const detail = data.message || data.error || data.raw || `Blog API returned ${response.status}`;
    throw new Error(detail);
  }

  if (Array.isArray(data)) {
    data.__status = response.status;
    return data;
  }

  return { ...data, __status: response.status };
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractH2Block(content, labelPattern) {
  const regex = new RegExp(`^##\\s+${labelPattern}\\s*$`, "im");
  const match = regex.exec(content);
  if (!match) return "";

  const start = match.index;
  const afterHeading = start + match[0].length;
  const rest = content.slice(afterHeading);
  const next = rest.search(/\n(?:#\s+|##\s+)/);
  const end = next >= 0 ? afterHeading + next : content.length;
  return content.slice(start, end).trim();
}

function extractSectionValue(content, label) {
  const markdown = String(content || "");
  const regex = new RegExp(`^##\\s+${escapeRegExp(label)}(?:\\s*:\\s*(.*))?\\s*$`, "im");
  const match = regex.exec(markdown);
  if (!match) return "";

  const inlineValue = String(match[1] || "").trim();
  if (inlineValue) return inlineValue;

  const afterHeading = match.index + match[0].length;
  const rest = markdown.slice(afterHeading);
  const next = rest.search(/\n(?:#\s+|##\s+)/);
  return rest.slice(0, next >= 0 ? next : undefined).trim();
}

function extractArticleBody(content) {
  const markdown = String(content || "").trim();
  const firstH1 = markdown.search(/^#\s+/m);
  const bodyStart = firstH1 >= 0 ? firstH1 : 0;
  const publishCutPatterns = [
    "References",
    "Sources Used",
    "Image Placement Map",
    "Internal Link Suggestions",
    "Internal Link & Anchor Text Map",
    "Evidence Needed",
    "Content QA Checklist",
  ];
  const cutPositions = publishCutPatterns
    .map((pattern) => new RegExp(`^##\\s+${escapeRegExp(pattern)}\\s*$`, "im").exec(markdown)?.index ?? -1)
    .filter((index) => index >= bodyStart);
  const bodyEnd = cutPositions.length ? Math.min(...cutPositions) : markdown.length;
  return markdown.slice(bodyStart, bodyEnd).trim();
}

function slugify(value = "") {
  return String(value || "seo-article")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function firstParagraph(markdown = "") {
  return String(markdown || "")
    .split(/\n{2,}/)
    .map((block) => block.replace(/^#+\s+.+$/gm, "").trim())
    .find(Boolean)
    ?.replace(/\s+/g, " ")
    .slice(0, 220) || "";
}

function firstCoverUrl(markdown = "") {
  const imageBlock = extractH2Block(markdown, "Image Placement Map|Images? / Tables?");
  const match =
    /cover(?:_url| url| image)?\s*[:：]\s*(https?:\/\/\S+)/i.exec(imageBlock) ||
    /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i.exec(markdown);
  return match?.[1]?.trim() || "";
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

function collectBlogItems(data) {
  if (Array.isArray(data)) return data;
  return data.items || data.data || data.posts || data.results || [];
}

function normalizeBlogPost(post = {}, { includeContent = false } = {}) {
  const contentMd = post.content_md || post.content || post.markdown || "";
  const contentHtml = post.content_html || post.html || "";
  const contentText = contentMd ? stripHtml(contentMd) : stripHtml(contentHtml);
  const title = post.title || post.name || post.seo_title || "Untitled";

  return {
    id: post.id ?? post.post_id ?? post.uuid ?? post.slug ?? "",
    date: post.created_at || post.date || post.published_at || "",
    modified: post.updated_at || post.modified || "",
    slug: post.slug || "",
    status: post.status || "",
    link: post.url || post.link || "",
    title: stripHtml(title),
    excerpt: stripHtml(post.excerpt || post.summary || post.description || "").slice(0, 320),
    contentPreview: contentText.slice(0, 900),
    wordApprox: contentText ? contentText.split(/\s+/).filter(Boolean).length : 0,
    category_id: post.category_id ?? null,
    author: post.author || "",
    cover_url: post.cover_url || post.cover_image || "",
    source: "self_built_blog",
    ...(includeContent
      ? {
          content_md: contentMd,
          content_html: contentHtml,
          contentText,
        }
      : {}),
  };
}

function articleMetaFromMarkdown(content) {
  const markdown = String(content || "");
  const title = extractSectionValue(markdown, "Title") || markdown.match(/^#\s+(.+)$/m)?.[1] || "Untitled";
  const metaDescription = extractSectionValue(markdown, "Meta Description");
  const slug = slugify(extractSectionValue(markdown, "URL Slug") || title);
  const body = extractArticleBody(markdown);

  return {
    title,
    slug,
    excerpt: metaDescription || firstParagraph(body),
    body,
    coverUrl: firstCoverUrl(markdown),
  };
}

function categoryIdValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function articlePayloadFromMarkdown(site, content, override = {}) {
  const meta = articleMetaFromMarkdown(content);
  return {
    title: override.title || meta.title,
    slug: override.slug || meta.slug || undefined,
    excerpt: override.excerpt || meta.excerpt || undefined,
    author: override.author || site.defaultAuthor || "Admin",
    category_id: categoryIdValue(override.categoryId ?? site.defaultCategoryId),
    content_md: meta.body || String(content || "").trim(),
    cover_url: override.coverUrl || site.defaultCoverUrl || meta.coverUrl || undefined,
    format: "markdown",
    status: override.status || site.defaultStatus || "draft",
  };
}

function safeGeneratedArticlePath(relativePath = "") {
  const normalizedRelative = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalizedRelative.startsWith("generated-articles/")) {
    throw new Error(`不是允许读取的生成文章路径：${relativePath}`);
  }

  const target = normalize(join(projectRoot, normalizedRelative));
  if (!target.startsWith(generatedArticlesRoot)) {
    throw new Error("生成文章读取路径越界。");
  }
  return target;
}

async function uploadContentsFromBody(body = {}) {
  const contents = Array.isArray(body.contents) ? body.contents : [];
  const relativePaths = Array.isArray(body.relativePaths) ? body.relativePaths : [];
  const maxLength = Math.max(contents.length, relativePaths.length);

  const resolved = [];
  for (let index = 0; index < maxLength; index += 1) {
    const inlineContent = String(contents[index] || "");
    if (inlineContent.trim()) {
      resolved.push(inlineContent);
      continue;
    }

    if (relativePaths[index]) {
      resolved.push(await readFile(safeGeneratedArticlePath(relativePaths[index]), "utf8"));
    }
  }

  return resolved;
}

function siteForRequest(incoming = {}) {
  if (incoming.id && !incoming.openApiKey) {
    const existing = getBlogSite(incoming.id, { includeSecrets: true });
    return {
      ...existing,
      ...incoming,
      openApiKey: existing.openApiKey,
      apiBaseUrl: incoming.apiBaseUrl || existing.apiBaseUrl,
    };
  }

  return incoming;
}

async function testBlogSite(site) {
  const data = await requestBlog(site, "/posts", { method: "GET" });
  const items = Array.isArray(data) ? data : data.items || data.data || data.posts || [];
  return {
    ok: true,
    count: Array.isArray(items) ? items.length : undefined,
    preview: Array.isArray(items) ? items.slice(0, 5) : data,
  };
}

async function uploadArticles(site, contents = [], override = {}) {
  const items = contents
    .filter((content) => String(content || "").trim())
    .map((content, index) =>
      articlePayloadFromMarkdown(site, content, {
        ...override,
        ...(Array.isArray(override.items) ? override.items[index] || {} : {}),
      }),
    );

  if (!items.length) throw new Error("没有可上传的 Markdown 文章。");

  const data = await requestBlog(site, "/posts/batch", {
    method: "POST",
    body: JSON.stringify({ items }),
    acceptedStatuses: [200, 201, 400],
  });

  return {
    ok: true,
    requested: items.length,
    created: data.created || data.items || data.data || [],
    failed: data.failed || [],
    raw: data,
    payloadPreview: items,
  };
}

export async function handleBlogSitesRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/blog-sites") {
    sendJson(response, 200, { sites: readBlogSites() });
    return true;
  }

  if (request.method !== "POST") {
    methodNotAllowed(response);
    return true;
  }

  const body = await readJson(request);

  if (pathname === "/api/blog-sites/save") {
    const site = saveBlogSite(body.site || {});
    sendJson(response, 200, { site, sites: readBlogSites(), saved: true });
    return true;
  }

  if (pathname === "/api/blog-sites/delete") {
    sendJson(response, 200, { sites: deleteBlogSite(body.siteId), deleted: true });
    return true;
  }

  if (pathname === "/api/blog-sites/test") {
    const site = body.site?.apiBaseUrl ? siteForRequest(body.site) : getBlogSite(body.siteId, { includeSecrets: true });
    const result = await testBlogSite(site);
    const savedSite = body.site?.apiBaseUrl ? saveBlogSite(body.site) : getBlogSite(site.id);
    sendJson(response, 200, { ...result, site: savedSite });
    return true;
  }

  if (pathname === "/api/blog-sites/list") {
    const site = getBlogSite(body.siteId, { includeSecrets: true });
    const data = await requestBlog(site, "/posts", { method: "GET" });
    const items = collectBlogItems(data);
    sendJson(response, 200, {
      ok: true,
      total: Array.isArray(items) ? items.length : undefined,
      posts: Array.isArray(items) ? items.map((post) => normalizeBlogPost(post)) : [],
      data,
    });
    return true;
  }

  if (pathname === "/api/blog-sites/post") {
    const site = getBlogSite(body.siteId, { includeSecrets: true });
    if (!body.postId) throw new Error("请填写文章 ID。");
    const data = await requestBlog(site, `/posts/${encodeURIComponent(body.postId)}`, { method: "GET" });
    sendJson(response, 200, { ok: true, post: normalizeBlogPost(data, { includeContent: true }), data });
    return true;
  }

  if (pathname === "/api/blog-sites/upload") {
    const site = getBlogSite(body.siteId, { includeSecrets: true });
    const result = await uploadArticles(site, [body.content || ""], {
      status: body.status,
      author: body.author,
      categoryId: body.categoryId,
      coverUrl: body.coverUrl,
      slug: body.slug,
    });
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === "/api/blog-sites/batch-upload") {
    const site = getBlogSite(body.siteId, { includeSecrets: true });
    const contents = await uploadContentsFromBody(body);
    const result = await uploadArticles(site, contents, body.override || {});
    sendJson(response, 200, result);
    return true;
  }

  sendJson(response, 404, { error: "Blog site endpoint not found" });
  return true;
}
