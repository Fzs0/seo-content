import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteWpSite, getWpSite, normalizeSiteUrl, readWpSites, saveWpSite } from "../wp-sites-store.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";
import { enrichMarkdownWithImages } from "./images.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const generatedArticlesRoot = normalize(join(projectRoot, "generated-articles"));

function authHeader(site) {
  const token = Buffer.from(`${site.username}:${site.applicationPassword}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function wpApiUrl(site, path) {
  return `${normalizeSiteUrl(site.siteUrl)}/wp-json/wp/v2${path}`;
}

function siteRootUrl(site) {
  return normalizeSiteUrl(site.siteUrl);
}

function publicRequestHeaders(options = {}) {
  return {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEO-Workbench/0.2",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
}

function wpRequestHeaders(site, options = {}) {
  return {
    ...publicRequestHeaders(options),
    Authorization: authHeader(site),
    ...(options.headers || {}),
  };
}

function wpConnectionError(apiUrl, error) {
  const reason = error?.cause?.message || error?.message || "unknown network error";
  return new Error(
    [
      `无法连接 WordPress REST API：${reason}`,
      `当前测试地址：${apiUrl}`,
      "如果是 read ECONNRESET，通常表示远端服务器、主机安全规则、Cloudflare 或 WordPress 安全插件主动断开了连接。",
      "请确认站点地址填写的是网站首页域名，不是 /wp-admin；并检查 HTTPS 证书、/wp-json/wp/v2 是否可访问、REST API 是否被安全插件/WAF 拦截。",
    ].join("\n")
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(text = "") {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractH2Block(content, pattern) {
  const regex = new RegExp(`^##\\s+${pattern}\\s*$`, "im");
  const match = regex.exec(content);
  if (!match) return "";

  const start = match.index;
  const afterHeading = start + match[0].length;
  const rest = content.slice(afterHeading);
  const next = rest.search(/\n(?:#\s+|##\s+)/);
  const end = next >= 0 ? afterHeading + next : content.length;
  return content.slice(start, end).trim();
}

function extractH2Value(content, pattern) {
  const block = extractH2Block(content, pattern);
  if (!block) return "";
  return block.replace(/^##\s+.*$/m, "").trim();
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
  const value = rest.slice(0, next >= 0 ? next : undefined).trim();
  return value.replace(/^[:：]\s*/, "").trim();
}

function splitKeywords(value = "") {
  return String(value || "")
    .split(/[,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractArticleBody(content) {
  const markdown = String(content || "").trim();
  const firstH1 = markdown.search(/^#\s+/m);
  const bodyStart = firstH1 >= 0 ? firstH1 : 0;
  const publishCutPatterns = ["Image Placement Map", "Internal Link Suggestions", "Evidence Needed", "Content QA Checklist"];
  const cutPositions = publishCutPatterns
    .map((pattern) => new RegExp(`^##\\s+${pattern}\\s*$`, "im").exec(markdown)?.index ?? -1)
    .filter((index) => index >= bodyStart);
  const bodyEnd = cutPositions.length ? Math.min(...cutPositions) : markdown.length;
  return markdown.slice(bodyStart, bodyEnd).trim();
}

function articleMetaFromMarkdown(content) {
  const markdown = String(content || "");
  const title = extractSectionValue(markdown, "Title") || markdown.match(/^#\s+(.+)$/m)?.[1] || "Untitled";
  const metaTitle = extractSectionValue(markdown, "Meta Title") || title;
  const metaDescription = extractSectionValue(markdown, "Meta Description");
  const primaryKeyword = extractSectionValue(markdown, "Primary Keyword");
  const secondaryKeywords = splitKeywords(extractSectionValue(markdown, "Secondary Keywords"));
  const slug = extractSectionValue(markdown, "URL Slug")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    title,
    metaTitle,
    metaDescription,
    primaryKeyword,
    secondaryKeywords,
    slug,
    body: extractArticleBody(markdown),
  };
}

function wpParagraphBlock(text = "") {
  return `<!-- wp:paragraph -->\n<p>${inlineMarkdown(text)}</p>\n<!-- /wp:paragraph -->`;
}

function wpHeadingBlock(level, text = "") {
  const safeLevel = Math.min(6, Math.max(2, Number(level) || 2));
  const attrs = safeLevel === 2 ? "" : ` ${JSON.stringify({ level: safeLevel })}`;
  return `<!-- wp:heading${attrs} -->\n<h${safeLevel}>${inlineMarkdown(text)}</h${safeLevel}>\n<!-- /wp:heading -->`;
}

function wpListBlock(items = [], ordered = false) {
  const tag = ordered ? "ol" : "ul";
  const attrs = ordered ? ` ${JSON.stringify({ ordered: true })}` : "";
  const htmlItems = items.map((item) => `<!-- wp:list-item --><li>${inlineMarkdown(item)}</li><!-- /wp:list-item -->`).join("");
  return `<!-- wp:list${attrs} -->\n<${tag}>${htmlItems}</${tag}>\n<!-- /wp:list -->`;
}

function wpQuoteBlock(lines = []) {
  return `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>${inlineMarkdown(lines.join(" "))}</p></blockquote>\n<!-- /wp:quote -->`;
}

function wpImageBlock(alt = "", url = "") {
  return `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"/></figure>\n<!-- /wp:image -->`;
}

function markdownTableToWpBlock(lines = []) {
  const rows = lines
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((row) => row.length > 1);
  if (rows.length < 2) return "";

  const header = rows[0];
  const bodyRows = rows.slice(2);
  const thead = `<thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<!-- wp:table -->\n<figure class="wp-block-table"><table>${thead}${tbody}</table></figure>\n<!-- /wp:table -->`;
}

function markdownToWpBlocks(markdown = "", { stripLeadingH1 = true } = {}) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let sawContent = false;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(wpParagraphBlock(paragraph.join(" ")));
    sawContent = true;
    paragraph = [];
  }

  function collectWhile(startIndex, matcher) {
    const collected = [];
    let index = startIndex;
    while (index < lines.length) {
      const matched = matcher(lines[index]);
      if (!matched) break;
      collected.push(matched);
      index += 1;
    }
    return { collected, nextIndex: index };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const image = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/.exec(line);
    if (image) {
      flushParagraph();
      blocks.push(wpImageBlock(image[1], image[2]));
      sawContent = true;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const originalLevel = heading[1].length;
      if (stripLeadingH1 && !sawContent && originalLevel === 1) {
        sawContent = true;
        continue;
      }
      blocks.push(wpHeadingBlock(originalLevel, heading[2]));
      sawContent = true;
      continue;
    }

    if (/^\|.+\|$/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      flushParagraph();
      const tableLines = [line, lines[index + 1]];
      let tableIndex = index + 2;
      while (tableIndex < lines.length && /^\|.+\|$/.test(lines[tableIndex].trim())) {
        tableLines.push(lines[tableIndex].trim());
        tableIndex += 1;
      }
      const tableBlock = markdownTableToWpBlock(tableLines);
      if (tableBlock) blocks.push(tableBlock);
      sawContent = true;
      index = tableIndex - 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      const { collected, nextIndex } = collectWhile(index, (value) => /^[-*]\s+(.+)$/.exec(value.trim())?.[1]);
      blocks.push(wpListBlock(collected, false));
      sawContent = true;
      index = nextIndex - 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const { collected, nextIndex } = collectWhile(index, (value) => /^\d+\.\s+(.+)$/.exec(value.trim())?.[1]);
      blocks.push(wpListBlock(collected, true));
      sawContent = true;
      index = nextIndex - 1;
      continue;
    }

    if (/^>\s+/.test(line)) {
      flushParagraph();
      const { collected, nextIndex } = collectWhile(index, (value) => /^>\s+(.+)$/.exec(value.trim())?.[1]);
      blocks.push(wpQuoteBlock(collected));
      sawContent = true;
      index = nextIndex - 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      blocks.push(`<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`);
      sawContent = true;
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.join("\n\n");
}

function rankMathMetaPayload(meta) {
  const focusKeywords = [meta.primaryKeyword, ...(meta.secondaryKeywords || [])].filter(Boolean).join(", ");
  return Object.fromEntries(
    [
      ["rank_math_title", meta.metaTitle || meta.title],
      ["rank_math_description", meta.metaDescription],
      ["rank_math_focus_keyword", focusKeywords],
    ].filter(([, value]) => String(value || "").trim()),
  );
}

async function createPostWithRankMathFallback(site, payload) {
  if (!payload.meta || !Object.keys(payload.meta).length) {
    const post = await requestWp(site, "/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { post, rankMathMetaApplied: false, rankMathMetaError: "" };
  }

  try {
    const post = await requestWp(site, "/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { post, rankMathMetaApplied: true, rankMathMetaError: "" };
  } catch (error) {
    if (!/meta|rank_math|rest_invalid_param|invalid parameter|not a valid property/i.test(error.message || "")) {
      throw error;
    }

    const fallbackPayload = { ...payload };
    delete fallbackPayload.meta;
    const post = await requestWp(site, "/posts", {
      method: "POST",
      body: JSON.stringify(fallbackPayload),
    });
    return { post, rankMathMetaApplied: false, rankMathMetaError: error.message };
  }
}

async function requestWp(site, path, options = {}) {
  const result = await requestWpFull(site, path, options);
  return result.data;
}

async function requestWpFull(site, path, options = {}) {
  const targetUrl = wpApiUrl(site, path);
  let response;
  try {
    response = await fetch(targetUrl, {
      ...options,
      headers: wpRequestHeaders(site, options),
    });
  } catch (error) {
    throw wpConnectionError(targetUrl, error);
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data.message || data.error || `WordPress API returned ${response.status}`);
  }
  return {
    data,
    status: response.status,
    headers: response.headers,
  };
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
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWpPost(post = {}, { includeContent = false } = {}) {
  const title = stripHtml(post.title?.rendered || post.title || "");
  const excerpt = stripHtml(post.excerpt?.rendered || post.excerpt || "");
  const contentText = stripHtml(post.content?.rendered || post.content || "");

  return {
    id: post.id,
    date: post.date,
    modified: post.modified,
    slug: post.slug || "",
    status: post.status || "",
    link: post.link || "",
    title,
    excerpt,
    contentPreview: contentText.slice(0, 900),
    wordApprox: contentText ? contentText.split(/\s+/).filter(Boolean).length : 0,
    categories: post.categories || [],
    tags: post.tags || [],
    author: post.author || "",
    ...(includeContent ? { contentText } : {}),
  };
}

async function listWpPosts(site, options = {}) {
  const perPage = Math.min(100, Math.max(1, Number(options.perPage || 100)));
  const maxPages = Math.min(50, Math.max(1, Number(options.maxPages || 20)));
  const includeContent = Boolean(options.includeContent);
  const status = options.status || "publish,draft,pending,future,private";
  const posts = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;

  while (page <= totalPages && page <= maxPages) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      status,
      context: "edit",
      _fields: "id,date,modified,slug,status,link,title,excerpt,content,categories,tags,author",
    });
    const result = await requestWpFull(site, `/posts?${params.toString()}`, { method: "GET" });
    const data = Array.isArray(result.data) ? result.data : [];
    total = Number(result.headers.get("x-wp-total") || total || data.length);
    totalPages = Number(result.headers.get("x-wp-totalpages") || totalPages || 1);
    posts.push(...data.map((post) => normalizeWpPost(post, { includeContent })));
    page += 1;
  }

  return {
    ok: true,
    total,
    fetched: posts.length,
    totalPages,
    maxPages,
    truncated: page <= totalPages,
    posts,
  };
}

function compactBody(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

async function diagnosticFetch(label, url, options = {}, expectedStatuses = [200]) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: options.headers || publicRequestHeaders(options),
    });
    const text = await response.text();
    return {
      label,
      url,
      ok: expectedStatuses.includes(response.status) || response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") || "",
      elapsedMs: Date.now() - startedAt,
      bodyPreview: compactBody(text),
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      networkError: true,
      error: error?.cause?.message || error?.message || "unknown network error",
      elapsedMs: Date.now() - startedAt,
    };
  }
}

function buildDiagnosisConclusion(steps = []) {
  const publicRest = steps.find((step) => step.key === "publicRest");
  const unauthUser = steps.find((step) => step.key === "unauthUser");
  const authUser = steps.find((step) => step.key === "authUser");

  if (authUser?.ok) return "应用密码认证成功，可以继续上传文章。";

  if (publicRest?.ok && authUser?.networkError) {
    return [
      "公开 REST API 正常，但带应用密码的认证请求被远端断开。",
      "重点检查 Cloudflare/WAF/主机 ModSecurity/WordPress 安全插件是否拦截 Authorization: Basic 请求，或是否禁用了 Application Password。",
    ].join("\n");
  }

  if (authUser?.status === 401) {
    return "认证接口返回 401：优先检查用户名、应用密码是否正确，应用密码中间的空格可以保留也可以去掉，但不要使用登录密码。";
  }

  if (authUser?.status === 403) {
    return "认证接口返回 403：账号权限、安全插件、REST API 权限或 WAF 规则可能拒绝了当前用户。";
  }

  if (!publicRest?.ok) {
    return "公开 REST API 本身没有通过本地服务访问，先检查站点地址、HTTPS、DNS、主机防火墙或 Cloudflare。";
  }

  if (!unauthUser?.ok) {
    return "公开 REST 根接口正常，但 users/me 接口异常，可能是 WordPress 安全插件限制了用户相关 REST 接口。";
  }

  return "诊断完成，但失败点不典型。请把下方分步结果发给主机商或检查安全插件日志。";
}

async function diagnoseWpSite(site) {
  const root = siteRootUrl(site);
  const steps = [];

  steps.push({
    key: "home",
    ...(await diagnosticFetch("站点首页", root, { method: "GET", headers: publicRequestHeaders() })),
  });
  steps.push({
    key: "publicRest",
    ...(await diagnosticFetch("公开 REST 根接口", `${root}/wp-json/wp/v2`, {
      method: "GET",
      headers: publicRequestHeaders(),
    })),
  });
  steps.push({
    key: "unauthUser",
    ...(await diagnosticFetch(
      "用户接口（不带应用密码，预期 401 JSON）",
      `${root}/wp-json/wp/v2/users/me?context=edit`,
      { method: "GET", headers: publicRequestHeaders() },
      [401],
    )),
  });
  steps.push({
    key: "authUser",
    ...(await diagnosticFetch("用户接口（带应用密码）", wpApiUrl(site, "/users/me?context=edit"), {
      method: "GET",
      headers: wpRequestHeaders(site),
    })),
  });

  return {
    ok: steps.at(-1)?.ok || false,
    conclusion: buildDiagnosisConclusion(steps),
    steps,
  };
}

async function testWpSite(site) {
  const data = await requestWp(site, "/users/me?context=edit", { method: "GET" });
  return {
    ok: true,
    user: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      roles: data.roles || [],
    },
  };
}

function siteForTest(incoming = {}) {
  if (incoming.id && !incoming.applicationPassword) {
    const existing = getWpSite(incoming.id, { includeSecrets: true });
    return {
      ...existing,
      ...incoming,
      applicationPassword: existing.applicationPassword,
      siteUrl: incoming.siteUrl || existing.siteUrl,
      username: incoming.username || existing.username,
    };
  }

  return incoming;
}

async function uploadArticle(site, content, override = {}) {
  const meta = articleMetaFromMarkdown(content);
  const status = override.status || site.defaultStatus || "draft";
  const categoryId = override.categoryId || site.defaultCategoryId || "";
  const payload = {
    title: override.title || meta.title,
    content: markdownToWpBlocks(meta.body, { stripLeadingH1: true }),
    status,
    slug: override.slug || meta.slug || undefined,
    excerpt: meta.metaDescription || undefined,
    meta: rankMathMetaPayload(meta),
  };

  if (categoryId) payload.categories = [Number(categoryId)].filter(Number.isFinite);

  const { post, rankMathMetaApplied, rankMathMetaError } = await createPostWithRankMathFallback(site, payload);

  return {
    ok: true,
    postId: post.id,
    status: post.status,
    link: post.link,
    editLink: `${site.siteUrl.replace(/\/+$/g, "")}/wp-admin/post.php?post=${post.id}&action=edit`,
    title: meta.title,
    slug: payload.slug,
    contentFormat: "wordpress_blocks",
    rankMathMetaApplied,
    rankMathMetaError,
    seoFields: {
      title: meta.metaTitle || meta.title,
      description: meta.metaDescription,
      focusKeyword: payload.meta?.rank_math_focus_keyword || "",
    },
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

async function enrichContentsForUpload(contents = [], body = {}) {
  if (!body.enrichImages) return contents;
  const imageKeywords = Array.isArray(body.imageKeywords) ? body.imageKeywords : [];
  const itemOverrides = Array.isArray(body.override?.items) ? body.override.items : [];
  const warnings = [];
  const enriched = [];

  for (let index = 0; index < contents.length; index += 1) {
    const content = contents[index];
    try {
      const result = await enrichMarkdownWithImages({
        markdown: content,
        keyword: imageKeywords[index] || itemOverrides[index]?.title || "",
        provider: body.imageProvider || "auto",
        maxImages: body.maxImagesPerArticle || 2,
      });
      enriched.push(result.markdown || content);
      warnings.push(...(result.warnings || []).map((warning) => `#${index + 1}: ${warning}`));
    } catch (error) {
      enriched.push(content);
      warnings.push(`#${index + 1}: ${error.message}`);
    }
  }

  body.imageWarnings = warnings;
  return enriched;
}

async function uploadArticles(site, contents = [], override = {}) {
  const created = [];
  const failed = [];
  const items = contents.filter((content) => String(content || "").trim());
  if (!items.length) throw new Error("没有可上传的 Markdown 文章。");

  for (let index = 0; index < items.length; index += 1) {
    const itemOverride = Array.isArray(override.items) ? override.items[index] || {} : {};
    try {
      const result = await uploadArticle(site, items[index], {
        ...override,
        ...itemOverride,
      });
      created.push({ index, ...result });
    } catch (error) {
      failed.push({
        index,
        title: itemOverride.title || "",
        slug: itemOverride.slug || "",
        error: error.message,
      });
    }
  }

  return {
    ok: failed.length === 0,
    requested: items.length,
    created,
    failed,
  };
}

export async function handleWpSitesRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/wp-sites") {
    sendJson(response, 200, { sites: readWpSites() });
    return true;
  }

  if (request.method !== "POST") {
    methodNotAllowed(response);
    return true;
  }

  const body = await readJson(request);

  if (pathname === "/api/wp-sites/save") {
    const site = saveWpSite(body.site || {});
    sendJson(response, 200, { site, sites: readWpSites(), saved: true });
    return true;
  }

  if (pathname === "/api/wp-sites/delete") {
    sendJson(response, 200, { sites: deleteWpSite(body.siteId), deleted: true });
    return true;
  }

  if (pathname === "/api/wp-sites/test") {
    const site = body.site?.siteUrl ? siteForTest(body.site) : getWpSite(body.siteId, { includeSecrets: true });
    const result = await testWpSite(site);
    const savedSite = body.site?.siteUrl ? saveWpSite(body.site) : getWpSite(site.id);
    sendJson(response, 200, { ...result, site: savedSite });
    return true;
  }

  if (pathname === "/api/wp-sites/diagnose") {
    const site = body.site?.siteUrl ? siteForTest(body.site) : getWpSite(body.siteId, { includeSecrets: true });
    const result = await diagnoseWpSite(site);
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === "/api/wp-sites/posts") {
    const site = body.site?.siteUrl ? siteForTest(body.site) : getWpSite(body.siteId, { includeSecrets: true });
    const result = await listWpPosts(site, {
      perPage: body.perPage,
      maxPages: body.maxPages,
      includeContent: body.includeContent,
      status: body.status,
    });
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === "/api/wp-sites/post") {
    const site = getWpSite(body.siteId, { includeSecrets: true });
    if (!body.postId) throw new Error("请填写 WordPress 文章 ID。");
    const params = new URLSearchParams({
      context: "edit",
      _fields: "id,date,modified,slug,status,link,title,excerpt,content,categories,tags,author",
    });
    const post = await requestWp(site, `/posts/${encodeURIComponent(body.postId)}?${params.toString()}`, { method: "GET" });
    sendJson(response, 200, { ok: true, post: normalizeWpPost(post, { includeContent: true }) });
    return true;
  }

  if (pathname === "/api/wp-sites/upload") {
    const site = getWpSite(body.siteId, { includeSecrets: true });
    const uploadBody = {
      ...body,
      imageKeywords: [body.imageKeyword || body.title || ""],
    };
    const contents = await enrichContentsForUpload([body.content || ""], uploadBody);
    const result = await uploadArticle(site, contents[0] || body.content || "", {
      status: body.status,
      categoryId: body.categoryId,
      slug: body.slug,
    });
    sendJson(response, 200, { ...result, imageWarnings: uploadBody.imageWarnings || [] });
    return true;
  }

  if (pathname === "/api/wp-sites/batch-upload") {
    const site = getWpSite(body.siteId, { includeSecrets: true });
    const contents = await enrichContentsForUpload(await uploadContentsFromBody(body), body);
    const result = await uploadArticles(site, contents, body.override || {});
    sendJson(response, 200, { ...result, imageWarnings: body.imageWarnings || [] });
    return true;
  }

  sendJson(response, 404, { error: "WordPress endpoint not found" });
  return true;
}
