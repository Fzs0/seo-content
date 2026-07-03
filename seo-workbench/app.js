"use strict";

const $ = (id) => document.getElementById(id);

const FALLBACK_SITES = ["全部", "主站-集合页", "主站-博客", "博客A-知识教程", "博客B-场景人群", "博客C-对比评测", "暂不做"];

const AI_STAGE_DEFS = {
  keywordAnalysis: {
    label: "关键词分析",
    hint: "用于复核关键词清单，输出需要人工确认的点和规则建议。关键词表本身仍以本地规则结果为准。",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    endpoint: "/api/generate",
    temperature: 0.2,
  },
  productExtraction: {
    label: "产品资产提取",
    hint: "用于从产品 API 返回的大量原始数据中提取标准产品卡片、商业承接页和可用于文章内链的锚文本提示。提取结果会缓存，不需要每次重复消耗 AI。",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    endpoint: "/api/generate",
    temperature: 0.1,
  },
  briefGeneration: {
    label: "AI 增强 Brief",
    hint: "先用本地 SEO 标准生成基准 Brief，再让外部模型补强搜索意图、结构、证据缺口和内链计划。",
    provider: "local",
    apiFormat: "local",
    baseUrl: "",
    model: "local-workflow",
    endpoint: "/api/generate",
    temperature: 0.2,
  },
  articleGeneration: {
    label: "文章生成",
    hint: "用于生成完整 Markdown 文章。适合接 OpenAI、Claude 或你认为质量最高的模型。",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    endpoint: "/api/generate",
    temperature: 0.7,
  },
  contentOptimization: {
    label: "内容优化",
    hint: "用于重写、扩写、改标题、补 FAQ、补内链和做最终审核。",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    endpoint: "/api/generate",
    temperature: 0.35,
  },
  siteDiagnosis: {
    label: "站点内容诊断",
    hint: "用于审核已发布文章：主题覆盖、关键词冲突、薄内容、内链缺口、更新优先级和下一批内容机会。推荐使用 OpenAI 或 OpenAI 兼容中转站。",
    provider: "openai",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    endpoint: "/api/generate",
    temperature: 0.2,
  },
};

const PROVIDERS = ["local", "deepseek", "openai", "claude", "gemini", "qwen", "volcengine", "custom"];
const API_FORMATS = [
  ["local", "Local / Mock"],
  ["openai-compatible", "OpenAI 兼容中转站"],
  ["raw-proxy", "自定义 Raw Proxy"],
];
const WORKSPACE_DRAFT_KEY = "seo-workbench.workspaceDraft.v1";
const CUSTOM_OPTION_VALUE = "__custom__";
const CONTENT_HUB_AUTO_RELOAD_TTL_MS = 5 * 60 * 1000;

const contentHubLoadState = {
  requestKey: "",
  promise: null,
  lastLoadedKey: "",
  lastLoadedAt: 0,
  sequence: 0,
};

const busyActionIds = new Set();

const state = {
  project: {},
  standard: null,
  standardDirty: false,
  keywords: [],
  sites: FALLBACK_SITES,
  selectedId: null,
  filter: "全部",
  tablePage: 1,
  pageSize: 50,
  brief: "",
  prompt: "",
  article: "",
  articleParts: null,
  articleSave: null,
  aiStages: loadAiStages(),
  wpSites: [],
  selectedWpSiteId: "",
  wpPosts: [],
  wpDiagnosis: "",
  blogSites: [],
  selectedBlogSiteId: "",
  blogPosts: [],
  blogDiagnosis: "",
  mainSites: [],
  selectedMainSiteId: "",
  mainPosts: [],
  mainDiagnosis: "",
  googleDataSources: [],
  selectedGoogleDataSourceId: "",
  googleReviewData: null,
  googleReviewCache: {},
  imageConfig: null,
  productAssets: null,
  activePage: "setup",
  contentHub: {
    source: "blog",
    selectedSiteKey: "",
    posts: [],
    opportunities: [],
    selectedIds: [],
    activeOpportunity: null,
    generatedArticles: [],
    lastBatchId: "",
    lastBatchSiteKey: "",
    lastBatchLabel: "",
    noMainOutboundLinks: true,
    showIncompatibleSites: false,
    opportunityPage: 1,
    opportunityPageSize: 25,
    lastSummary: null,
  },
  todos: [],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const PAGE_CONFIG = {
  setup: ["project", "standard", "ai-stages"],
  keywords: ["keywords", "allocation"],
  intelligence: ["content-hub"],
  review: ["review-data"],
  production: ["brief", "generation"],
  publishing: ["exports"],
  todos: ["todos"],
};

const PAGE_ROUTES = {
  "/": "setup",
  "/page-setup": "setup",
  "/page-keywords": "keywords",
  "/page-intelligence": "intelligence",
  "/page-review": "review",
  "/page-production": "production",
  "/page-publishing": "publishing",
  "/page-todos": "todos",
};

function routeForPage(page = "setup") {
  return Object.entries(PAGE_ROUTES).find(([, value]) => value === page && value !== "setup")?.[0] || "/page-setup";
}

function pageForSection(sectionId = "") {
  return Object.entries(PAGE_CONFIG).find(([, sections]) => sections.includes(sectionId))?.[0] || "setup";
}

function applyActivePage(page = state.activePage) {
  const nextPage = PAGE_CONFIG[page] ? page : "setup";
  state.activePage = nextPage;
  document.body.dataset.page = nextPage;

  const visible = new Set(PAGE_CONFIG[nextPage]);
  document.querySelectorAll("main.content > section").forEach((section) => {
    const alwaysVisible =
      nextPage !== "review" && (section.classList.contains("hero") || section.classList.contains("metric-grid"));
    section.classList.toggle("content-page-hidden", !alwaysVisible && !visible.has(section.id));
  });

  document.querySelectorAll("[data-page-target]").forEach((link) => {
    link.classList.toggle("active", link.dataset.pageTarget === nextPage);
  });
}

function activatePageForLocation() {
  const hash = window.location.hash;
  const cleanHash = String(hash || "").replace(/^#/, "");
  if (cleanHash.startsWith("page-")) {
    applyActivePage(cleanHash.replace(/^page-/, ""));
    return;
  }

  if (cleanHash && document.getElementById(cleanHash)) {
    applyActivePage(pageForSection(cleanHash));
    requestAnimationFrame(() => document.getElementById(cleanHash)?.scrollIntoView({ block: "start" }));
    return;
  }

  const pathname = window.location.pathname.replace(/\/+$/g, "") || "/";
  const routePage = PAGE_ROUTES[pathname];
  if (routePage) {
    applyActivePage(routePage);
    return;
  }

  applyActivePage(state.activePage || "setup");
}

async function api(path, payload = null) {
  const options = payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : {};
  const response = await fetch(path, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `${path} returned ${response.status}`);
  return data;
}

function imageKeywordForCurrentArticle() {
  const markdown = String(state.article || "");
  return (
    /^##\s+Primary Keyword\s*:\s*(.+)$/im.exec(markdown)?.[1]?.trim() ||
    extractH2Value(markdown, "Primary Keyword") ||
    selectedItem()?.keyword ||
    state.articleParts?.title ||
    ""
  );
}

function imageUploadOptions() {
  const enrichImages = $("imageEnrichOnUploadInput")?.value !== "0";
  const provider = $("imageProviderInput")?.value || "auto";
  const maxImagesPerArticle = Number($("imageMaxImagesInput")?.value || 2);
  return {
    enrichImages,
    imageProvider: provider,
    maxImagesPerArticle,
    imageKeyword: imageKeywordForCurrentArticle(),
  };
}

function renderImageConfig() {
  const config = state.imageConfig || {};
  if ($("imageProviderInput") && config.defaultProvider && $("imageProviderInput").value === "auto") {
    $("imageProviderInput").value = config.defaultProvider || "auto";
  }

  const providers = config.providers || {};
  const lines = ["图片源状态："]
    .concat(
      ["pexels", "unsplash", "pixabay"].map((provider) => {
        const item = providers[provider] || {};
        return `- ${provider}: ${item.enabled ? `已配置 ${item.source || ""} ${item.keyPreview || ""}`.trim() : "未配置"}`;
      }),
    );
  $("imageConfigStatus").textContent = config.providers
    ? lines.join("  ")
    : "图片 API 尚未读取。Pexels Key 可保存到服务端本地配置。";
}

async function loadImageConfig() {
  state.imageConfig = await api("/api/images/config");
  renderImageConfig();
}

function renderProductAssets() {
  const view = $("productAssetsView");
  if (!view) return;
  const assets = state.productAssets || {};
  const products = Array.isArray(assets.products) ? assets.products : [];
  const endpointInput = $("productApiEndpointInput");
  const savedEndpoint = assets.api?.endpoint || "";
  if (endpointInput && savedEndpoint && !endpointInput.value.trim()) endpointInput.value = savedEndpoint;
  if ($("productApiHeadersInput")) {
    $("productApiHeadersInput").placeholder = assets.api?.headersSet
      ? `已保存请求头：${assets.api.headersPreview || "已隐藏"}，留空则继续使用`
      : 'Authorization: Bearer xxx\n也支持 {"Authorization":"Bearer xxx"}';
  }

  if (!products.length) {
    view.innerHTML = `<article class="diagnosis-card"><h4>产品资产库为空</h4><p>可以手动填写商业页面，也可以保存产品 API 后点击“AI 提取产品资产”。提取结果会缓存到本机服务端。</p></article>`;
    return;
  }

  view.innerHTML = `
    <article class="diagnosis-card diagnosis-card-wide">
      <h4>已缓存 ${products.length} 个产品资产</h4>
      <p>最近提取：${escapeHtml(assets.extractedAt || assets.updatedAt || "未记录")}。这些产品可作为主站商业承接页、文章内链和 Brief 里的产品证据候选。</p>
      <div class="product-asset-grid">
        ${products.slice(0, 12).map((product) => `
          <div class="product-asset-card">
            <strong>${escapeHtml(product.title || product.name || "Untitled product")}</strong>
            <span>${escapeHtml(product.category || product.handle || "")}</span>
            <code>${escapeHtml(product.url || product.commercialPageHint || product.handle || "")}</code>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

async function loadProductAssets() {
  state.productAssets = await api("/api/products");
  renderProductAssets();
  const count = state.productAssets?.products?.length || 0;
  if ($("productAssetsStatus")) {
    $("productAssetsStatus").textContent = count
      ? `已读取缓存产品资产 ${count} 个。`
      : "还没有缓存产品资产；可以保存产品 API 后提取一次。";
  }
}

function readProductApiForm() {
  return {
    endpoint: $("productApiEndpointInput")?.value.trim() || "",
    method: "GET",
    headersText: $("productApiHeadersInput")?.value.trim() || "",
  };
}

async function saveProductApiConfig() {
  $("productAssetsStatus").textContent = "正在保存产品 API 配置...";
  state.productAssets = await api("/api/products/config", { api: readProductApiForm() });
  if ($("productApiHeadersInput")) $("productApiHeadersInput").value = "";
  renderProductAssets();
  $("productAssetsStatus").textContent = "已保存产品 API 配置到服务端本地缓存。";
}

async function extractProductAssets() {
  $("productAssetsStatus").textContent = "正在拉取产品 API，并调用 AI 提取产品资产...";
  const stage = state.aiStages.productExtraction || state.aiStages.keywordAnalysis || {};
  const data = await api("/api/products/extract", {
    project: readProject(),
    api: readProductApiForm(),
    stageConfig: stageConfigForRequest(stage),
    useAi: true,
  });
  state.productAssets = data;
  renderProductAssets();
  $("productAssetsStatus").textContent = data.ai?.configured
    ? `已从 ${data.fetched || 0} 条原始数据中提取 ${data.extracted || 0} 个产品资产，并已缓存。`
    : `已用本地规则从 ${data.fetched || 0} 条原始数据中提取 ${data.extracted || 0} 个产品资产；如需 AI 精提，请配置“产品资产提取”阶段。`;
}

function productAssetLines(products = state.productAssets?.products || []) {
  return products
    .map((product) => product.commercialPageHint || product.url || product.handle || "")
    .filter(Boolean)
    .map((url) => String(url).trim())
    .filter(Boolean);
}

function syncProductsToMainPages() {
  const lines = productAssetLines();
  if (!lines.length) {
    $("productAssetsStatus").textContent = "还没有可回填的产品 URL。请先提取产品资产。";
    return;
  }
  const current = $("mainPagesInput").value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const next = Array.from(new Set([...current, ...lines]));
  $("mainPagesInput").value = next.join("\n");
  state.project = readProject();
  $("productAssetsStatus").textContent = `已回填 ${next.length - current.length} 个新的商业页面到“主站商业页面”。`;
  saveWorkspaceDraft("产品资产已回填到主站商业页面。");
}

async function saveImageConfig() {
  const provider = $("imageProviderInput").value === "auto" ? "pexels" : $("imageProviderInput").value;
  const apiKey = $("imageApiKeyInput").value.trim();
  const data = await api("/api/images/config", {
    defaultProvider: $("imageProviderInput").value || "auto",
    provider,
    apiKey,
    clearApiKey: $("clearImageApiKeyInput").checked,
  });
  state.imageConfig = data.config;
  $("imageApiKeyInput").value = "";
  $("clearImageApiKeyInput").checked = false;
  renderImageConfig();
  $("imageConfigStatus").textContent = `图片配置已保存。${provider}：${state.imageConfig.providers?.[provider]?.enabled ? "已配置" : "未配置"}`;
}

async function testImageSearch() {
  const query = $("imageTestQueryInput").value.trim() || imageKeywordForCurrentArticle();
  if (!query) {
    $("imageTestQueryInput").focus();
    $("imageConfigStatus").textContent = "请先填写测试关键词，或先生成一篇文章。";
    return;
  }

  $("imageConfigStatus").textContent = `正在搜索图片：${query}`;
  const data = await api("/api/images/search", {
    query,
    provider: $("imageProviderInput").value || "auto",
    perPage: 4,
  });
  $("imageSearchOutput").textContent = JSON.stringify(
    {
      provider: data.provider,
      query: data.query,
      images: (data.images || []).map((image) => ({
        alt: image.alt,
        url: image.url,
        sourceUrl: image.sourceUrl,
        photographer: image.photographer,
      })),
      errors: data.errors || [],
    },
    null,
    2,
  );
  $("imageConfigStatus").textContent = data.images?.length
    ? `搜图成功：${data.provider} 返回 ${data.images.length} 张。上传时会自动选第一张匹配图。`
    : `没有搜到图片：${(data.errors || []).join("；") || "无结果"}`;
}

function requestId(prefix = "req") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setActionEnabled(id, enabled, reason = "") {
  const control = $(id);
  if (!control) return;
  const wasDisabled = control.classList.contains("is-disabled");
  const isBusy = busyActionIds.has(id);
  const shouldEnable = enabled && !isBusy;
  control.disabled = !shouldEnable;
  control.classList.toggle("is-disabled", !shouldEnable);
  control.setAttribute("aria-disabled", shouldEnable ? "false" : "true");
  if (isBusy) {
    control.title = "正在处理，请稍等。";
  } else if (!enabled && reason) {
    control.title = reason;
  } else if (enabled && wasDisabled) {
    control.removeAttribute("title");
  }
}

async function withButtonBusy(id, task) {
  const button = $(id);
  if (!button) return task();
  const originalText = button.textContent;
  busyActionIds.add(id);
  button.disabled = true;
  button.classList.add("is-busy");
  button.textContent = "处理中...";
  try {
    return await task();
  } finally {
    busyActionIds.delete(id);
    button.classList.remove("is-busy");
    button.textContent = originalText;
    updateActionStates();
  }
}

function confirmAction(message) {
  return window.confirm(message);
}

function readSelectOrCustom(selectId, customInputId) {
  const selected = $(selectId).value;
  return selected === CUSTOM_OPTION_VALUE ? $(customInputId).value.trim() : selected.trim();
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

function normalizeWpSiteUrl(siteUrl = "") {
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

function normalizeBlogApiBaseUrl(apiBaseUrl = "") {
  let value = String(apiBaseUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `https://${value}`;

  try {
    const url = new URL(value);
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
    return value.replace(/\/+$/g, "");
  }
}

const SEO_LOCALE_PRESETS = {
  US: ["United States", "US", "us", "en", "English", "en", "us"],
  UK: ["United Kingdom", "GB", "uk", "en", "English", "en", "uk"],
  CA: ["Canada", "CA", "ca", "en", "English", "en", "ca"],
  AU: ["Australia", "AU", "au", "en", "English", "en", "au"],
  DE: ["Germany", "DE", "de", "de", "German", "de", "de"],
  FR: ["France", "FR", "fr", "fr", "French", "fr", "fr"],
  JP: ["Japan", "JP", "jp", "ja", "Japanese", "ja", "jp"],
  GLOBAL: ["Global", "GLOBAL", "", "en", "English", "en", ""],
  EU: ["European Union", "EU", "", "", "Multilingual", "multi", ""],
};

const SEO_LANGUAGE_PRESETS = {
  english: ["English", "en", "en"],
  german: ["German", "de", "de"],
  french: ["French", "fr", "fr"],
  japanese: ["Japanese", "ja", "ja"],
  spanish: ["Spanish", "es", "es"],
  italian: ["Italian", "it", "it"],
  portuguese: ["Portuguese", "pt", "pt"],
  dutch: ["Dutch", "nl", "nl"],
  multilingual: ["Multilingual", "multi", ""],
};

function resolveSeoLocale(marketValue = "") {
  const rawMarket = String(marketValue || "").trim();
  if (!rawMarket) {
    return {
      configured: false,
      rawMarket,
      market: "",
      countryCode: "",
      googleGl: "",
      googleHl: "",
      language: "",
      languageCode: "",
      semrushDatabase: "",
      warning: "Target market is not selected.",
    };
  }

  const [countryPart = "", languagePart = ""] = rawMarket.split("/").map((part) => part.trim());
  const token = (countryPart || rawMarket).split(/[/-]/)[0].trim().toUpperCase().replace(/^GB$/, "UK");
  const preset = SEO_LOCALE_PRESETS[token] || null;
  const languagePreset = SEO_LANGUAGE_PRESETS[String(languagePart || "").trim().toLowerCase()] || null;
  const fallbackGl = token.length === 2 ? token.toLowerCase() : "";
  const fallbackLanguage = languagePart || preset?.[4] || "";
  const fallbackLanguagePreset = SEO_LANGUAGE_PRESETS[String(fallbackLanguage || "").trim().toLowerCase()] || [];

  return {
    configured: true,
    rawMarket,
    market: preset?.[0] || countryPart || rawMarket,
    countryCode: preset?.[1] || token,
    googleGl: preset?.[2] ?? fallbackGl,
    googleHl: languagePreset?.[2] ?? preset?.[3] ?? fallbackLanguagePreset[2] ?? "",
    language: languagePreset?.[0] || preset?.[4] || fallbackLanguage || "",
    languageCode: languagePreset?.[1] || preset?.[5] || fallbackLanguagePreset[1] || "",
    semrushDatabase: preset ? preset[6] : fallbackGl,
    warning:
      token === "EU"
        ? "EU / Multilingual is not one Google SERP. Split keyword exports and generation by country-language."
        : "",
  };
}

function localeStatusText(locale) {
  if (!locale?.configured) {
    return "P0 Locale：未选择目标市场。不要进入正式关键词分析、SERP 判断或文章生成。";
  }

  return [
    `P0 Locale：${locale.rawMarket} -> ${locale.market}`,
    `内容语言：${locale.language || "未确定"}`,
    `Google SERP：gl=${locale.googleGl || "not-set"} / hl=${locale.googleHl || "not-set"}`,
    `Semrush 数据库建议：${locale.semrushDatabase || "需要按市场拆分"}`,
    locale.warning ? `警告：${locale.warning}` : "",
  ]
    .filter(Boolean)
    .join("；");
}

function localeStatusTextSafe(locale) {
  if (!locale?.configured) {
    return "P0 Locale: target market is missing. Do not run production keyword analysis, SERP validation, or article generation.";
  }

  return [
    `P0 Locale: ${locale.rawMarket} -> ${locale.market}`,
    `Content language: ${locale.language || "not-set"}`,
    `Google SERP params: gl=${locale.googleGl || "not-set"} / hl=${locale.googleHl || "not-set"}`,
    `Semrush database should match: ${locale.semrushDatabase || "split-by-market"}`,
    "SERP auto-fetch: not connected. Current workflow only marks needsSerpCheck unless a SERP API is added.",
    locale.warning ? `Warning: ${locale.warning}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function syncCustomField(selectId, fieldId) {
  const field = $(fieldId);
  if (!field) return;
  field.classList.toggle("is-visible", $(selectId).value === CUSTOM_OPTION_VALUE);
}

function setSelectOrCustom(selectId, customInputId, fieldId, value = "") {
  const select = $(selectId);
  const customInput = $(customInputId);
  const normalized = String(value || "").trim();
  const optionValues = Array.from(select.options).map((option) => option.value);

  if (!normalized || optionValues.includes(normalized)) {
    select.value = normalized;
    customInput.value = "";
  } else {
    select.value = CUSTOM_OPTION_VALUE;
    customInput.value = normalized;
  }

  syncCustomField(selectId, fieldId);
}

function setProjectFields(project = {}) {
  $("domainInput").value = project.domain || "";
  $("siteTypeInput").value = project.siteType || "2C商城";
  setSelectOrCustom("marketInput", "customMarketInput", "customMarketField", project.market || "");
  setSelectOrCustom("conversionInput", "customConversionInput", "customConversionField", project.conversion || "");
  $("coreProductsInput").value = project.coreProducts || "";
  $("mainPagesInput").value = project.mainPages || "";
  $("blogRolesInput").value = project.blogRoles || "";
  $("mainSiteApiInput").value = project.siteApis?.mainPagesApi || "";
  $("mainBlogApiInput").value = project.siteApis?.mainBlogApi || "";
  $("blogApisInput").value = (project.siteApis?.blogApis || []).join("\n");
}

function projectCompletenessHint(project = readProject()) {
  const missing = [];
  if (!project.coreProducts) missing.push("核心产品/类目词");
  if (!project.mainPages) missing.push("主站商业页面");
  if (!project.blogRoles) missing.push("博客站群定位");

  return missing.length
    ? `已自动保存。建议补充：${missing.join("、")}。补齐后点击“按当前定位重新分析”。`
    : "已自动保存。当前网站定位较完整，后续分站、Brief 和 Prompt 会按这套定位走。";
}

function serializableContentHubDraft() {
  return {
    ...state.contentHub,
    generatedArticles: (state.contentHub.generatedArticles || []).map(({ content, ...article }) => article),
  };
}

function serializableGoogleReviewCache() {
  return Object.fromEntries(
    Object.entries(state.googleReviewCache || {})
      .filter(([, entry]) => entry?.data)
      .slice(-8),
  );
}

function saveWorkspaceDraft(message = "") {
  try {
    const draft = {
      version: 1,
      savedAt: new Date().toISOString(),
      project: readProject(),
      keywords: state.keywords,
      sites: state.sites,
      selectedId: state.selectedId,
      filter: state.filter,
      tablePage: state.tablePage,
      pageSize: state.pageSize,
      brief: state.brief,
      prompt: state.prompt,
      article: state.article,
      articleSave: state.articleSave,
      activePage: state.activePage,
      contentHub: serializableContentHubDraft(),
      selectedGoogleDataSourceId: state.selectedGoogleDataSourceId,
      googleReviewData: state.googleReviewData,
      googleReviewCache: serializableGoogleReviewCache(),
    };
    localStorage.setItem(WORKSPACE_DRAFT_KEY, JSON.stringify(draft));
    if ($("projectSaveStatus")) {
      $("projectSaveStatus").textContent = message || projectCompletenessHint(draft.project);
    }
  } catch (error) {
    if ($("projectSaveStatus")) {
      $("projectSaveStatus").textContent = `本地自动保存失败：${error.message}。如果关键词很多，可以先导出项目 JSON 备份。`;
    }
  }
}

function restoreWorkspaceDraft() {
  let raw = "";
  try {
    raw = localStorage.getItem(WORKSPACE_DRAFT_KEY);
  } catch (error) {
    $("projectSaveStatus").textContent = `本地草稿不可用：${error.message}。`;
    return false;
  }

  if (!raw) return false;

  try {
    const draft = JSON.parse(raw);
    setProjectFields(draft.project || {});
    state.project = readProject();
    state.keywords = Array.isArray(draft.keywords) ? draft.keywords : [];
    state.sites = Array.isArray(draft.sites) && draft.sites.length ? draft.sites : FALLBACK_SITES;
    state.selectedId = draft.selectedId || state.keywords[0]?.id || null;
    state.filter = draft.filter || "全部";
    state.tablePage = Number(draft.tablePage) || 1;
    state.pageSize = Number(draft.pageSize) || 50;
    state.brief = draft.brief || "";
    state.prompt = draft.prompt || "";
    state.article = draft.article || "";
    state.articleParts = splitArticleForWp(state.article);
    state.articleSave = draft.articleSave || null;
    state.activePage = draft.activePage || state.activePage;
    state.selectedGoogleDataSourceId = draft.selectedGoogleDataSourceId || "";
    state.googleReviewCache = draft.googleReviewCache && typeof draft.googleReviewCache === "object" ? draft.googleReviewCache : {};
    state.googleReviewData = draft.googleReviewData || state.googleReviewCache[state.selectedGoogleDataSourceId]?.data || null;
    if (draft.contentHub && typeof draft.contentHub === "object") {
      state.contentHub = {
        ...state.contentHub,
        ...draft.contentHub,
        posts: Array.isArray(draft.contentHub.posts) ? draft.contentHub.posts : [],
        opportunities: Array.isArray(draft.contentHub.opportunities) ? draft.contentHub.opportunities : [],
        selectedIds: Array.isArray(draft.contentHub.selectedIds) ? draft.contentHub.selectedIds : [],
        generatedArticles: Array.isArray(draft.contentHub.generatedArticles) ? draft.contentHub.generatedArticles : [],
      };
    }
    const savedTime = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "上次";
    $("projectSaveStatus").textContent = `已恢复本机草稿：${savedTime}。`;
    $("importStatus").textContent = state.keywords.length ? `已恢复 ${state.keywords.length} 个关键词。` : "已恢复项目定位，还没有关键词。";
    return true;
  } catch (error) {
    $("projectSaveStatus").textContent = `草稿读取失败：${error.message}。已保留当前空白状态。`;
    return false;
  }
}

function loadAiStages() {
  return mergeAiStages({});
}

function mergeAiStages(saved) {
  return Object.fromEntries(
    Object.entries(AI_STAGE_DEFS).map(([key, defaults]) => [
      key,
      {
        ...defaults,
        ...(saved[key] || {}),
      },
    ]),
  );
}

async function loadAiStagesFromServer() {
  const data = await api("/api/ai-stages");
  state.aiStages = mergeAiStages(data.stages || {});
  renderAiStages();
  const configuredCount = Object.values(state.aiStages).filter((stage) => stage.apiKeySet).length;
  $("aiConfigStatus").textContent = configuredCount
    ? `已从服务端读取 AI 配置：${configuredCount} 个阶段已配置 API Key。`
    : "已从服务端读取 AI 配置：还没有阶段配置 API Key。";
}

async function saveAiStagesToServer() {
  $("aiConfigStatus").textContent = "正在保存 AI 阶段配置到服务端...";
  const data = await api("/api/ai-stages", {
    stages: state.aiStages,
  });
  state.aiStages = mergeAiStages(data.stages || {});
  renderAiStages();
  $("aiConfigStatus").textContent = "已保存到服务端：config/ai-stages.local.json。完整 API Key 不会回传到浏览器。";
  setArticleOutput("AI 阶段配置已保存到服务端本地配置文件。完整 API Key 不会回传到浏览器。");
}

function readWpSiteForm() {
  const normalizedSiteUrl = normalizeWpSiteUrl($("wpSiteUrlInput").value);
  $("wpSiteUrlInput").value = normalizedSiteUrl;
  return {
    id: state.selectedWpSiteId || "",
    name: $("wpSiteNameInput").value.trim(),
    siteUrl: normalizedSiteUrl,
    username: $("wpUsernameInput").value.trim(),
    applicationPassword: $("wpApplicationPasswordInput").value.trim(),
    defaultStatus: $("wpDefaultStatusInput").value || "draft",
    defaultCategoryId: $("wpDefaultCategoryInput").value.trim(),
    targetMarket: $("wpTargetMarketInput").value.trim(),
    targetLanguage: $("wpTargetLanguageInput").value.trim(),
    contentRole: $("wpContentRoleInput").value || "博客A-知识教程",
    contentScope: $("wpContentScopeInput").value.trim(),
  };
}

function setWpSiteForm(site = {}) {
  state.selectedWpSiteId = site.id || "";
  $("wpSiteSelect").value = site.id || "";
  $("wpSiteNameInput").value = site.name || "";
  $("wpSiteUrlInput").value = normalizeWpSiteUrl(site.siteUrl || "");
  $("wpUsernameInput").value = site.username || "";
  $("wpApplicationPasswordInput").value = "";
  $("wpApplicationPasswordInput").placeholder = site.applicationPasswordSet
    ? `已保存：${site.applicationPasswordPreview}，留空则继续使用`
    : "用户资料页生成的 Application Password";
  $("wpDefaultStatusInput").value = site.defaultStatus || "draft";
  $("wpDefaultCategoryInput").value = site.defaultCategoryId || "";
  $("wpTargetMarketInput").value = site.targetMarket || "";
  $("wpTargetLanguageInput").value = site.targetLanguage || "";
  $("wpContentRoleInput").value = site.contentRole || "博客A-知识教程";
  $("wpContentScopeInput").value = site.contentScope || "";
  updateActionStates();
}

function renderWpSites() {
  const select = $("wpSiteSelect");
  if (!select) return;

  const current = state.selectedWpSiteId;
  select.innerHTML = [
    `<option value="">新建站点配置</option>`,
    ...state.wpSites.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name || site.siteUrl)}${site.applicationPasswordSet ? "（已保存密码）" : ""}</option>`),
  ].join("");
  select.value = state.wpSites.some((site) => site.id === current) ? current : "";
}

async function loadWpSites() {
  const data = await api("/api/wp-sites");
  state.wpSites = data.sites || [];
  renderWpSites();

  if (!state.selectedWpSiteId && state.wpSites[0]) {
    setWpSiteForm(state.wpSites[0]);
  }

  $("wpPublishStatus").textContent = state.wpSites.length
    ? `已读取 ${state.wpSites.length} 个 WordPress 站点配置。`
    : "尚未配置 WordPress 站点。应用密码会保存到服务端本地配置，不会回传到浏览器。";
}

async function saveWpSiteFromForm() {
  $("wpPublishStatus").textContent = "正在保存 WordPress 站点配置...";
  const data = await api("/api/wp-sites/save", { site: readWpSiteForm() });
  state.wpSites = data.sites || [];
  setWpSiteForm(data.site);
  renderWpSites();
  $("wpPublishStatus").textContent = "已保存 WordPress 站点配置：config/wp-sites.local.json。";
}

async function testWpSiteConnection() {
  $("wpPublishStatus").textContent = "正在测试 WordPress 连接...";
  const data = await api("/api/wp-sites/test", { site: readWpSiteForm() });
  if (data.site) {
    state.wpSites = state.wpSites.map((site) => (site.id === data.site.id ? data.site : site));
    if (!state.wpSites.some((site) => site.id === data.site.id)) state.wpSites.push(data.site);
    setWpSiteForm(data.site);
    renderWpSites();
  }
  $("wpPublishStatus").textContent = `连接成功：${data.user?.name || data.user?.slug || "WordPress 用户"}。`;
}

function formatWpDiagnostics(data) {
  const lines = ["WordPress 连接分步诊断", "", data.conclusion || "暂无结论", ""];
  for (const step of data.steps || []) {
    const marker = step.ok ? "PASS" : "FAIL";
    lines.push(`[${marker}] ${step.label}`);
    lines.push(`URL: ${step.url}`);
    if (step.networkError) {
      lines.push(`网络错误: ${step.error || "unknown network error"}`);
    } else {
      lines.push(`状态码: ${step.status} ${step.statusText || ""}`.trim());
      if (step.contentType) lines.push(`Content-Type: ${step.contentType}`);
      if (step.bodyPreview) lines.push(`响应预览: ${step.bodyPreview}`);
    }
    lines.push(`耗时: ${step.elapsedMs || 0}ms`);
    lines.push("");
  }
  return lines.join("\n");
}

async function diagnoseWpSiteConnection() {
  $("wpPublishStatus").textContent = "正在分步诊断 WordPress 连接...";
  $("wpDiagnosticsOutput").textContent = "诊断中...";
  const data = await api("/api/wp-sites/diagnose", { site: readWpSiteForm() });
  $("wpPublishStatus").textContent = data.ok ? "诊断完成：应用密码认证可用。" : "诊断完成：请查看下方失败步骤。";
  $("wpDiagnosticsOutput").textContent = formatWpDiagnostics(data);
}

async function deleteCurrentWpSite() {
  if (!state.selectedWpSiteId) {
    $("wpPublishStatus").textContent = "当前是新建配置，没有可删除的站点。";
    return;
  }

  const data = await api("/api/wp-sites/delete", { siteId: state.selectedWpSiteId });
  state.wpSites = data.sites || [];
  setWpSiteForm({});
  renderWpSites();
  $("wpPublishStatus").textContent = "已删除当前 WordPress 站点配置。";
}

async function uploadCurrentArticleToWp() {
  if (!state.article?.trim()) {
    $("wpPublishStatus").textContent = "还没有可上传的文章。请先生成文章。";
    return;
  }

  if (!state.selectedWpSiteId) {
    $("wpPublishStatus").textContent = "请先选择或保存一个 WordPress 站点。";
    return;
  }

  $("wpPublishStatus").textContent = "正在上传当前文章到 WordPress...";
  const data = await api("/api/wp-sites/upload", {
    siteId: state.selectedWpSiteId,
    content: state.article,
    status: $("wpDefaultStatusInput").value || "draft",
    categoryId: $("wpDefaultCategoryInput").value.trim(),
    slug: state.articleParts?.slug || "",
    ...imageUploadOptions(),
  });

  const formatNote = data.contentFormat === "wordpress_blocks" ? "正文已按 Gutenberg 区块上传" : "正文已上传";
  const seoNote = data.rankMathMetaApplied
    ? "Rank Math TDK 已尝试写入"
    : data.rankMathMetaError
      ? `Rank Math TDK 未写入：${data.rankMathMetaError}`
      : "Rank Math TDK 没有可写入字段";
  const imageNote = Array.isArray(data.imageWarnings) && data.imageWarnings.length
    ? `图片提示：${data.imageWarnings.join("；")}`
    : imageUploadOptions().enrichImages
      ? "图片占位已在上传前尝试补齐"
      : "未启用自动补图";
  $("wpPublishStatus").innerHTML = [
    `上传成功：${escapeHtml(data.title)}（${escapeHtml(data.status)}）。`,
    escapeHtml(formatNote),
    escapeHtml(seoNote),
    escapeHtml(imageNote),
    `<a href="${escapeHtml(data.editLink)}" target="_blank" rel="noreferrer">打开 WP 编辑页</a>`,
  ].join("<br>");
}

function markdownInline(value = "") {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function markdownTableHtml(lines = []) {
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
  return [
    '<div class="diagnosis-table-wrap"><table class="diagnosis-table">',
    `<thead><tr>${header.map((cell) => `<th>${markdownInline(cell)}</th>`).join("")}</tr></thead>`,
    `<tbody>${bodyRows
      .map((row) => `<tr>${row.map((cell) => `<td>${markdownInline(cell)}</td>`).join("")}</tr>`)
      .join("")}</tbody>`,
    "</table></div>",
  ].join("");
}

function renderMarkdownFragment(markdown = "") {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^\|.+\|$/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && /^\|.+\|$/.test(lines[index].trim())) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      html.push(markdownTableHtml(tableLines));
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${markdownInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${markdownInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^#{3,6}\s+/.test(line)) {
      html.push(`<h5>${markdownInline(line.replace(/^#{3,6}\s+/, ""))}</h5>`);
      index += 1;
      continue;
    }

    html.push(`<p>${markdownInline(line)}</p>`);
    index += 1;
  }

  return html.join("");
}

function renderDiagnosisView(containerId, markdown = "", options = {}) {
  const container = $(containerId);
  if (!container) return;
  const content = String(markdown || "").trim();
  if (!content) {
    container.innerHTML = "";
    return;
  }

  const sections = [];
  const regex = /^##\s+(.+)$/gm;
  let match;
  let last = null;
  while ((match = regex.exec(content))) {
    if (last) {
      last.body = content.slice(last.start, match.index).trim();
      sections.push(last);
    }
    last = { title: match[1].trim(), start: regex.lastIndex, body: "" };
  }
  if (last) {
    last.body = content.slice(last.start).trim();
    sections.push(last);
  }

  if (!sections.length) {
    container.innerHTML = `<article class="diagnosis-card diagnosis-card-wide">${renderMarkdownFragment(content)}</article>`;
    return;
  }

  container.innerHTML = sections
    .map(
      (section, index) => `
        <article class="diagnosis-card ${index === 0 ? "diagnosis-card-wide" : ""}">
          <h4>${escapeHtml(section.title)}</h4>
          ${renderMarkdownFragment(section.body)}
        </article>
      `,
    )
    .join("");
}

function renderPostInventory(containerId, posts = [], source = "wp", context = "") {
  const container = $(containerId);
  if (!container) return;
  if (!posts.length) {
    container.innerHTML = "";
    return;
  }

  const rows = posts
    .slice(0, 160)
    .map(
      (post) => `
        <tr>
          <td>${escapeHtml(post.id || "")}</td>
          <td>
            <strong>${escapeHtml(post.title || "Untitled")}</strong>
            <span class="asset-path">${escapeHtml(post.slug || post.link || "")}</span>
          </td>
          <td>${escapeHtml(post.status || "")}</td>
          <td>${escapeHtml(post.wordApprox || 0)}</td>
          <td>${escapeHtml(String(post.modified || post.date || "").slice(0, 10))}</td>
          <td><button class="ghost-btn" data-optimize-post="${escapeHtml(post.id || post.slug || "")}" data-source="${escapeHtml(source)}" data-context="${escapeHtml(context)}">分析/优化</button></td>
        </tr>
      `,
    )
    .join("");

  container.innerHTML = `
    <article class="diagnosis-card diagnosis-card-wide">
      <div class="diagnosis-card-heading">
        <h4>文章库存表</h4>
        <span class="badge">${posts.length} 篇</span>
      </div>
      <div class="diagnosis-table-wrap">
        <table class="diagnosis-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>标题 / URL</th>
              <th>状态</th>
              <th>词数估算</th>
              <th>更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>
  `;

  container.querySelectorAll("[data-optimize-post]").forEach((button) => {
    button.addEventListener("click", () => {
      optimizeExistingPost(button.dataset.source, button.dataset.optimizePost, button.dataset.context || "").catch((error) => {
        const statusId = button.dataset.source === "blog" ? "blogPublishStatus" : "wpPublishStatus";
        const resolvedStatusId = button.dataset.context === "contentHub"
          ? "contentHubStatus"
          : button.dataset.source === "main"
            ? "mainPublishStatus"
            : statusId;
        $(resolvedStatusId).textContent = `优化失败：${error.message}`;
      });
    });
  });
}

function normalizeSearchText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TLD_LOCALE_HINTS = {
  de: { targetMarket: "DE / German", targetLanguage: "German" },
  fr: { targetMarket: "FR / French", targetLanguage: "French" },
  jp: { targetMarket: "JP / Japanese", targetLanguage: "Japanese" },
  uk: { targetMarket: "UK / English", targetLanguage: "English" },
  au: { targetMarket: "AU / English", targetLanguage: "English" },
  ca: { targetMarket: "CA / English", targetLanguage: "English" },
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function hostnameFromCandidate(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const urlMatch = raw.match(/https?:\/\/[^\s/]+/i);
  if (urlMatch) {
    try {
      return new URL(urlMatch[0]).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  const hostMatch = raw.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
  return hostMatch ? hostMatch[1].toLowerCase() : "";
}

function isLocalHostname(hostname = "") {
  const value = String(hostname || "").toLowerCase();
  return LOCAL_HOSTNAMES.has(value) || value.endsWith(".local");
}

function hostnameFromSite(site = {}) {
  const candidates = [
    site.siteUrl,
    site.domain,
    site.homeUrl,
    site.name,
    site.apiBaseUrl,
  ].filter(Boolean);
  const hostnames = candidates.map(hostnameFromCandidate).filter(Boolean);
  return hostnames.find((hostname) => !isLocalHostname(hostname)) || hostnames[0] || "";
}

function inferSiteProfile(site = {}) {
  const hostname = hostnameFromSite(site);
  const labels = hostname.split(".").filter(Boolean);
  const tld = labels.at(-1) || "";
  const secondLevel = labels.length >= 2 ? labels.slice(-2).join(".") : "";
  const hint = secondLevel === "co.uk" ? TLD_LOCALE_HINTS.uk : TLD_LOCALE_HINTS[tld] || null;
  const targetMarket = String(site.targetMarket || hint?.targetMarket || "").trim();
  const targetLanguage = String(site.targetLanguage || hint?.targetLanguage || "").trim();
  const inferred = !site.targetMarket && !site.targetLanguage && Boolean(hint);
  return {
    hostname,
    targetMarket,
    targetLanguage,
    contentRole: site.contentRole || (site.type === "main" ? "主站-博客" : "博客A-知识教程"),
    contentScope: site.contentScope || "",
    inferred,
    locale: resolveSeoLocale(targetMarket || (targetLanguage ? `Global / ${targetLanguage}` : "")),
  };
}

function siteMatchesProject(site = {}) {
  const profile = inferSiteProfile(site);
  if (profile.contentRole === "暂不做") {
    return { compatible: false, reason: "站点角色为暂不做" };
  }

  const projectLocale = readProject().locale || {};
  if (!projectLocale.configured) {
    return { compatible: true, reason: "项目尚未配置市场，暂不筛除" };
  }

  if (!profile.targetMarket && !profile.targetLanguage) {
    return { compatible: true, reason: "站点未配置市场，暂时保留但建议补全档案" };
  }

  const siteLocale = profile.locale || {};
  const projectGl = String(projectLocale.googleGl || "").toLowerCase();
  const siteGl = String(siteLocale.googleGl || "").toLowerCase();
  const projectLang = String(projectLocale.languageCode || projectLocale.language || "").toLowerCase();
  const siteLang = String(siteLocale.languageCode || profile.targetLanguage || "").toLowerCase();
  const marketMismatch = projectGl && siteGl && projectGl !== siteGl;
  const languageMismatch = projectLang && siteLang && projectLang !== siteLang && siteLang !== "multi";

  if (marketMismatch || languageMismatch) {
    return {
      compatible: false,
      reason: `项目是 ${projectLocale.market || "未配置"}，站点是 ${profile.targetMarket || profile.targetLanguage}`,
    };
  }

  return { compatible: true, reason: profile.inferred ? "根据域名推断兼容" : "站点档案匹配当前项目" };
}

function contentRoleProfile(role = "") {
  const text = normalizeSearchText(role);
  return {
    role: String(role || "").trim(),
    isMain: text.includes("主站"),
    isCollection: text.includes("集合页") || text.includes("分类页"),
    isComparison: /对比|评测|comparison|review|vs/.test(text),
    isKnowledge: /知识|教程|faq|guide|how to/.test(text),
    isScenario: /场景|人群|scenario|beginner|flavor/.test(text),
  };
}

function keywordRoleMatchesSite(item = {}, site = selectedContentSite()) {
  const profile = site ? inferSiteProfile(site) : {};
  const role = contentRoleProfile(profile.contentRole || "");
  const assignedSite = String(item.assignedSite || "").trim();
  const pageType = String(item.pageType || "").trim();
  const text = normalizeSearchText([
    assignedSite,
    pageType,
    item.pageRole,
    item.intent,
    item.contentAction,
    item.keyword,
    item.topicCluster,
  ].filter(Boolean).join(" "));

  if (!site) {
    return { compatible: true, strength: 0, reason: "未选择站点" };
  }

  if (!role.role) {
    return { compatible: true, strength: 1, reason: "站点未配置内容角色，暂不强筛" };
  }

  if (assignedSite && assignedSite === role.role) {
    return { compatible: true, strength: 4, reason: "关键词原始分配与站点角色一致" };
  }

  if (site.type === "main") {
    if (assignedSite.includes("主站")) {
      return { compatible: true, strength: 2, reason: "关键词原始分配给主站体系" };
    }
    return { compatible: false, strength: -4, reason: "关键词原始分配不属于主站体系" };
  }

  if (assignedSite.startsWith("主站")) {
    return { compatible: false, strength: -5, reason: "关键词原始分配给主站，不属于当前博客站点" };
  }

  if (assignedSite && assignedSite.includes("博客") && assignedSite !== role.role) {
    return { compatible: false, strength: -4, reason: "关键词原始分配给其他博客板块" };
  }

  if (role.isComparison && /对比|评测|comparison|review|vs|best|alternative/.test(text)) {
    return { compatible: true, strength: 2, reason: "关键词语义与对比评测板块匹配" };
  }

  if (role.isKnowledge && /知识|教程|faq|guide|how to|what is|meaning|safety|legal/.test(text)) {
    return { compatible: true, strength: 2, reason: "关键词语义与知识教程板块匹配" };
  }

  if (role.isScenario && /场景|人群|scenario|beginner|flavor|for |tips|ideas|choose/.test(text)) {
    return { compatible: true, strength: 2, reason: "关键词语义与场景人群板块匹配" };
  }

  return { compatible: false, strength: -2, reason: "关键词既没有分配到该站点，也缺少对应板块信号" };
}

function allContentSiteOptions() {
  const options = [];
  for (const site of state.blogSites || []) {
    const base = { ...site, key: `blog:${site.id}`, type: "blog", id: site.id, name: site.name || site.apiBaseUrl || "自建博客站" };
    const match = siteMatchesProject(base);
    options.push({ ...base, profile: inferSiteProfile(base), compatible: match.compatible, incompatibleReason: match.reason });
  }
  for (const site of state.wpSites || []) {
    const base = { ...site, key: `wp:${site.id}`, type: "wp", id: site.id, name: site.name || site.siteUrl || "WordPress 站点" };
    const match = siteMatchesProject(base);
    options.push({ ...base, profile: inferSiteProfile(base), compatible: match.compatible, incompatibleReason: match.reason });
  }
  for (const site of state.mainSites || []) {
    const base = { ...site, key: `main:${site.id}`, type: "main", id: site.id, name: site.name || site.apiBaseUrl || "主站 OpenAPI" };
    const match = siteMatchesProject(base);
    options.push({ ...base, profile: inferSiteProfile(base), compatible: match.compatible, incompatibleReason: match.reason });
  }
  return options;
}

function contentSiteOptions() {
  const all = allContentSiteOptions();
  return state.contentHub.showIncompatibleSites ? all : all.filter((site) => site.compatible);
}

function parseContentSiteKey(siteKey = state.contentHub.selectedSiteKey) {
  const [type, ...rest] = String(siteKey || "").split(":");
  return { type: type || "", id: rest.join(":") };
}

function selectedContentSite() {
  return contentSiteOptions().find((site) => site.key === state.contentHub.selectedSiteKey) || null;
}

function contentSourceLabel(site = selectedContentSite()) {
  return site?.name || "当前站点";
}

function contentSourceType(site = selectedContentSite()) {
  return site?.type || parseContentSiteKey().type || state.contentHub.source || "blog";
}

function postsForContentSite() {
  return state.contentHub.posts || [];
}

function postTextForMatch(post = {}) {
  return normalizeSearchText([
    post.title,
    post.slug,
    post.link,
    post.excerpt,
    post.contentPreview,
    post.meta_title,
    post.meta_descript,
  ].filter(Boolean).join(" "));
}

function keywordCoverage(keyword = "", posts = []) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return { status: "未知", matchedPosts: [] };
  const tokens = normalizedKeyword.split(" ").filter((token) => token.length > 2);
  const matchedPosts = posts
    .map((post) => {
      const text = postTextForMatch(post);
      const exact = text.includes(normalizedKeyword);
      const tokenHits = tokens.filter((token) => text.includes(token)).length;
      const ratio = tokens.length ? tokenHits / tokens.length : 0;
      return { post, exact, ratio };
    })
    .filter((item) => item.exact || item.ratio >= 0.68)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.ratio - a.ratio);

  if (matchedPosts.some((item) => item.exact)) {
    return { status: "已覆盖", matchedPosts: matchedPosts.map((item) => item.post) };
  }
  if (matchedPosts.length) {
    return { status: "疑似覆盖", matchedPosts: matchedPosts.map((item) => item.post) };
  }
  return { status: "未覆盖", matchedPosts: [] };
}

function isArticleKeywordCandidate(item = {}, source = contentSourceType()) {
  const text = normalizeSearchText([
    item.keyword,
    item.intent,
    item.pageType,
    item.pageRole,
    item.contentAction,
    item.assignedSite,
  ].filter(Boolean).join(" "));
  const isCommercialPage = /集合页|产品页|分类页|collection|category|product page|landing page/.test(text);
  const articleSignals = /文章|博客|教程|指南|知识|faq|评测|对比|场景|人群|guide|how to|review|best|vs|comparison|faq|learn|ideas|tips/.test(text);
  if (source !== "main" && isCommercialPage) return false;
  return articleSignals || !isCommercialPage;
}

function sourceFitScore(item = {}, source = state.contentHub.source) {
  const assigned = String(item.assignedSite || "");
  if (source === "main") return assigned.includes("主站") ? 12 : -8;
  if (source === "blog" || source === "wp") {
    if (/集合页|产品页|分类页|collection|category|product/i.test(`${assigned} ${item.pageType || ""}`)) return -18;
    return assigned.includes("博客") || assigned.includes("主站-博客") || /文章|教程|指南|FAQ|评测|对比|blog|guide|review/i.test(item.pageType || "") ? 12 : 3;
  }
  return assigned.includes("主站-集合页") ? -10 : 2;
}

function keywordBaseScore(item = {}) {
  const existing = Number(item.scores?.total);
  if (Number.isFinite(existing) && existing > 0) return existing;
  const volume = Number(item.volume || 0);
  const kd = Number(item.kd || item.difficulty || 0);
  const volumeScore = Math.min(28, Math.log10(volume + 10) * 9);
  const kdScore = Math.max(0, 24 - kd * 0.35);
  const intentScore = /informational|commercial|信息|商业/i.test(item.intent || "") ? 18 : 10;
  return Math.round(volumeScore + kdScore + intentScore + 20);
}

function findInternalLinkCandidates(item = {}, posts = [], coverage = {}) {
  const cluster = normalizeSearchText(item.topicCluster || item.pageGroup || item.seedKeyword || item.keyword);
  const keywordTokens = normalizeSearchText(`${item.keyword} ${cluster}`).split(" ").filter((token) => token.length > 2);
  const coveredIds = new Set((coverage.matchedPosts || []).map((post) => String(post.id || post.slug || post.link)));
  return posts
    .map((post) => {
      const text = postTextForMatch(post);
      const hits = keywordTokens.filter((token) => text.includes(token)).length;
      return {
        post,
        hits,
        url: post.link || post.slug || post.handle || "",
        anchor: post.title || post.slug || item.keyword,
      };
    })
    .filter((item) => item.url && item.hits > 0 && !coveredIds.has(String(item.post.id || item.post.slug || item.post.link)))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 4)
    .map((item) => ({
      title: item.post.title || "Untitled",
      url: item.url,
      anchor: item.anchor,
    }));
}

function articlePageTypeForOpportunity(item = {}, source = contentSourceType()) {
  const pageType = String(item.pageType || "").trim();
  if (source === "main") return pageType || "主站博客文章";
  if (/集合页|产品页|分类页|collection|category|product/i.test(pageType)) return "博客支撑文章";
  return pageType ? pageType.replace(/主站/g, "博客站") : "博客文章";
}

function buildContentOpportunity(item = {}, source = contentSourceType(), posts = postsForContentSite(), site = selectedContentSite()) {
  const coverage = keywordCoverage(item.keyword, posts);
  if (!isArticleKeywordCandidate(item, source)) return null;
  const roleMatch = keywordRoleMatchesSite(item, site);
  if (!roleMatch.compatible) return null;

  const base = keywordBaseScore(item);
  const coverageScore = coverage.status === "未覆盖" ? 16 : coverage.status === "疑似覆盖" ? 2 : -25;
  const priorityScore = item.priority === "P0" ? 10 : item.priority === "P1" ? 7 : item.priority === "P2" ? 3 : 0;
  const fitScore = sourceFitScore(item, source) + roleMatch.strength * 4;
  const finalScore = Math.max(0, Math.min(100, Math.round(base * 0.48 + coverageScore + priorityScore + fitScore * 0.65)));
  const action = coverage.status === "已覆盖" ? "更新旧文/补充段落" : coverage.status === "疑似覆盖" ? "先人工确认，再补强" : "新写文章";
  const internalLinks = findInternalLinkCandidates(item, posts, coverage);
  const sourceLabel = contentSourceLabel(site);
  const siteProfile = site ? inferSiteProfile(site) : {};
  const nonMainRule = source !== "main" && state.contentHub.noMainOutboundLinks
    ? "仅使用本站内链，不给主站或产品页外链"
    : "可按文章目的选择主站/产品页承接";

  return {
    id: `opp-${source}-${item.id}`,
    keywordId: item.id,
    keyword: item.keyword,
    topicCluster: item.topicCluster || item.pageGroup || item.seedKeyword || item.keyword,
    assignedSite: `${sourceLabel} / ${siteProfile.contentRole || "未配置板块"}`,
    siteKey: site?.key || "",
    siteName: sourceLabel,
    siteRole: siteProfile.contentRole || "",
    siteMarket: siteProfile.targetMarket || "",
    siteLanguage: siteProfile.targetLanguage || "",
    originalAssignedSite: item.assignedSite || "",
    pageType: articlePageTypeForOpportunity(item, source),
    originalPageType: item.pageType || "",
    priority: item.priority || scorePriority(finalScore),
    score: finalScore,
    coverage: coverage.status,
    action,
    source,
    sourceLabel,
    nonMainRule,
    reason: [
      `${coverage.status}`,
      `原始分 ${Math.round(base)}`,
      item.intent ? `意图 ${item.intent}` : "",
      roleMatch.reason,
      fitScore < 0 ? "站点匹配度偏低" : "站点匹配可用",
    ].filter(Boolean).join(" / "),
    matchedPosts: (coverage.matchedPosts || []).slice(0, 3).map((post) => ({
      title: post.title || "Untitled",
      url: post.link || post.slug || "",
    })),
    internalLinks,
  };
}

function renderContentSiteOptions() {
  const select = $("contentSiteSelect");
  if (!select) return;
  const options = contentSiteOptions();
  select.innerHTML = [
    `<option value="">请选择要分析的站点</option>`,
    ...options.map((site) => {
      const profile = site.profile || inferSiteProfile(site);
      const localeText = profile.targetMarket || profile.targetLanguage || "未配置市场";
      const suffix = site.compatible ? "" : ` / 不匹配：${site.incompatibleReason}`;
      return `<option value="${escapeHtml(site.key)}">${escapeHtml(`${site.name}｜${profile.contentRole}｜${localeText}${suffix}`)}</option>`;
    }),
  ].join("");
  if (options.some((site) => site.key === state.contentHub.selectedSiteKey)) {
    select.value = state.contentHub.selectedSiteKey;
  } else {
    select.value = "";
  }
}

async function loadContentHubSitePosts({ autoPlan = true, force = false } = {}) {
  const site = selectedContentSite();
  if (!site) {
    state.contentHub.posts = [];
    state.contentHub.opportunities = [];
    state.contentHub.selectedIds = [];
    state.contentHub.activeOpportunity = null;
    state.contentHub.opportunityPage = 1;
    state.contentHub.lastSummary = null;
    renderContentHub();
    $("contentHubStatus").textContent = "请先选择一个具体站点。";
    return;
  }

  const requestKey = site.key;
  const now = Date.now();
  const hasFreshPosts = !force &&
    contentHubLoadState.lastLoadedKey === requestKey &&
    now - contentHubLoadState.lastLoadedAt < CONTENT_HUB_AUTO_RELOAD_TTL_MS &&
    state.contentHub.posts.length > 0;

  if (hasFreshPosts) {
    if (autoPlan && state.keywords.length) planContentOpportunities();
    $("contentHubStatus").textContent = `已复用最近 5 分钟内读取过的 ${site.name} 文章列表。`;
    return;
  }

  if (!force && contentHubLoadState.requestKey === requestKey && contentHubLoadState.promise) {
    $("contentHubStatus").textContent = `正在读取 ${site.name} 的文章列表，请稍候...`;
    await contentHubLoadState.promise;
    if (autoPlan && state.keywords.length) planContentOpportunities();
    return;
  }

  state.contentHub.source = site.type;
  state.contentHub.posts = [];
  state.contentHub.opportunities = [];
  state.contentHub.selectedIds = [];
  state.contentHub.activeOpportunity = null;
  state.contentHub.opportunityPage = 1;
  state.contentHub.lastSummary = null;
  renderContentHub();
  $("contentHubStatus").textContent = `正在读取 ${site.name} 的文章列表...`;
  const sequence = ++contentHubLoadState.sequence;
  const requestPromise = (async () => {
    let data;
    let posts = [];
    if (site.type === "wp") {
      state.selectedWpSiteId = site.id;
      data = await api("/api/wp-sites/posts", {
        siteId: site.id,
        perPage: 100,
        maxPages: 20,
        includeContent: false,
      });
      posts = data.posts || [];
      state.wpPosts = posts;
    } else if (site.type === "blog") {
      state.selectedBlogSiteId = site.id;
      data = await api("/api/blog-sites/list", { siteId: site.id });
      posts = data.posts || [];
      state.blogPosts = posts;
    } else if (site.type === "main") {
      state.selectedMainSiteId = site.id;
      data = await api("/api/main-sites/list", {
        siteId: site.id,
        pageSize: 100,
        maxPages: 20,
        force,
        source: "content-hub-read-button",
        requestId: requestId("content-hub-main-list"),
      });
      posts = data.posts || [];
      state.mainPosts = posts;
    }
    return { data, posts };
  })();

  contentHubLoadState.requestKey = requestKey;
  contentHubLoadState.promise = requestPromise;

  try {
    const { posts } = await requestPromise;
    if (sequence !== contentHubLoadState.sequence || state.contentHub.selectedSiteKey !== requestKey) return;
    state.contentHub.posts = posts;
    contentHubLoadState.lastLoadedKey = requestKey;
    contentHubLoadState.lastLoadedAt = Date.now();
    renderContentHub();
    $("contentHubStatus").textContent = `已读取 ${state.contentHub.posts.length} 篇文章：${site.name}。`;
    if (autoPlan && state.keywords.length) planContentOpportunities();
    saveWorkspaceDraft(`已读取 ${site.name} 的 ${state.contentHub.posts.length} 篇文章。`);
  } finally {
    if (contentHubLoadState.promise === requestPromise) {
      contentHubLoadState.requestKey = "";
      contentHubLoadState.promise = null;
    }
  }
}

function planContentOpportunities() {
  const site = selectedContentSite();
  const source = contentSourceType(site);
  state.contentHub.source = source;
  state.contentHub.noMainOutboundLinks = Boolean($("contentNoMainLinksInput")?.checked);
  const posts = postsForContentSite();
  if (!state.keywords.length) {
    $("contentHubStatus").textContent = "还没有关键词。请先导入 Semrush 关键词表，再做内容机会规划。";
    return;
  }
  if (!site) {
    $("contentHubStatus").textContent = "请先选择一个具体站点，再点击“读取/刷新文章”。";
    return;
  }
  if (!contentHubPostsLoadedFor(site)) {
    $("contentHubStatus").textContent = `还没有读取到 ${site.name} 的文章。请点击“读取/刷新文章”。`;
    return;
  }

  const opportunities = state.keywords
    .map((item) => buildContentOpportunity(item, source, posts, site))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  state.contentHub.opportunities = opportunities;
  state.contentHub.opportunityPage = 1;
  state.contentHub.selectedIds = state.contentHub.selectedIds.filter((id) => opportunities.some((item) => item.id === id));
  state.contentHub.lastSummary = {
    source,
    selectedSiteKey: state.contentHub.selectedSiteKey,
    siteName: site.name,
    posts: posts.length,
    keywords: state.keywords.length,
    opportunities: opportunities.length,
    newArticles: opportunities.filter((item) => item.action === "新写文章").length,
    noMainOutboundLinks: state.contentHub.noMainOutboundLinks,
  };
  renderContentHub();
  saveWorkspaceDraft(`已为 ${site.name} 规划 ${opportunities.length} 个内容机会。`);
  return opportunities;
}

function contentHubPostsLoadedFor(site = selectedContentSite()) {
  if (!site) return false;
  return (
    postsForContentSite().length > 0 ||
    contentHubLoadState.lastLoadedKey === site.key ||
    state.contentHub.lastSummary?.selectedSiteKey === site.key
  );
}

function parseJsonFromAiText(text = "") {
  const clean = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("AI 没有返回可解析的 JSON。");
    return JSON.parse(match[0]);
  }
}

function opportunityReviewPrompt(opportunities = [], site = selectedContentSite()) {
  const project = readProject();
  const sample = opportunities.slice(0, 80).map((item) => {
    const keyword = state.keywords.find((candidate) => candidate.id === item.keywordId) || {};
    return {
      opportunityId: item.id,
      keywordId: item.keywordId,
      keyword: item.keyword,
      topicCluster: item.topicCluster,
      volume: keyword.volume || 0,
      kd: keyword.kd || 0,
      intent: keyword.intent || "",
      serpFeatures: keyword.serpFeatures || "",
      localAssignedSite: item.originalAssignedSite || keyword.assignedSite || "",
      localPageType: item.originalPageType || keyword.pageType || "",
      targetSite: item.siteName,
      targetSiteRole: item.siteRole,
      targetMarket: item.siteMarket,
      targetLanguage: item.siteLanguage,
      coverage: item.coverage,
      matchedPosts: item.matchedPosts || [],
      localAction: item.action,
      localPriority: item.priority,
      localScore: item.score,
      localReason: item.reason,
    };
  });

  return [
    "你是 Google SEO 关键词机会池审核人。请基于本地规则结果、Semrush 字段和站点已有文章，审核哪些关键词值得写新文章。",
    "必须返回严格 JSON，不要 Markdown，不要解释性前后缀。",
    "",
    "输出格式：",
    '{"items":[{"opportunityId":"","decision":"keep|drop|revise","priority":"P0|P1|P2|P3|Hold","score":0,"pageType":"","action":"","contentAngle":"","serpFeatureNotes":"","reason":""}]}',
    "",
    "审核规则：",
    "- 本地规则是 baseline，不要无理由推翻。",
    "- SERP Features 要影响判断：Shopping/Ads/Local Pack 更偏商业或本地，不适合普通博客；People Also Ask/Featured Snippet/Video/Image 可作为文章结构信号。",
    "- 如果目标站点语言或市场不匹配，decision=drop 或 priority=Hold。",
    "- 如果已有文章已精确覆盖，优先 action=更新旧文，而不是新写。",
    "- 非主站文章默认只做本站内链，不要建议给主站/产品页外链。",
    "- 不要声称检查了 Google 前 10；这里只能基于 Semrush 字段和已给数据审核。",
    "",
    "项目定位：",
    JSON.stringify(project, null, 2),
    "",
    "当前站点：",
    JSON.stringify(site ? inferSiteProfile(site) : {}, null, 2),
    "",
    "标准摘要：",
    JSON.stringify({ scoring: state.standard?.scoring, signals: state.standard?.signals, localePolicy: state.standard?.localePolicy }, null, 2),
    "",
    "待审核机会：",
    JSON.stringify(sample, null, 2),
  ].join("\n");
}

async function aiReviewContentOpportunities() {
  const opportunities = state.contentHub.opportunities || [];
  if (!opportunities.length) return;
  const stage = state.aiStages.keywordAnalysis || {};
  if (stage.provider === "local" || stage.apiFormat === "local") {
    $("contentHubStatus").textContent = "已生成本地机会池；关键词分析阶段当前是 Local，所以未调用 AI 复核。";
    return;
  }

  $("contentHubStatus").textContent = `本地机会池已生成，正在让 ${stage.provider || "AI"} 复核前 ${Math.min(80, opportunities.length)} 个机会...`;
  const response = await fetch(stage.endpoint || "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: "keywordAnalysis",
      stageConfig: stageConfigForRequest(stage),
      provider: stage.provider,
      model: stage.model,
      prompt: opportunityReviewPrompt(opportunities),
      project: readProject(),
    }),
  });
  const data = await response.json();
  if (!data.configured || data.status) {
    $("contentHubStatus").textContent = "本地机会池已生成；AI 复核未成功，请检查关键词分析阶段 API 配置。";
    return;
  }

  const parsed = parseJsonFromAiText(data.content || "");
  const reviews = Array.isArray(parsed) ? parsed : parsed.items || [];
  const reviewMap = new Map(reviews.map((item) => [String(item.opportunityId || ""), item]));
  state.contentHub.opportunities = opportunities
    .map((item) => {
      const review = reviewMap.get(String(item.id));
      if (!review) return item;
      const score = Number(review.score);
      return {
        ...item,
        aiReviewed: true,
        aiDecision: review.decision || "keep",
        priority: review.priority || item.priority,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : item.score,
        pageType: review.pageType || item.pageType,
        action: review.action || item.action,
        contentAngle: review.contentAngle || "",
        serpFeatureNotes: review.serpFeatureNotes || "",
        aiReason: review.reason || "",
      };
    })
    .filter((item) => item.aiDecision !== "drop")
    .sort((a, b) => b.score - a.score);

  state.contentHub.opportunityPage = 1;
  state.contentHub.selectedIds = state.contentHub.selectedIds.filter((id) =>
    state.contentHub.opportunities.some((item) => item.id === id),
  );
  renderContentHub();
  $("contentHubStatus").textContent = `AI 已复核 ${reviews.length} 个机会，当前保留 ${state.contentHub.opportunities.length} 个可写/可优化机会。`;
  saveWorkspaceDraft("AI 已复核内容机会池。");
}

async function ensureContentOpportunities({ aiReview = false } = {}) {
  const site = selectedContentSite();
  if (!site) {
    $("contentHubStatus").textContent = "请先选择一个具体站点。";
    return;
  }
  if (!state.keywords.length) {
    $("contentHubStatus").textContent = "还没有关键词。请先导入 Semrush 关键词表，再生成机会池。";
    return;
  }

  if (!contentHubPostsLoadedFor(site)) {
    $("contentHubStatus").textContent = `正在先读取 ${site.name} 的文章，然后生成机会池...`;
    await loadContentHubSitePosts({ autoPlan: true, force: false });
    if (aiReview) await aiReviewContentOpportunities();
    return;
  }

  planContentOpportunities();
  if (aiReview) await aiReviewContentOpportunities();
}

function opportunityScoreBand(score = 0) {
  if (score >= 85) return { className: "high", label: "强" };
  if (score >= 70) return { className: "medium", label: "稳" };
  if (score >= 55) return { className: "low", label: "待看" };
  return { className: "weak", label: "低" };
}

function renderOpportunityScore(score = 0) {
  const safeScore = Math.max(0, Math.min(100, Number(score || 0)));
  const band = opportunityScoreBand(safeScore);
  return `
    <div class="opportunity-score ${band.className}" title="${safeScore}/100">
      <strong>${safeScore}</strong>
      <span>${band.label}</span>
      <div class="score-bar compact"><span style="width:${safeScore}%"></span></div>
    </div>
  `;
}

function renderInternalLinkPlan(item = {}) {
  const links = item.internalLinks || [];
  const rule = item.nonMainRule || "按文章目的选择承接页。";
  const visibleLinks = links.slice(0, 3);
  const linkHtml = visibleLinks.length
    ? visibleLinks
        .map(
          (link) => `
            <span class="link-chip" title="${escapeHtml(link.url || "")}">
              ${escapeHtml(link.anchor || link.title || "内部链接")}
            </span>
          `,
        )
        .join("")
    : `<span class="link-empty">暂无强相关内链，写作时不要硬塞。</span>`;
  const more = links.length > visibleLinks.length ? `<span class="link-more">+${links.length - visibleLinks.length} 条</span>` : "";
  return `
    <div class="link-plan">
      <span class="link-rule">${escapeHtml(rule)}</span>
      <div class="link-chip-row">${linkHtml}${more}</div>
    </div>
  `;
}

function renderContentHub() {
  const siteSelect = $("contentSiteSelect");
  if (!siteSelect) return;
  const allSites = allContentSiteOptions();
  const hiddenSiteCount = allSites.filter((item) => !item.compatible).length;
  $("contentShowIncompatibleInput").checked = Boolean(state.contentHub.showIncompatibleSites);
  renderContentSiteOptions();
  $("contentNoMainLinksInput").checked = Boolean(state.contentHub.noMainOutboundLinks);

  let site = selectedContentSite();
  if (!site && state.contentHub.selectedSiteKey && !state.contentHub.showIncompatibleSites) {
    state.contentHub.selectedSiteKey = "";
    state.contentHub.posts = [];
    state.contentHub.opportunities = [];
    state.contentHub.selectedIds = [];
    state.contentHub.activeOpportunity = null;
    state.contentHub.opportunityPage = 1;
    state.contentHub.lastSummary = null;
    site = null;
    renderContentSiteOptions();
  }
  const profile = site ? inferSiteProfile(site) : null;
  const posts = postsForContentSite();
  const opportunities = state.contentHub.opportunities || [];
  const generatedForSite = latestGeneratedBatchForSelectedSite();
  const selectedSet = new Set(state.contentHub.selectedIds || []);
  const topReady = opportunities.filter((item) => selectedSet.has(item.id));
  $("contentHubSummary").innerHTML = [
    ["当前站点", site?.name || "未选择"],
    ["市场 / 语种", profile ? `${profile.targetMarket || "未配置"} / ${profile.targetLanguage || "未配置"}` : "未选择"],
    ["负责板块", profile?.contentRole || "未选择"],
    ["文章库存", `${posts.length} 篇`],
    ["关键词池", `${state.keywords.length} 个`],
    ["可写机会", `${opportunities.filter((item) => item.action === "新写文章").length} 个`],
    ["已勾选", `${topReady.length} 个`],
    ["可导入生成稿", `${generatedForSite.length} 篇`],
    ["隐藏不匹配站点", state.contentHub.showIncompatibleSites ? "已显示全部" : `${hiddenSiteCount} 个`],
  ]
    .map(([title, value]) => `<div class="summary-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join("");

  renderPostInventory("contentInventoryView", posts, contentSourceType(site), "contentHub");

  const body = $("contentOpportunityTableBody");
  body.innerHTML = "";
  const pageSize = Number(state.contentHub.opportunityPageSize || 25);
  const totalPages = Math.max(1, Math.ceil(opportunities.length / pageSize));
  state.contentHub.opportunityPage = Math.min(Math.max(1, Number(state.contentHub.opportunityPage || 1)), totalPages);
  const pageStart = (state.contentHub.opportunityPage - 1) * pageSize;
  const visibleOpportunities = opportunities.slice(pageStart, pageStart + pageSize);
  if ($("contentOpportunityPageSizeInput")) $("contentOpportunityPageSizeInput").value = String(pageSize);
  if ($("contentOpportunityInfo")) {
    $("contentOpportunityInfo").textContent = opportunities.length
      ? `第 ${state.contentHub.opportunityPage} / ${totalPages} 页，显示 ${pageStart + 1}-${pageStart + visibleOpportunities.length}，共 ${opportunities.length} 个机会`
      : "0 个机会";
  }
  if ($("prevOpportunityPageBtn")) $("prevOpportunityPageBtn").disabled = state.contentHub.opportunityPage <= 1;
  if ($("nextOpportunityPageBtn")) $("nextOpportunityPageBtn").disabled = state.contentHub.opportunityPage >= totalPages;

  if (!opportunities.length) {
    body.innerHTML = `<tr><td colspan="10">还没有机会池。点击“一键生成机会池”，系统会先读取文章，再结合关键词池规划内容机会。</td></tr>`;
  } else {
    for (const item of visibleOpportunities) {
      const matched = item.matchedPosts?.length
        ? item.matchedPosts.map((post) => post.title).join(" / ")
        : "";
      const sourceKeyword = state.keywords.find((keyword) => keyword.id === item.keywordId) || {};
      const serpNote = item.serpFeatureNotes || sourceKeyword.serpFeatures || "";
      const aiNote = item.aiReason || item.contentAngle || "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" data-opportunity-check="${escapeHtml(item.id)}" ${selectedSet.has(item.id) ? "checked" : ""} /></td>
        <td><strong>${escapeHtml(item.keyword)}</strong><span class="asset-path">${escapeHtml(item.topicCluster)}</span>${serpNote ? `<span class="asset-path">SERP: ${escapeHtml(serpNote)}</span>` : ""}</td>
        <td>${escapeHtml(item.coverage)}${matched ? `<span class="asset-path">${escapeHtml(matched)}</span>` : ""}${aiNote ? `<span class="asset-path">AI: ${escapeHtml(aiNote)}</span>` : ""}</td>
        <td>${escapeHtml(item.assignedSite)}</td>
        <td>${escapeHtml(item.pageType)}</td>
        <td>${escapeHtml(item.action)}</td>
        <td><span class="badge ${item.priority === "P0" ? "main" : ""}">${escapeHtml(item.priority)}</span></td>
        <td>${renderOpportunityScore(item.score)}</td>
        <td>${renderInternalLinkPlan(item)}</td>
        <td><button class="ghost-btn" data-use-opportunity="${escapeHtml(item.id)}">写这篇</button></td>
      `;
      body.appendChild(tr);
    }
  }

  body.querySelectorAll("[data-opportunity-check]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.opportunityCheck;
      const next = new Set(state.contentHub.selectedIds || []);
      if (checkbox.checked) next.add(id);
      else next.delete(id);
      state.contentHub.selectedIds = Array.from(next);
      renderContentHub();
      saveWorkspaceDraft();
    });
  });

  body.querySelectorAll("[data-use-opportunity]").forEach((button) => {
    button.addEventListener("click", () => useContentOpportunity(button.dataset.useOpportunity).catch((error) => {
      $("contentHubStatus").textContent = `进入写作失败：${error.message}`;
    }));
  });

  $("contentHubStatus").textContent = opportunities.length
    ? `已规划 ${opportunities.length} 个内容机会。非主站外链策略：${state.contentHub.noMainOutboundLinks ? "禁止给主站/产品页外链" : "允许按需外链"}。`
    : site
      ? `当前站点：${site.name}。系统不会自动请求远程文章；需要分析时请点击“读取/刷新文章”。`
      : "请先选择一个具体站点。";
  updateActionStates();
}

function selectTopContentOpportunities() {
  const count = Math.max(1, Number($("batchGenerateCountInput").value || 1));
  const candidates = (state.contentHub.opportunities || [])
    .filter((item) => item.action === "新写文章" && item.coverage === "未覆盖")
    .slice(0, count);
  state.contentHub.selectedIds = candidates.map((item) => item.id);
  renderContentHub();
  saveWorkspaceDraft(`已自动勾选 ${state.contentHub.selectedIds.length} 个优先新文关键词。`);
}

function clearContentOpportunitySelection() {
  state.contentHub.selectedIds = [];
  renderContentHub();
  saveWorkspaceDraft("已清空内容机会池勾选。");
}

async function useContentOpportunity(opportunityId) {
  const opportunity = (state.contentHub.opportunities || []).find((item) => item.id === opportunityId);
  if (!opportunity) throw new Error("没有找到这个内容机会。");
  state.contentHub.activeOpportunity = opportunity;
  state.selectedId = opportunity.keywordId;
  applyActivePage("production");
  history.replaceState(null, "", "/page-production#generation");
  await refreshSelected();
  document.getElementById("generation")?.scrollIntoView({ block: "start" });
}

async function listWpPosts() {
  if (!state.selectedWpSiteId) {
    $("wpPublishStatus").textContent = "请先选择或保存一个 WordPress 站点。";
    return;
  }

  $("wpPublishStatus").textContent = "正在读取 WordPress 文章列表...";
  $("wpPostsOutput").textContent = "读取中...";
  const data = await api("/api/wp-sites/posts", {
    siteId: state.selectedWpSiteId,
    perPage: 100,
    maxPages: 20,
    includeContent: false,
  });
  state.wpPosts = data.posts || [];
  renderPostInventory("wpInventoryView", state.wpPosts, "wp");
  $("wpPostsOutput").textContent = JSON.stringify(data, null, 2);
  $("wpPublishStatus").textContent = data.truncated
    ? `已读取 ${data.fetched}/${data.total} 篇文章，结果被 maxPages 截断。`
    : `已读取 ${data.fetched} 篇 WordPress 文章，可用于站点内容诊断。`;
}

async function getWpPost() {
  if (!state.selectedWpSiteId) {
    $("wpPublishStatus").textContent = "请先选择或保存一个 WordPress 站点。";
    return;
  }

  const postId = $("wpPostIdInput").value.trim();
  if (!postId) {
    $("wpPostIdInput").focus();
    $("wpPublishStatus").textContent = "请先填写 WordPress 文章 ID。";
    return;
  }

  $("wpPublishStatus").textContent = "正在读取 WordPress 单篇文章...";
  const data = await api("/api/wp-sites/post", { siteId: state.selectedWpSiteId, postId });
  renderPostInventory("wpInventoryView", [data.post].filter(Boolean), "wp");
  $("wpPostsOutput").textContent = JSON.stringify(data.post || data, null, 2);
  $("wpPublishStatus").textContent = `文章 ${postId} 已读取。`;
}

function compactKeywordsForDiagnosis(limit = 180) {
  return state.keywords.slice(0, limit).map((item) => ({
    keyword: item.keyword,
    topicCluster: item.topicCluster || item.pageGroup || item.seedKeyword || "",
    volume: item.volume || 0,
    kd: item.kd || 0,
    intent: item.intent || "",
    serpFeatures: item.serpFeatures || "",
    assignedSite: item.assignedSite || "",
    pageType: item.pageType || "",
    pageRole: item.pageRole || "",
    targetAsset: item.targetAsset || item.plannedUrl || "",
    priority: item.priority || "",
    score: item.scores?.total || 0,
  }));
}

function compactPostsForDiagnosis(posts = state.wpPosts, limit = 80) {
  return posts.slice(0, limit).map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    link: post.link,
    date: post.date,
    modified: post.modified,
    wordApprox: post.wordApprox,
    excerpt: post.excerpt,
    contentPreview: String(post.contentPreview || "").slice(0, 520),
    categories: post.categories,
    tags: post.tags,
  }));
}

function buildSiteDiagnosisPrompt(posts = state.wpPosts, sourceLabel = "WordPress") {
  const project = readProject();
  const standard = state.standard?.siteContentDiagnosis || {};
  const keywordSample = compactKeywordsForDiagnosis();
  const postSample = compactPostsForDiagnosis(posts);

  return [
    "# 站点内容诊断任务",
    "",
    `你是 Google SEO 内容诊断顾问。请基于我提供的站点定位、现有 ${sourceLabel} 文章、关键词表和诊断标准，输出中文诊断报告。`,
    "",
    "硬性规则：",
    "- 必须使用中文输出，除非标题、URL、关键词本身是英文。",
    "- 不要编造 Google 排名、流量、CTR、GSC 数据或搜索量；没有给的数据就标记为“未提供”。",
    "- 优先判断已有文章是否应该更新，不要一上来就建议新写文章。",
    "- 对每个建议给 P0/P1/P2/P3 优先级。",
    "- 区分：更新旧文章、合并/去重、补内链、新建文章。",
    "- 如果只拿到正文预览，请把判断标记为 provisional。",
    "- 如果建议优化某篇文章，请写清楚优化方向：要补什么段落、删什么重复、加哪些内链、目标关键词是什么。",
    "",
    "请严格按这些标题输出，表格优先，短段落补充：",
    ...(standard.outputFormat || [
      "## 站点内容诊断摘要",
      "## 现有文章库存表",
      "## 关键词覆盖地图",
      "## 重复竞争 / 内容重叠风险",
      "## 内链机会",
      "## 旧文章更新优先级队列",
      "## 新内容缺口机会",
      "## 下一步执行清单",
    ]).map((line) => `- ${line}`),
    "",
    "诊断标准：",
    JSON.stringify(standard, null, 2),
    "",
    "网站定位：",
    JSON.stringify(project, null, 2),
    "",
    `已导入关键词样本（最多 ${keywordSample.length} 条）：`,
    JSON.stringify(keywordSample, null, 2),
    "",
    `${sourceLabel} 文章样本（最多 ${postSample.length} 篇）：`,
    JSON.stringify(postSample, null, 2),
  ].join("\n");
}

async function aiDiagnoseWpPosts() {
  if (!state.selectedWpSiteId) {
    $("wpPublishStatus").textContent = "请先选择或保存一个 WordPress 站点。";
    return;
  }

  if (!state.wpPosts.length) {
    $("wpPublishStatus").textContent = "还没有 WP 文章缓存，正在先读取文章列表...";
    await listWpPosts();
  }

  if (!state.wpPosts.length) {
    $("wpPublishStatus").textContent = "没有读取到可诊断的 WordPress 文章。";
    return;
  }

  const stage = state.aiStages.siteDiagnosis || state.aiStages.contentOptimization;
  const prompt = buildSiteDiagnosisPrompt(state.wpPosts);
  $("wpPublishStatus").textContent = "正在调用 siteDiagnosis 阶段进行站点内容诊断...";
  $("wpPostsOutput").textContent = "AI 诊断中...";

  const data = await api("/api/generate", {
    stage: "siteDiagnosis",
    stageConfig: stageConfigForRequest(stage),
    prompt,
    model: stage?.model,
    provider: stage?.provider,
  });

  state.wpDiagnosis = data.content || data.text || JSON.stringify(data, null, 2);
  renderDiagnosisView("wpDiagnosisView", state.wpDiagnosis, { emptyText: "暂无 WordPress 诊断结果。" });
  $("wpPostsOutput").textContent = state.wpDiagnosis;
  $("wpPublishStatus").textContent = data.configured === false
    ? "siteDiagnosis 阶段还没有配置 API Key。请到 AI 阶段路由里配置 OpenAI 或中转站。"
    : "WordPress 站点内容诊断完成。";
}

async function aiDiagnoseBlogPosts() {
  if (!state.selectedBlogSiteId) {
    $("blogPublishStatus").textContent = "请先选择或保存一个自建博客站点。";
    return;
  }

  if (!state.blogPosts.length) {
    $("blogPublishStatus").textContent = "还没有自建博客文章缓存，正在先读取文章列表...";
    await listBlogPosts();
  }

  if (!state.blogPosts.length) {
    $("blogPublishStatus").textContent = "没有读取到可诊断的自建博客文章。";
    return;
  }

  const stage = state.aiStages.siteDiagnosis || state.aiStages.contentOptimization;
  const prompt = buildSiteDiagnosisPrompt(state.blogPosts, "自建博客");
  $("blogPublishStatus").textContent = "正在调用 siteDiagnosis 阶段诊断自建博客文章...";
  $("blogPostsOutput").textContent = "AI 诊断中...";

  const data = await api("/api/generate", {
    stage: "siteDiagnosis",
    stageConfig: stageConfigForRequest(stage),
    prompt,
    model: stage?.model,
    provider: stage?.provider,
  });

  state.blogDiagnosis = data.content || data.text || JSON.stringify(data, null, 2);
  renderDiagnosisView("blogDiagnosisView", state.blogDiagnosis, { emptyText: "暂无自建博客诊断结果。" });
  $("blogPostsOutput").textContent = state.blogDiagnosis;
  $("blogPublishStatus").textContent = data.configured === false
    ? "siteDiagnosis 阶段还没有配置 API Key。请到 AI 阶段路由里配置 OpenAI 或中转站。"
    : "自建博客文章诊断完成。";
}

async function readFullPostForOptimization(source, postId) {
  if (source === "main") {
    return state.mainPosts.find((post) => String(post.id || post.slug) === String(postId)) || {};
  }

  if (source === "blog") {
    const data = await api("/api/blog-sites/post", { siteId: state.selectedBlogSiteId, postId });
    return data.post || data.data || {};
  }

  const data = await api("/api/wp-sites/post", { siteId: state.selectedWpSiteId, postId });
  return data.post || {};
}

function buildPostOptimizationPrompt(post = {}, sourceLabel = "WordPress", latestDiagnosis = "") {
  const project = readProject();
  const standard = {
    articleBriefTemplate: state.standard?.articleBriefTemplate || {},
    articleRules: state.standard?.articleRules || [],
    anchorTextRules: state.standard?.anchorTextRules || {},
    siteContentDiagnosis: state.standard?.siteContentDiagnosis || {},
  };

  return [
    "# Existing Article Optimization Task",
    "",
    `请基于 ${sourceLabel} 现有文章、网站定位和 SEO 标准，输出中文内容优化方案。`,
    "",
    "硬性规则：",
    "- 不要直接假设排名、流量或 GSC 数据。",
    "- 不要为了优化而重写一切，先判断是小修、结构更新、合并、还是需要重写。",
    "- 如果正文只是 preview，要明确标记 provisional。",
    "- 内链建议只链接到已确认存在的 URL；未确认的只放在建议里。",
    "- 同一 URL 不要重复使用完全相同的锚文本。",
    "",
    "请按下面结构输出：",
    "## 优化结论",
    "## 关键词与意图判断",
    "## TDK / Slug 建议",
    "## 结构优化建议",
    "## 内容补充建议",
    "## 内链与锚文本建议",
    "## 可直接新增或改写的段落",
    "## 发布前检查清单",
    "",
    "网站定位：",
    JSON.stringify(project, null, 2),
    "",
    "SEO 标准：",
    JSON.stringify(standard, null, 2),
    "",
    "最近一次站点诊断结果（如果为空则忽略）：",
    latestDiagnosis || "未提供",
    "",
    "待优化文章：",
    JSON.stringify(post, null, 2),
  ].join("\n");
}

async function optimizeExistingPost(source, postId, context = "") {
  const isBlog = source === "blog";
  const isMain = source === "main";
  const inContentHub = context === "contentHub";
  const statusId = inContentHub ? "contentHubStatus" : isMain ? "mainPublishStatus" : isBlog ? "blogPublishStatus" : "wpPublishStatus";
  const outputId = inContentHub ? "batchGenerationLog" : isMain ? "mainPostsOutput" : isBlog ? "blogPostsOutput" : "wpPostsOutput";
  const viewId = inContentHub ? "contentOptimizationView" : isMain ? "mainDiagnosisView" : isBlog ? "blogDiagnosisView" : "wpDiagnosisView";
  const siteReady = isMain ? state.selectedMainSiteId : isBlog ? state.selectedBlogSiteId : state.selectedWpSiteId;

  if (!siteReady) {
    $(statusId).textContent = isMain ? "请先选择或保存一个主站 OpenAPI 配置。" : isBlog ? "请先选择或保存一个自建博客站点。" : "请先选择或保存一个 WordPress 站点。";
    return;
  }

  if (!postId) {
    $(statusId).textContent = "这篇文章缺少可读取的文章 ID，暂时不能做单篇优化。";
    return;
  }

  $(statusId).textContent = "正在读取单篇文章并生成优化建议...";
  const post = await readFullPostForOptimization(source, postId);
  const stage = state.aiStages.contentOptimization || state.aiStages.articleGeneration;
  const prompt = buildPostOptimizationPrompt(
    post,
    isMain ? "主站" : isBlog ? "自建博客" : "WordPress",
    isMain ? state.mainDiagnosis : isBlog ? state.blogDiagnosis : state.wpDiagnosis,
  );

  const data = await api("/api/generate", {
    stage: "contentOptimization",
    stageConfig: stageConfigForRequest(stage),
    prompt,
    model: stage?.model,
    provider: stage?.provider,
  });

  const result = data.content || data.text || JSON.stringify(data, null, 2);
  renderDiagnosisView(viewId, result, { emptyText: "暂无优化建议。" });
  $(outputId).textContent = result;
  $(statusId).textContent = data.configured === false
    ? "contentOptimization 阶段还没有配置 API Key。请先到 AI 阶段路由里配置。"
    : "单篇文章优化建议已生成。";
}

function readBlogSiteForm() {
  const normalizedApiBaseUrl = normalizeBlogApiBaseUrl($("blogApiBaseUrlInput").value);
  $("blogApiBaseUrlInput").value = normalizedApiBaseUrl;
  return {
    id: state.selectedBlogSiteId || "",
    name: $("blogSiteNameInput").value.trim(),
    apiBaseUrl: normalizedApiBaseUrl,
    openApiKey: $("blogOpenApiKeyInput").value.trim(),
    defaultAuthor: $("blogDefaultAuthorInput").value.trim() || "Admin",
    defaultStatus: $("blogDefaultStatusInput").value || "draft",
    defaultCategoryId: $("blogDefaultCategoryInput").value.trim(),
    defaultCoverUrl: $("blogDefaultCoverInput").value.trim(),
    targetMarket: $("blogTargetMarketInput").value.trim(),
    targetLanguage: $("blogTargetLanguageInput").value.trim(),
    contentRole: $("blogContentRoleInput").value || "博客A-知识教程",
    contentScope: $("blogContentScopeInput").value.trim(),
  };
}

function setBlogSiteForm(site = {}) {
  state.selectedBlogSiteId = site.id || "";
  $("blogSiteSelect").value = site.id || "";
  $("blogSiteNameInput").value = site.name || "";
  $("blogApiBaseUrlInput").value = normalizeBlogApiBaseUrl(site.apiBaseUrl || "");
  $("blogOpenApiKeyInput").value = "";
  $("blogOpenApiKeyInput").placeholder = site.openApiKeySet
    ? `已保存：${site.openApiKeyPreview}，留空则继续使用`
    : "Bearer 后面的 open api key";
  $("blogDefaultAuthorInput").value = site.defaultAuthor || "Admin";
  $("blogDefaultStatusInput").value = site.defaultStatus || "draft";
  $("blogDefaultCategoryInput").value = site.defaultCategoryId || "";
  $("blogDefaultCoverInput").value = site.defaultCoverUrl || "";
  $("blogTargetMarketInput").value = site.targetMarket || "";
  $("blogTargetLanguageInput").value = site.targetLanguage || "";
  $("blogContentRoleInput").value = site.contentRole || "博客A-知识教程";
  $("blogContentScopeInput").value = site.contentScope || "";
  updateActionStates();
}

function renderBlogSites() {
  const select = $("blogSiteSelect");
  if (!select) return;

  const current = state.selectedBlogSiteId;
  select.innerHTML = [
    `<option value="">新建自建博客配置</option>`,
    ...state.blogSites.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name || site.apiBaseUrl)}${site.openApiKeySet ? "（已保存 Key）" : ""}</option>`),
  ].join("");
  select.value = state.blogSites.some((site) => site.id === current) ? current : "";
}

async function loadBlogSites() {
  const data = await api("/api/blog-sites");
  state.blogSites = data.sites || [];
  renderBlogSites();

  if (!state.selectedBlogSiteId && state.blogSites[0]) {
    setBlogSiteForm(state.blogSites[0]);
  }

  $("blogPublishStatus").textContent = state.blogSites.length
    ? `已读取 ${state.blogSites.length} 个自建博客站点配置。`
    : "尚未配置自建博客站点。Open API Key 会保存到服务端本地配置，不会回传到浏览器。";
}

async function saveBlogSiteFromForm() {
  $("blogPublishStatus").textContent = "正在保存自建博客站点配置...";
  const data = await api("/api/blog-sites/save", { site: readBlogSiteForm() });
  state.blogSites = data.sites || [];
  setBlogSiteForm(data.site);
  renderBlogSites();
  $("blogPublishStatus").textContent = "已保存自建博客站点配置：config/blog-sites.local.json。";
}

async function testBlogSiteConnection() {
  $("blogPublishStatus").textContent = "正在测试自建博客 Open API...";
  const data = await api("/api/blog-sites/test", { site: readBlogSiteForm() });
  if (data.site) {
    state.blogSites = state.blogSites.map((site) => (site.id === data.site.id ? data.site : site));
    if (!state.blogSites.some((site) => site.id === data.site.id)) state.blogSites.push(data.site);
    setBlogSiteForm(data.site);
    renderBlogSites();
  }
  $("blogPublishStatus").textContent = `连接成功。文章列表预览 ${typeof data.count === "number" ? `${data.count} 条` : "已返回"}。`;
  $("blogPostsOutput").textContent = JSON.stringify(data.preview || data, null, 2);
}

async function deleteCurrentBlogSite() {
  if (!state.selectedBlogSiteId) {
    $("blogPublishStatus").textContent = "当前是新建配置，没有可删除的自建博客站点。";
    return;
  }

  const data = await api("/api/blog-sites/delete", { siteId: state.selectedBlogSiteId });
  state.blogSites = data.sites || [];
  setBlogSiteForm({});
  renderBlogSites();
  $("blogPostsOutput").textContent = "";
  $("blogPublishStatus").textContent = "已删除当前自建博客站点配置。";
}

async function listBlogPosts() {
  if (!state.selectedBlogSiteId) {
    $("blogPublishStatus").textContent = "请先选择或保存一个自建博客站点。";
    return;
  }

  $("blogPublishStatus").textContent = "正在读取自建博客文章列表...";
  const data = await api("/api/blog-sites/list", { siteId: state.selectedBlogSiteId });
  state.blogPosts = data.posts || [];
  renderPostInventory("blogInventoryView", state.blogPosts, "blog");
  $("blogPostsOutput").textContent = JSON.stringify(data.data || data, null, 2);
  $("blogPublishStatus").textContent = "文章列表已读取。";
}

async function getBlogPost() {
  if (!state.selectedBlogSiteId) {
    $("blogPublishStatus").textContent = "请先选择或保存一个自建博客站点。";
    return;
  }

  const postId = $("blogPostIdInput").value.trim();
  if (!postId) {
    $("blogPostIdInput").focus();
    $("blogPublishStatus").textContent = "请先填写文章 ID。";
    return;
  }

  $("blogPublishStatus").textContent = "正在读取单篇文章...";
  const data = await api("/api/blog-sites/post", { siteId: state.selectedBlogSiteId, postId });
  renderPostInventory("blogInventoryView", [data.post].filter(Boolean), "blog");
  $("blogPostsOutput").textContent = JSON.stringify(data.post || data.data || data, null, 2);
  $("blogPublishStatus").textContent = `文章 ${postId} 已读取。`;
}

async function uploadCurrentArticleToBlog() {
  if (!state.article?.trim()) {
    $("blogPublishStatus").textContent = "还没有可上传的文章。请先生成文章。";
    return;
  }

  if (!state.selectedBlogSiteId) {
    $("blogPublishStatus").textContent = "请先选择或保存一个自建博客站点。";
    return;
  }

  $("blogPublishStatus").textContent = "正在通过 /posts/batch 上传当前 Markdown 文章...";
  const data = await api("/api/blog-sites/upload", {
    siteId: state.selectedBlogSiteId,
    content: state.article,
    status: $("blogDefaultStatusInput").value || "draft",
    author: $("blogDefaultAuthorInput").value.trim() || "Admin",
    categoryId: $("blogDefaultCategoryInput").value.trim(),
    coverUrl: $("blogDefaultCoverInput").value.trim(),
    slug: state.articleParts?.slug || "",
    ...imageUploadOptions(),
  });

  const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
  const createdCount = Array.isArray(data.created) ? data.created.length : data.requested - failedCount;
  $("blogPostsOutput").textContent = JSON.stringify(data.raw || data, null, 2);
  $("blogPublishStatus").textContent = failedCount
    ? `已提交 ${data.requested} 篇，成功 ${createdCount} 篇，失败 ${failedCount} 篇。请查看下方 failed 明细。`
    : `上传成功：已通过批量接口提交 ${data.requested} 篇 Markdown 文章。${data.imageWarnings?.length ? `图片提示：${data.imageWarnings.join("；")}` : ""}`;
}

async function uploadMarkdownFilesToBlog() {
  if (!state.selectedBlogSiteId) {
    $("blogPublishStatus").textContent = "请先选择或保存一个自建博客站点。";
    return;
  }

  const files = Array.from($("blogMarkdownFilesInput").files || []);
  if (!files.length) {
    $("blogMarkdownFilesInput").focus();
    $("blogPublishStatus").textContent = "请先选择一个或多个 Markdown 文件。";
    return;
  }

  $("blogPublishStatus").textContent = `正在读取 ${files.length} 个 Markdown 文件并批量上传...`;
  const contents = await Promise.all(files.map((file) => file.text()));
  const data = await api("/api/blog-sites/batch-upload", {
    siteId: state.selectedBlogSiteId,
    contents,
    ...imageUploadOptions(),
    override: {
      status: $("blogDefaultStatusInput").value || "draft",
      author: $("blogDefaultAuthorInput").value.trim() || "Admin",
      categoryId: $("blogDefaultCategoryInput").value.trim(),
      coverUrl: $("blogDefaultCoverInput").value.trim(),
    },
  });

  const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
  const createdCount = Array.isArray(data.created) ? data.created.length : data.requested - failedCount;
  $("blogPostsOutput").textContent = JSON.stringify(data.raw || data, null, 2);
  $("blogPublishStatus").textContent = failedCount
    ? `批量上传完成：提交 ${data.requested} 篇，成功 ${createdCount} 篇，失败 ${failedCount} 篇。请查看下方 failed 明细。`
    : `批量上传成功：已提交 ${data.requested} 篇 Markdown 文章。${data.imageWarnings?.length ? `图片提示：${data.imageWarnings.join("；")}` : ""}`;
}

function readMainSiteForm() {
  return {
    id: state.selectedMainSiteId || "",
    name: $("mainSiteNameInput").value.trim(),
    apiBaseUrl: $("mainApiBaseUrlInput").value.trim() || "https://openapi.oemapps.com",
    tokenA: $("mainTokenAInput").value.trim(),
    tokenB: $("mainTokenBInput").value.trim(),
    defaultAuthor: $("mainDefaultAuthorInput").value.trim() || "Admin",
    defaultStatus: Number($("mainDefaultStatusInput").value || 0),
    defaultSrcPrefix: $("mainDefaultSrcPrefixInput").value.trim() || "/blogs/",
    defaultImageId: $("mainDefaultImageIdInput").value.trim(),
    collectContentImages: Number($("mainCollectImagesInput").value || 0),
    defaultRelatedProductIds: $("mainRelatedProductIdsInput").value.trim(),
    targetMarket: $("mainTargetMarketInput").value.trim(),
    targetLanguage: $("mainTargetLanguageInput").value.trim(),
    contentRole: $("mainContentRoleInput").value || "主站-博客",
    contentScope: $("mainContentScopeInput").value.trim(),
  };
}

function setMainSiteForm(site = {}) {
  state.selectedMainSiteId = site.id || "";
  $("mainSiteSelect").value = site.id || "";
  $("mainSiteNameInput").value = site.name || "";
  $("mainApiBaseUrlInput").value = site.apiBaseUrl || "https://openapi.oemapps.com";
  $("mainTokenAInput").value = "";
  $("mainTokenBInput").value = "";
  $("mainTokenAInput").placeholder = site.tokenASet ? `已保存：${site.tokenAPreview}，留空则继续使用` : "第一个 token 请求头";
  $("mainTokenBInput").placeholder = site.tokenBSet ? `已保存：${site.tokenBPreview}，留空则继续使用` : "第二个 token 请求头";
  $("mainDefaultAuthorInput").value = site.defaultAuthor || "Admin";
  $("mainDefaultStatusInput").value = String(site.defaultStatus ?? 0);
  $("mainDefaultSrcPrefixInput").value = site.defaultSrcPrefix || "/blogs/";
  $("mainDefaultImageIdInput").value = site.defaultImageId || "";
  $("mainCollectImagesInput").value = String(site.collectContentImages ?? 0);
  $("mainRelatedProductIdsInput").value = site.defaultRelatedProductIds || "";
  $("mainTargetMarketInput").value = site.targetMarket || "";
  $("mainTargetLanguageInput").value = site.targetLanguage || "";
  $("mainContentRoleInput").value = site.contentRole || "主站-博客";
  $("mainContentScopeInput").value = site.contentScope || "";
  updateActionStates();
}

function renderMainSites() {
  const select = $("mainSiteSelect");
  if (!select) return;
  const current = state.selectedMainSiteId;
  select.innerHTML = [
    `<option value="">新建主站 OpenAPI 配置</option>`,
    ...state.mainSites.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name || site.apiBaseUrl)}${site.tokenASet && site.tokenBSet ? "（已保存 token）" : ""}</option>`),
  ].join("");
  select.value = state.mainSites.some((site) => site.id === current) ? current : "";
}

async function loadMainSites() {
  const data = await api("/api/main-sites");
  state.mainSites = data.sites || [];
  renderMainSites();
  if (!state.selectedMainSiteId && state.mainSites[0]) setMainSiteForm(state.mainSites[0]);
  $("mainPublishStatus").textContent = state.mainSites.length
    ? `已读取 ${state.mainSites.length} 个主站 OpenAPI 配置。`
    : "尚未配置主站 OpenAPI。两个 token 会保存到服务端本地配置，不会回传到浏览器。";
}

async function saveMainSiteFromForm() {
  $("mainPublishStatus").textContent = "正在保存主站 OpenAPI 配置...";
  const data = await api("/api/main-sites/save", { site: readMainSiteForm() });
  state.mainSites = data.sites || [];
  setMainSiteForm(data.site);
  renderMainSites();
  $("mainPublishStatus").textContent = "已保存主站 OpenAPI 配置：config/main-sites.local.json。";
}

async function testMainSiteConnection() {
  $("mainPublishStatus").textContent = "正在测试主站 OpenAPI...";
  const data = await api("/api/main-sites/test", {
    site: readMainSiteForm(),
    source: "main-site-test-button",
    requestId: requestId("main-site-test"),
  });
  if (data.site) {
    state.mainSites = state.mainSites.map((site) => (site.id === data.site.id ? data.site : site));
    if (!state.mainSites.some((site) => site.id === data.site.id)) state.mainSites.push(data.site);
    setMainSiteForm(data.site);
    renderMainSites();
  }
  state.mainPosts = data.posts || [];
  renderPostInventory("mainInventoryView", state.mainPosts, "main");
  $("mainPostsOutput").textContent = JSON.stringify(data, null, 2);
  $("mainPublishStatus").textContent = `连接成功，已预览 ${data.fetched || 0} 篇主站文章。`;
}

async function deleteCurrentMainSite() {
  if (!state.selectedMainSiteId) {
    $("mainPublishStatus").textContent = "当前是新建配置，没有可删除的主站配置。";
    return;
  }

  const data = await api("/api/main-sites/delete", { siteId: state.selectedMainSiteId });
  state.mainSites = data.sites || [];
  state.mainPosts = [];
  state.mainDiagnosis = "";
  setMainSiteForm({});
  renderMainSites();
  renderPostInventory("mainInventoryView", [], "main");
  renderDiagnosisView("mainDiagnosisView", "", { emptyText: "暂无主站诊断结果。" });
  $("mainPostsOutput").textContent = "";
  $("mainPublishStatus").textContent = "已删除当前主站 OpenAPI 配置。";
}

async function listMainPosts({ force = false } = {}) {
  if (!state.selectedMainSiteId) {
    $("mainPublishStatus").textContent = "请先选择或保存一个主站 OpenAPI 配置。";
    return;
  }

  $("mainPublishStatus").textContent = "正在读取主站文章列表...";
  const data = await api("/api/main-sites/list", {
    siteId: state.selectedMainSiteId,
    pageSize: 100,
    maxPages: 20,
    force,
    source: "main-posts-list-button",
    requestId: requestId("main-posts-list"),
  });
  state.mainPosts = data.posts || [];
  renderPostInventory("mainInventoryView", state.mainPosts, "main");
  $("mainPostsOutput").textContent = JSON.stringify(data, null, 2);
  const cacheNote = data.cached ? "（使用本地缓存/冷却保护）" : "";
  $("mainPublishStatus").textContent = data.truncated
    ? `已读取 ${data.fetched}/${data.total} 篇主站文章，结果被截断。${cacheNote}`
    : `已读取 ${data.fetched} 篇主站文章。${cacheNote}`;
}

async function aiDiagnoseMainPosts() {
  if (!state.selectedMainSiteId) {
    $("mainPublishStatus").textContent = "请先选择或保存一个主站 OpenAPI 配置。";
    return;
  }

  if (!state.mainPosts.length) await listMainPosts();
  if (!state.mainPosts.length) {
    $("mainPublishStatus").textContent = "没有读取到可诊断的主站文章。";
    return;
  }

  const stage = state.aiStages.siteDiagnosis || state.aiStages.contentOptimization;
  const prompt = buildSiteDiagnosisPrompt(state.mainPosts, "主站");
  $("mainPublishStatus").textContent = "正在调用 siteDiagnosis 阶段诊断主站文章...";
  $("mainPostsOutput").textContent = "AI 诊断中...";
  const data = await api("/api/generate", {
    stage: "siteDiagnosis",
    stageConfig: stageConfigForRequest(stage),
    prompt,
    model: stage?.model,
    provider: stage?.provider,
  });
  state.mainDiagnosis = data.content || data.text || JSON.stringify(data, null, 2);
  renderDiagnosisView("mainDiagnosisView", state.mainDiagnosis, { emptyText: "暂无主站诊断结果。" });
  $("mainPostsOutput").textContent = state.mainDiagnosis;
  $("mainPublishStatus").textContent = data.configured === false
    ? "siteDiagnosis 阶段还没有配置 API Key。请到 AI 阶段路由里配置 OpenAI 或中转站。"
    : "主站文章诊断完成。";
}

async function uploadCurrentArticleToMain() {
  if (!state.article?.trim()) {
    $("mainPublishStatus").textContent = "还没有可上传的文章。请先生成文章。";
    return;
  }
  if (!state.selectedMainSiteId) {
    $("mainPublishStatus").textContent = "请先选择或保存一个主站 OpenAPI 配置。";
    return;
  }

  $("mainPublishStatus").textContent = "正在上传当前文章到主站...";
  const data = await api("/api/main-sites/upload", {
    siteId: state.selectedMainSiteId,
    content: state.article,
    ...imageUploadOptions(),
    override: {
      status: Number($("mainDefaultStatusInput").value || 0),
      authorName: $("mainDefaultAuthorInput").value.trim() || "Admin",
      srcPrefix: $("mainDefaultSrcPrefixInput").value.trim() || "/blogs/",
      imageId: $("mainDefaultImageIdInput").value.trim(),
      collectContentImages: Number($("mainCollectImagesInput").value || 0),
      relatedProductIds: $("mainRelatedProductIdsInput").value.trim(),
    },
  });
  $("mainPostsOutput").textContent = JSON.stringify(data, null, 2);
  $("mainPublishStatus").textContent = `主站文章上传成功：${data.payloadPreview?.title || "Untitled"}。${data.imageWarnings?.length ? `图片提示：${data.imageWarnings.join("；")}` : ""}`;
}

function stageConfigForRequest(stage) {
  const { apiKey, clearApiKey, ...safeStage } = stage || {};
  return safeStage;
}

function applyDeepSeekToAllStages() {
  const next = mergeAiStages(state.aiStages);

  for (const [stageKey, stage] of Object.entries(next)) {
    const isHeavyWritingStage = stageKey === "articleGeneration" || stageKey === "contentOptimization";
    next[stageKey] = {
      ...stage,
      provider: "deepseek",
      apiFormat: "openai-compatible",
      baseUrl: "https://api.deepseek.com",
      model: isHeavyWritingStage ? "deepseek-v4-pro" : "deepseek-v4-flash",
      endpoint: "/api/generate",
      temperature: isHeavyWritingStage ? 0.7 : 0.2,
    };
  }

  state.aiStages = next;
  renderAll();
  $("aiConfigStatus").textContent = "所有阶段已切换为 DeepSeek，记得填写 API Key 并保存到服务端。";
  setArticleOutput("已把所有 AI 阶段切换为 DeepSeek。请在每个阶段填入同一个 DeepSeek API Key，或只填一次后保存并复用服务端配置。");
}

function applyDeepSeekKeyToAllStages() {
  const key = $("deepSeekApiKeyInput").value.trim();
  if (!key) {
    $("deepSeekApiKeyInput").focus();
    $("aiConfigStatus").textContent = "请先填写 DeepSeek API Key。";
    return;
  }

  state.aiStages = Object.fromEntries(
    Object.entries(state.aiStages).map(([stageKey, stage]) => [
      stageKey,
      {
        ...stage,
        provider: "deepseek",
        apiFormat: "openai-compatible",
        baseUrl: "https://api.deepseek.com",
        apiKey: key,
        endpoint: "/api/generate",
        model:
          stageKey === "articleGeneration" || stageKey === "contentOptimization"
            ? "deepseek-v4-pro"
            : "deepseek-v4-flash",
      },
    ]),
  );

  $("deepSeekApiKeyInput").value = "";
  $("aiConfigStatus").textContent = "DeepSeek API Key 已应用到所有阶段。下一步请点击“保存到服务端”。";
  renderAiStages();
}

function statusLabel(status) {
  return {
    todo: "待做",
    doing: "进行中",
    done: "已完成",
  }[status] || "待做";
}

async function loadTodos() {
  const data = await api("/api/todos");
  state.todos = data.todos || [];
  renderTodos();
}

async function saveTodos() {
  const data = await api("/api/todos", { todos: state.todos });
  state.todos = data.todos || [];
  $("todoStatusMessage").textContent = data.message || "Todo 已保存。";
  renderTodos();
}

function addTodo() {
  const title = $("todoTitleInput").value.trim();
  if (!title) {
    $("todoTitleInput").focus();
    $("todoStatusMessage").textContent = "请先写一个待办标题。";
    return;
  }

  state.todos.unshift({
    id: `todo-${Date.now()}`,
    title,
    category: $("todoCategoryInput").value,
    priority: $("todoPriorityInput").value,
    status: "todo",
    note: $("todoNoteInput").value.trim(),
    createdAt: new Date().toISOString(),
  });

  $("todoTitleInput").value = "";
  $("todoNoteInput").value = "";
  $("todoStatusMessage").textContent = "已加入待办，记得保存。";
  renderTodos();
}

function updateTodo(id, action) {
  if (action === "delete") {
    state.todos = state.todos.filter((todo) => todo.id !== id);
    $("todoStatusMessage").textContent = "已删除，记得保存。";
    renderTodos();
    return;
  }

  state.todos = state.todos.map((todo) =>
    todo.id === id
      ? {
          ...todo,
          status: action,
          updatedAt: new Date().toISOString(),
        }
      : todo,
  );
  $("todoStatusMessage").textContent = "状态已更新，记得保存。";
  renderTodos();
}

function readProject() {
  const market = readSelectOrCustom("marketInput", "customMarketInput");
  return {
    domain: $("domainInput").value.trim(),
    siteType: $("siteTypeInput").value,
    market,
    locale: resolveSeoLocale(market),
    conversion: readSelectOrCustom("conversionInput", "customConversionInput"),
    coreProducts: $("coreProductsInput").value.trim(),
    mainPages: $("mainPagesInput").value.trim(),
    blogRoles: $("blogRolesInput").value.trim(),
    siteApis: {
      mainPagesApi: $("mainSiteApiInput").value.trim(),
      mainBlogApi: $("mainBlogApiInput").value.trim(),
      blogApis: $("blogApisInput").value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    },
  };
}

const PROJECT_PRESETS = {
  d2c: {
    siteType: "2C商城",
    conversion: "Add to cart / Purchase",
    coreProducts: "vape, disposable vape, nicotine free vape, e-liquid",
    mainPages: "/collections/disposable-vapes\n/collections/nicotine-free-vapes\n/collections/vape-flavours\n/blogs/guides",
    blogRoles:
      "博客A：知识教程 / FAQ / 合规科普，谨慎导流\n博客B：场景人群 / 口味灵感 / 新手选择\n博客C：对比评测 / Best / VS / 替代方案",
  },
  b2b: {
    siteType: "B2B询盘站",
    conversion: "Lead form / WhatsApp / Email inquiry",
    coreProducts: "manufacturer, supplier, industrial solution, custom product",
    mainPages: "/products\n/solutions\n/applications\n/case-studies\n/contact-us",
    blogRoles:
      "博客A：行业知识 / 技术 FAQ / 标准解释\n博客B：应用场景 / 行业解决方案 / 采购指南\n博客C：品牌对比 / 方案对比 / 替代方案",
  },
  content: {
    siteType: "内容站",
    conversion: "Subscribe / Affiliate click / Ad revenue",
    coreProducts: "guide, review, tool, template",
    mainPages: "/guides\n/reviews\n/best\n/tools\n/newsletter",
    blogRoles:
      "博客A：基础知识 / 术语解释 / 入门教程\n博客B：人群场景 / 问题解决 / 清单模板\n博客C：评测排行 / 工具对比 / 购买前研究",
  },
};

function applyProjectPreset(presetKey) {
  const preset = PROJECT_PRESETS[presetKey];
  if (!preset) return;

  $("siteTypeInput").value = preset.siteType;
  setSelectOrCustom("conversionInput", "customConversionInput", "customConversionField", preset.conversion);
  $("coreProductsInput").value = preset.coreProducts;
  $("mainPagesInput").value = preset.mainPages;
  $("blogRolesInput").value = preset.blogRoles;
  state.project = readProject();
  saveWorkspaceDraft("已应用网站定位模板，并自动保存到本机浏览器。");
  setArticleOutput("已应用网站定位模板。后续关键词分析、Brief 和 Prompt 都会带上这些定位信息。");
}

function selectedItem() {
  return state.keywords.find((item) => item.id === state.selectedId) || state.keywords[0] || null;
}

function marketMismatchSummary(keywords = state.keywords) {
  const mismatches = keywords.filter((item) => item.marketMismatch);
  if (!mismatches.length) return "";
  const sample = mismatches
    .slice(0, 3)
    .map((item) => `${item.keyword} (${item.database || "unknown"})`)
    .join(", ");
  return ` P0 Locale warning: ${mismatches.length} keywords do not match selected target market database. Examples: ${sample}.`;
}

function visibleKeywords() {
  if (state.filter === "全部") return state.keywords;
  return state.keywords.filter((item) => item.assignedSite === state.filter);
}

function paginatedKeywords() {
  const items = visibleKeywords();
  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  state.tablePage = Math.min(Math.max(1, state.tablePage), totalPages);
  const start = (state.tablePage - 1) * state.pageSize;
  return {
    items: items.slice(start, start + state.pageSize),
    total: items.length,
    totalPages,
    start,
  };
}

function findHeading(content, pattern) {
  const match = new RegExp(`^##\\s+${pattern}\\s*$`, "im").exec(content);
  return match ? match.index : -1;
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

function splitArticleForWp(content = "") {
  const markdown = String(content || "").trim();
  if (!markdown) {
    return {
      meta: "",
      body: "",
      references: "",
      images: "",
      links: "",
      qa: "",
      full: "",
      slug: "",
      title: "",
    };
  }

  const title = extractH2Value(markdown, "Title") || markdown.match(/^#\s+(.+)$/m)?.[1] || "";
  const metaTitle = extractH2Value(markdown, "Meta Title");
  const metaDescription = extractH2Value(markdown, "Meta Description");
  const slug = extractH2Value(markdown, "URL Slug") || slugify(title || selectedItem()?.keyword || "seo-article");
  const primaryKeywordBlock = extractH2Block(markdown, "Primary Keyword(?::.*)?");
  const secondaryKeywordsBlock = extractH2Block(markdown, "Secondary Keywords(?::.*)?");
  const lastUpdated = extractH2Value(markdown, "Last Updated");
  const firstH1 = markdown.search(/^#\s+/m);

  const tailPatterns = [
    ["references", "References|Sources Used"],
    ["images", "Image Placement Map|Images? / Tables?|图片"],
    ["links", "Internal Link Suggestions|Internal Link & Anchor Text Map"],
    ["qa", "Content QA Checklist|Evidence Needed|Content Notes|QA / Evidence"],
  ];

  const tailBlocks = Object.fromEntries(tailPatterns.map(([key]) => [key, ""]));
  const tailPositions = [];
  for (const [key, pattern] of tailPatterns) {
    const block = extractH2Block(markdown, pattern);
    tailBlocks[key] = block;
    const pos = findHeading(markdown, pattern);
    if (pos >= 0) tailPositions.push(pos);
  }

  const bodyStart = firstH1 >= 0 ? firstH1 : 0;
  const bodyEnd = tailPositions.length ? Math.min(...tailPositions.filter((pos) => pos >= bodyStart)) : markdown.length;
  const body = markdown.slice(bodyStart, bodyEnd).trim();
  const metaLines = [
    title ? `## Title\n\n${title}` : "",
    metaTitle ? `## Meta Title\n\n${metaTitle}` : "",
    metaDescription ? `## Meta Description\n\n${metaDescription}` : "",
    slug ? `## URL Slug\n\n${slug}` : "",
    primaryKeywordBlock,
    secondaryKeywordsBlock,
    lastUpdated ? `## Last Updated\n\n${lastUpdated}` : "",
  ].filter(Boolean);

  return {
    meta: metaLines.join("\n\n"),
    body,
    references: tailBlocks.references,
    images: tailBlocks.images,
    links: tailBlocks.links,
    qa: [tailBlocks.qa].filter(Boolean).join("\n\n"),
    full: markdown,
    slug,
    title,
  };
}

function renderArticleParts(content = state.article) {
  const parts = splitArticleForWp(content);
  state.articleParts = parts;

  $("articleMetaOutput").textContent = parts.meta || "暂无 WordPress 字段。生成文章后会显示 Title、Meta Title、Meta Description、Slug 等。";
  $("articleBodyOutput").textContent = parts.body || "暂无正文。";
  $("articleReferencesOutput").textContent = parts.references || "未触发 References，或文章中没有 References 模块。";
  $("articleImageOutput").textContent = parts.images || "暂无 Image Placement Map。";
  $("articleLinksOutput").textContent = parts.links || "暂无 Internal Link Suggestions。";
  $("articleQaOutput").textContent = parts.qa || "暂无 Evidence Needed / Content QA Checklist。";
  $("articleOutput").textContent = parts.full || "这里会显示完整 Markdown。";
}

function setArticleOutput(message) {
  renderArticleParts(String(message || ""));
  if ($("articleSaveStatus") && !state.articleSave) {
    $("articleSaveStatus").textContent = "生成后的文章会自动保存到 generated-articles/站点名/ 目录。";
  }
}

function scorePriority(score) {
  const total = Number(score || 0);
  const thresholds = state.standard?.scoring?.thresholds || { P0: 78, P1: 65, P2: 50 };
  if (total >= thresholds.P0) return "P0";
  if (total >= thresholds.P1) return "P1";
  if (total >= thresholds.P2) return "P2";
  return "P3";
}

async function previewSiteApis() {
  $("siteApiPreview").textContent = "正在测试站点 API 数据源...";
  const data = await api("/api/site-snapshot", {
    project: readProject(),
    productApi: readProductApiForm(),
  });
  $("siteApiPreview").textContent = JSON.stringify(data, null, 2);
}

function renderMetrics() {
  const main = state.keywords.filter((item) => item.assignedSite?.startsWith("主站")).length;
  const blogs = state.keywords.filter((item) => item.assignedSite?.startsWith("博客")).length;
  const priority = state.keywords.filter((item) => item.priority === "P0" || item.priority === "P1").length;

  $("metricTotal").textContent = state.keywords.length;
  $("metricMain").textContent = main;
  $("metricBlogs").textContent = blogs;
  $("metricPriority").textContent = priority;
}

function renderLocaleStatus() {
  const status = $("localeStatus");
  if (!status) return;
  status.textContent = localeStatusTextSafe(resolveSeoLocale(readSelectOrCustom("marketInput", "customMarketInput")));
}

function renderStandard() {
  if (!state.standard) {
    $("standardSummary").innerHTML = `<div class="summary-card"><strong>标准尚未载入</strong><span>请确认本地服务已经启动。</span></div>`;
    return;
  }

  const signals = state.standard.signals || {};
  const references = state.standard.references?.triggers || {};
  const anchorTextRules = state.standard.anchorTextRules || {};
  const sheets = state.standard.excelSheets || {};
  if (!state.standardDirty && document.activeElement !== $("standardEditor")) {
    $("standardEditor").value = JSON.stringify(state.standard, null, 2);
  }
  $("standardSummary").innerHTML = [
    ["标准版本", state.standard.version || "unknown"],
    ["站点分配", (state.standard.sites || []).join(" / ")],
    ["信号词库", Object.entries(signals).map(([key, list]) => `${key}: ${list.length}`).join("；")],
    ["Excel 表", Object.values(sheets).map((sheet) => sheet.sheetName).join(" / ")],
    ["References", Object.keys(references).length ? Object.keys(references).join(" / ") : "0 引用默认允许"],
    ["锚文本规则", anchorTextRules.policy || "natural_contextual_variation"],
    ["文章输出格式", state.standard.articleOutputFormat?.name || "WordPress Import Markdown"],
  ]
    .map(([title, body]) => `<div class="summary-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`)
    .join("");
}

function renderFilters() {
  const wrap = $("siteFilters");
  wrap.innerHTML = "";

  for (const site of state.sites || FALLBACK_SITES) {
    const button = document.createElement("button");
    button.className = `filter-chip${state.filter === site ? " active" : ""}`;
    button.textContent = site;
    button.addEventListener("click", () => {
      state.filter = site;
      state.tablePage = 1;
      renderAll();
      saveWorkspaceDraft();
    });
    wrap.appendChild(button);
  }
}

function renderTable() {
  const body = $("keywordTableBody");
  const page = paginatedKeywords();
  const items = page.items;
  body.innerHTML = "";
  $("paginationInfo").textContent = page.total
    ? `第 ${state.tablePage} / ${page.totalPages} 页，显示 ${page.start + 1}-${page.start + items.length}，共 ${page.total} 条`
    : "0 条";
  $("pageSizeInput").value = String(state.pageSize);
  $("prevPageBtn").disabled = state.tablePage <= 1;
  $("nextPageBtn").disabled = state.tablePage >= page.totalPages;

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="13">还没有关键词。请上传 Semrush 文件、粘贴 CSV，或后续通过网站/关键词 API 自动导入。</td>`;
    body.appendChild(tr);
    return;
  }

  for (const item of items) {
    const total = Number(item.scores?.total || 0);
    const tr = document.createElement("tr");
    tr.className = state.selectedId === item.id ? "selected" : "";
    tr.innerHTML = `
      <td class="keyword-name">${escapeHtml(item.keyword)}</td>
      <td>${escapeHtml(item.topicCluster || item.pageGroup || item.seedKeyword || item.keyword)}</td>
      <td>${escapeHtml(item.volume || 0)}</td>
      <td>${escapeHtml(item.kd || 0)}</td>
      <td>${escapeHtml(item.intent || "unknown")}</td>
      <td>
        <span class="badge ${item.assignedSite?.startsWith("主站") ? "main" : item.assignedSite === "暂不做" ? "pause" : ""}">${escapeHtml(item.assignedSite)}</span>
        ${item.aiReview ? `<span class="badge ai" title="AI confidence: ${escapeHtml(item.aiReview.confidence)}%">AI</span>` : ""}
      </td>
      <td>${escapeHtml(item.pageType)}</td>
      <td>${escapeHtml(item.pageRole || "")}</td>
      <td>
        <span class="badge ${item.assetStatus === "existing" ? "main" : item.assetStatus === "planned" ? "planned" : ""}">${escapeHtml(item.assetStatus || "missing")}</span>
        <span class="asset-path">${escapeHtml(item.targetAsset || item.plannedUrl || "待确认")}</span>
      </td>
      <td>${escapeHtml(item.contentAction || "")}</td>
      <td>${escapeHtml(item.priority)}</td>
      <td><div class="score-bar" title="${total}/100"><span style="width:${total}%"></span></div></td>
      <td><button class="ghost-btn" data-id="${escapeHtml(item.id)}">查看 Brief</button></td>
    `;
    tr.addEventListener("click", () => selectKeyword(item.id));
    tr.querySelector("button").addEventListener("click", (event) => {
      event.stopPropagation();
      selectKeyword(item.id)
        .then(() => {
          applyActivePage("production");
          history.replaceState(null, "", "#brief");
          document.querySelector("#brief").scrollIntoView({ behavior: "smooth" });
        })
        .catch((error) => {
          applyActivePage("production");
          setArticleOutput(`生成 Brief 失败：${error.message}`);
        });
    });
    body.appendChild(tr);
  }
}

function renderBrief() {
  const item = selectedItem();
  $("briefTitle").textContent = item ? item.keyword : "请选择一个关键词";
  $("briefMeta").innerHTML = item
    ? `
      <span class="badge ${item.assignedSite?.startsWith("主站") ? "main" : ""}">${escapeHtml(item.assignedSite)}</span>
      <span class="badge">${escapeHtml(item.pageType)}</span>
      <span class="badge">${escapeHtml(item.priority)} · ${escapeHtml(item.scores?.total || 0)}</span>
    `
    : "";
  $("briefOutput").textContent = state.brief || "选择关键词后，这里会生成可交给 AI 或写手的 Brief。";
}

function renderAiStages() {
  $("stageConfigGrid").innerHTML = Object.entries(state.aiStages)
    .map(([key, stage]) => {
      const displayLabel = AI_STAGE_DEFS[key]?.label || stage.label || key;
      const displayHint = AI_STAGE_DEFS[key]?.hint || stage.hint || "";
      const providerOptions = PROVIDERS.map(
        (provider) => `<option value="${provider}" ${stage.provider === provider ? "selected" : ""}>${provider}</option>`,
      ).join("");
      const formatOptions = API_FORMATS.map(
        ([value, label]) => `<option value="${value}" ${stage.apiFormat === value ? "selected" : ""}>${label}</option>`,
      ).join("");
      const keyStatus = stage.apiKeySet
        ? `已配置：${stage.apiKeyPreview || "****"}`
        : "未配置";
      return `
        <article class="stage-card" data-stage="${key}">
          <h4>${escapeHtml(displayLabel)}</h4>
          <p>${escapeHtml(displayHint)}</p>
          <p class="key-status">密钥状态：${escapeHtml(keyStatus)}</p>
          <div class="stage-fields">
            <label>
              供应商
              <select data-stage-field="provider">${providerOptions}</select>
            </label>
            <label>
              调用格式
              <select data-stage-field="apiFormat">${formatOptions}</select>
            </label>
            <label>
              Base URL / 中转站地址
              <input data-stage-field="baseUrl" type="text" value="${escapeHtml(stage.baseUrl || "")}" placeholder="例如：https://api.example.com/v1" />
            </label>
            <label>
              模型名称
              <input data-stage-field="model" type="text" value="${escapeHtml(stage.model || "")}" placeholder="例如：gpt-4.1-mini / deepseek-chat" />
            </label>
            <label>
              温度 temperature
              <input data-stage-field="temperature" type="number" min="0" max="2" step="0.1" value="${escapeHtml(stage.temperature ?? 0.7)}" />
            </label>
            <label>
              本地代理端点
              <input data-stage-field="endpoint" type="text" value="${escapeHtml(stage.endpoint || "/api/generate")}" />
            </label>
            <label>
              API Key
              <input data-stage-field="apiKey" type="password" value="" placeholder="${stage.apiKeySet ? "留空表示不修改现有 Key" : "填写后保存到服务端"}" autocomplete="off" />
            </label>
            <label class="checkbox-field">
              <input data-stage-field="clearApiKey" type="checkbox" />
              清除这个阶段已保存的 API Key
            </label>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".stage-card").forEach((card) => {
    const stageKey = card.dataset.stage;
    card.querySelectorAll("[data-stage-field]").forEach((input) => {
      const eventName = input.type === "checkbox" ? "change" : "input";
      input.addEventListener(eventName, () => {
        const field = input.dataset.stageField;
        if (input.type === "checkbox") {
          state.aiStages[stageKey][field] = input.checked;
          return;
        }
        state.aiStages[stageKey][field] = input.value;
      });
    });
  });
}

function renderGeneration() {
  $("promptOutput").value = state.prompt || "";
  renderArticleParts(state.article || "这里会显示 AI 复核结果或文章 Markdown。Local/Mock 阶段不会调用外部 API；外部阶段会通过服务端代理转发。");
  if ($("articleSaveStatus")) {
    $("articleSaveStatus").textContent = state.articleSave?.relativePath
      ? `已自动保存：${state.articleSave.relativePath}`
      : "生成后的文章会自动保存到 generated-articles/站点名/ 目录。";
  }
  updateActionStates();
}

function hasConfiguredSiteApi() {
  const siteApis = readProject().siteApis || {};
  return Boolean(
    siteApis.mainPagesApi ||
      siteApis.mainBlogApi ||
      siteApis.blogApis?.length ||
      $("productApiEndpointInput")?.value.trim() ||
      state.productAssets?.api?.endpoint,
  );
}

function generatedArticlesForSelectedContentSite() {
  const site = selectedContentSite();
  if (!site) return [];
  return (state.contentHub.generatedArticles || []).filter((article) => article.siteKey === site.key);
}

function latestGeneratedBatchForSelectedSite() {
  const site = selectedContentSite();
  const batchId = String(state.contentHub.lastBatchId || "");
  if (!site || !batchId || state.contentHub.lastBatchSiteKey !== site.key) return [];
  return (state.contentHub.generatedArticles || []).filter(
    (article) => article.siteKey === site.key && article.batchId === batchId,
  );
}

function uploadableArticlesForLatestBatch() {
  return latestGeneratedBatchForSelectedSite().filter(
    (article) => !article.uploadedAt && (String(article.content || "").trim() || article.savedPath),
  );
}

function createContentGenerationBatch(site = selectedContentSite()) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
  const sitePart = slugify(site?.name || "site").slice(0, 36) || "site";
  const suffix = Math.random().toString(36).slice(2, 7);
  const batchId = `${stamp}-${sitePart}-${suffix}`;
  return {
    batchId,
    batchLabel: now.toLocaleString(),
  };
}

function updateActionStates() {
  const selected = selectedItem();
  const hasKeywords = state.keywords.length > 0;
  const hasSelectedKeyword = Boolean(selected);
  const hasBrief = Boolean(state.brief?.trim());
  const hasArticle = Boolean(state.article?.trim());
  const contentSite = selectedContentSite();
  const contentPosts = postsForContentSite();
  const opportunities = state.contentHub.opportunities || [];
  const selectedOpportunityCount = (state.contentHub.selectedIds || []).length;
  const generatedForSite = uploadableArticlesForLatestBatch();
  const hasProductEndpoint = Boolean($("productApiEndpointInput")?.value.trim() || state.productAssets?.api?.endpoint);
  const hasProductAssets = Boolean(state.productAssets?.products?.length);

  setActionEnabled("previewSiteApisBtn", hasConfiguredSiteApi(), "先在上方填写至少一个站点 API 地址。");
  setActionEnabled("reanalyzeKeywordsBtn", hasKeywords, "先导入或粘贴关键词。");
  setActionEnabled("clearKeywordsBtn", hasKeywords, "当前没有关键词可清空。");
  setActionEnabled("exportCsvBtn", hasKeywords, "先导入关键词后再导出。");
  setActionEnabled("exportCalendarBtn", hasKeywords, "先导入关键词，系统才有内容日历可导出。");
  setActionEnabled("downloadStandardBtn", Boolean(state.standard), "SEO 标准还没有载入。");

  setActionEnabled("copyBriefBtn", hasBrief, "先在关键词池选择一个关键词生成 Brief。");
  setActionEnabled("buildPromptBtn", hasSelectedKeyword, "先在关键词池或内容中枢选择一个关键词。");
  setActionEnabled("mockGenerateBtn", hasSelectedKeyword, "先选择一个关键词，系统会自动准备 Brief 和 Prompt。");
  setActionEnabled("copyMetaBtn", hasArticle, "先生成文章。");
  setActionEnabled("copyBodyBtn", hasArticle, "先生成文章。");
  setActionEnabled("copyArticleBtn", hasArticle, "先生成文章。");
  setActionEnabled("downloadArticleBtn", hasArticle, "先生成文章。");

  setActionEnabled("loadContentSitePostsBtn", Boolean(contentSite), "先选择要分析的站点。");
  setActionEnabled("planContentOpportunitiesBtn", Boolean(contentSite && hasKeywords), "先选择站点并导入关键词。");
  setActionEnabled("selectTopOpportunitiesBtn", opportunities.length > 0, "先生成内容机会池。");
  setActionEnabled("clearOpportunitySelectionBtn", selectedOpportunityCount > 0, "当前没有勾选机会。");
  setActionEnabled("batchGenerateSelectedBtn", selectedOpportunityCount > 0, "先在内容机会池勾选要生成的关键词。");
  setActionEnabled("batchUploadGeneratedBtn", Boolean(contentSite && generatedForSite.length), "先为当前站点批量生成文章。");

  setActionEnabled("listWpPostsBtn", Boolean(state.selectedWpSiteId), "先保存或选择一个 WordPress 站点。");
  setActionEnabled("aiDiagnoseWpPostsBtn", Boolean(state.selectedWpSiteId), "先保存或选择一个 WordPress 站点。");
  setActionEnabled("getWpPostBtn", Boolean(state.selectedWpSiteId), "先保存或选择一个 WordPress 站点。");
  setActionEnabled("deleteWpSiteBtn", Boolean(state.selectedWpSiteId), "当前是新建配置，没有可删除站点。");
  setActionEnabled("uploadCurrentArticleBtn", Boolean(state.selectedWpSiteId && hasArticle), "先选择 WordPress 站点并生成文章。");

  setActionEnabled("listBlogPostsBtn", Boolean(state.selectedBlogSiteId), "先保存或选择一个自建博客站点。");
  setActionEnabled("aiDiagnoseBlogPostsBtn", Boolean(state.selectedBlogSiteId), "先保存或选择一个自建博客站点。");
  setActionEnabled("getBlogPostBtn", Boolean(state.selectedBlogSiteId), "先保存或选择一个自建博客站点。");
  setActionEnabled("uploadBlogMarkdownFilesBtn", Boolean(state.selectedBlogSiteId), "先保存或选择一个自建博客站点。");
  setActionEnabled("deleteBlogSiteBtn", Boolean(state.selectedBlogSiteId), "当前是新建配置，没有可删除站点。");
  setActionEnabled("uploadCurrentBlogArticleBtn", Boolean(state.selectedBlogSiteId && hasArticle), "先选择自建博客站点并生成文章。");

  setActionEnabled("listMainPostsBtn", Boolean(state.selectedMainSiteId), "先保存或选择一个主站 OpenAPI 配置。");
  setActionEnabled("aiDiagnoseMainPostsBtn", Boolean(state.selectedMainSiteId), "先保存或选择一个主站 OpenAPI 配置。");
  setActionEnabled("deleteMainSiteBtn", Boolean(state.selectedMainSiteId), "当前是新建配置，没有可删除主站。");
  setActionEnabled("uploadCurrentMainArticleBtn", Boolean(state.selectedMainSiteId && hasArticle), "先选择主站 OpenAPI 配置并生成文章。");
}

function renderTodos() {
  const list = $("todoList");
  const todos = [...state.todos].sort((a, b) => {
    const order = { todo: 0, doing: 1, done: 2 };
    const priority = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9);
  });

  $("todoCountBadge").textContent = `${todos.length} 项`;

  if (!todos.length) {
    list.innerHTML = `<div class="todo-item"><p class="todo-note">还没有 Todo。可以先记录一个“下一步要做什么”。</p></div>`;
    return;
  }

  list.innerHTML = todos
    .map(
      (todo) => `
        <article class="todo-item ${todo.status === "done" ? "done" : ""}" data-todo-id="${escapeHtml(todo.id)}">
          <div class="todo-title-row">
            <h5 class="todo-title">${escapeHtml(todo.title)}</h5>
            <div class="todo-meta">
              <span class="badge">${escapeHtml(todo.priority)}</span>
              <span class="badge">${escapeHtml(todo.category)}</span>
              <span class="badge">${escapeHtml(statusLabel(todo.status))}</span>
            </div>
          </div>
          ${todo.note ? `<p class="todo-note">${escapeHtml(todo.note)}</p>` : ""}
          <div class="todo-actions">
            <button class="soft-btn" data-todo-action="todo">待做</button>
            <button class="soft-btn" data-todo-action="doing">进行中</button>
            <button class="soft-btn" data-todo-action="done">完成</button>
            <button class="ghost-btn" data-todo-action="delete">删除</button>
          </div>
        </article>
      `,
    )
    .join("");

  list.querySelectorAll("[data-todo-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest("[data-todo-id]");
      updateTodo(item.dataset.todoId, button.dataset.todoAction);
    });
  });
}

function selectedGoogleDataSource() {
  return state.googleDataSources.find((source) => source.id === state.selectedGoogleDataSourceId) || null;
}

function rememberGoogleReviewData(data, sourceId = state.selectedGoogleDataSourceId) {
  if (!sourceId || !data) return;
  const cachedAt = new Date().toISOString();
  state.googleReviewData = {
    ...data,
    cachedAt,
  };
  state.googleReviewCache = {
    ...(state.googleReviewCache || {}),
    [sourceId]: {
      cachedAt,
      sourceId,
      dateRange: data.dateRange || null,
      data: state.googleReviewData,
    },
  };
}

function restoreCachedGoogleReviewData(sourceId = state.selectedGoogleDataSourceId) {
  const cached = state.googleReviewCache?.[sourceId];
  state.googleReviewData = cached?.data || null;
  return cached || null;
}

function renderGoogleDataSources() {
  const select = $("googleDataSourceSelect");
  if (!select) return;

  const current = selectedGoogleDataSource();
  select.innerHTML = `<option value="">新建 Google 数据源</option>${state.googleDataSources
    .map((source) => `<option value="${escapeHtml(source.id)}">${escapeHtml(source.name || source.gscSiteUrl || "Google 数据源")}</option>`)
    .join("")}`;
  select.value = state.selectedGoogleDataSourceId || "";

  $("googleDataSourceNameInput").value = current?.name || "";
  $("gscSiteUrlInput").value = current?.gscSiteUrl || "";
  $("ga4PropertyIdInput").value = current?.ga4PropertyId || "";
  $("googleProxyUrlInput").value = "";
  $("googleProxyUrlInput").placeholder = current?.googleProxyUrlSet
    ? `已保存：${current.googleProxyUrlPreview || "代理地址"}，留空则继续使用`
    : "例如：http://127.0.0.1:7897";
  $("googleDataStartInput").value = current?.defaultStartDate || "";
  $("googleDataEndInput").value = current?.defaultEndDate || "";
  $("googleServiceAccountJsonInput").value = "";
  $("googleServiceAccountJsonInput").placeholder = current?.serviceAccountSet
    ? `已保存：${current.serviceAccountEmail || "service account"}，留空则继续使用`
    : '{"type":"service_account","client_email":"...","private_key":"..."}';

  if (current?.serviceAccountSet) {
    const cached = state.googleReviewCache?.[current.id];
    const cacheText = cached?.cachedAt ? ` 已恢复缓存：${new Date(cached.cachedAt).toLocaleString()}。` : "";
    $("googleDataStatus").textContent = `已选择数据源：${current.name}。服务账号：${current.serviceAccountEmail || "已保存"}。${cacheText}`;
  } else if (state.googleDataSources.length) {
    $("googleDataStatus").textContent = "请选择一个已保存数据源，或新建一个 Google 数据源。";
  }

  renderGoogleReviewData();
}

function formatNumber(value = 0) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(Math.round(number));
}

function sumRows(rows = [], key = "clicks") {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function averageRows(rows = [], key = "position") {
  const values = rows.map((row) => Number(row[key] || 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function gscOpportunityRows(rows = []) {
  return [...rows]
    .filter((row) => Number(row.impressions || 0) >= 10)
    .sort((a, b) => {
      const aScore = Number(a.impressions || 0) * Math.max(Number(a.position || 99) - 3, 1);
      const bScore = Number(b.impressions || 0) * Math.max(Number(b.position || 99) - 3, 1);
      return bScore - aScore;
    })
    .slice(0, 8);
}

function reviewRowList(rows = [], type = "query") {
  if (!rows.length) return `<li class="review-empty-row">暂无${type === "query" ? "查询词" : "页面"}数据。</li>`;
  return rows
    .map((row, index) => {
      const key = row.keys?.[0] || row.pagePath || row.pageTitle || "";
      const ctr = ((Number(row.ctr || 0)) * 100).toFixed(2);
      const position = Number(row.position || 0).toFixed(1);
      return `
        <li class="review-rank-row">
          <span class="review-rank-index">${index + 1}</span>
          <span class="review-rank-main">${escapeHtml(key)}</span>
          <span>${formatNumber(row.clicks)} clicks</span>
          <span>${formatNumber(row.impressions)} impr.</span>
          <span>${ctr}% CTR</span>
          <span>Pos ${position}</span>
        </li>
      `;
    })
    .join("");
}

function barColor(index = 0) {
  return ["#2f7668", "#4f6ee8", "#7b3fe4", "#b57b2e", "#b6422f", "#4e8c57", "#d22d73"][index % 7];
}

function reviewBarList(rows = [], valueKey = "impressions") {
  if (!rows.length) return `<li class="review-empty-row">暂无可绘制的数据。</li>`;
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  return rows
    .slice(0, 10)
    .map((row, index) => {
      const label = row.keys?.[0] || row.pagePath || row.pageTitle || "";
      const value = Number(row[valueKey] || 0);
      const width = Math.max(4, Math.round((value / max) * 100));
      return `
        <li class="review-bar-row">
          <span class="review-bar-label">${escapeHtml(label)}</span>
          <span class="review-bar-track"><i style="width:${width}%; background:${barColor(index)}"></i></span>
          <strong>${formatNumber(value)}</strong>
        </li>
      `;
    })
    .join("");
}

function ga4RowList(rows = []) {
  if (!rows.length) return `<li class="review-empty-row">暂无 GA4 页面数据。</li>`;
  return rows
    .slice(0, 8)
    .map((row, index) => {
      const engagement = ((Number(row.engagementRate || 0)) * 100).toFixed(1);
      return `
        <li class="review-rank-row">
          <span class="review-rank-index">${index + 1}</span>
          <span class="review-rank-main">${escapeHtml(row.pagePath || row.pageTitle || "页面")}</span>
          <span>${formatNumber(row.sessions)} sessions</span>
          <span>${formatNumber(row.activeUsers)} users</span>
          <span>${engagement}% engagement</span>
        </li>
      `;
    })
    .join("");
}

function dashboardMetric(label, value, note = "", color = "#2f7668") {
  return `
    <article class="review-report-metric" style="--metric-color:${color}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function minutesSeconds(seconds = 0) {
  const value = Math.round(Number(seconds || 0));
  if (!value) return "0s";
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function reportDataTable(headers = [], rows = []) {
  return `
    <div class="review-report-table-wrap">
      <table class="review-report-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
                  .join("")
              : `<tr><td colspan="${headers.length}">暂无数据</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function gscRowsForTable(rows = []) {
  return rows.slice(0, 12).map((row) => [
    row.keys?.[0] || "-",
    formatNumber(row.clicks),
    formatNumber(row.impressions),
    `${((Number(row.ctr || 0)) * 100).toFixed(2)}%`,
    Number(row.position || 0).toFixed(1),
  ]);
}

function ga4RowsForTable(rows = []) {
  return rows.slice(0, 12).map((row) => [
    row.pagePath || row.pageTitle || "-",
    formatNumber(row.activeUsers),
    formatNumber(row.sessions),
    `${((Number(row.engagementRate || 0)) * 100).toFixed(1)}%`,
    minutesSeconds(row.averageSessionDuration),
  ]);
}

function buildReviewActions(data) {
  const opportunity = gscOpportunityRows(data.gscQueries?.rows || [])[0];
  const strongPage = [...(data.gscPages?.rows || [])].sort((a, b) => Number(b.clicks || 0) - Number(a.clicks || 0))[0];
  const qualityPage = [...(data.ga4Pages?.rows || [])].sort((a, b) => Number(b.sessions || 0) - Number(a.sessions || 0))[0];
  return [
    {
      title: "优先补强排名有苗头的词",
      detail: opportunity
        ? `${opportunity.keys?.[0] || "机会词"} 有 ${formatNumber(opportunity.impressions)} 展现，平均排名 ${Number(opportunity.position || 0).toFixed(1)}，适合补内容深度、FAQ 和内链。`
        : "暂无足够查询词数据，先扩大日期范围或确认 GSC 资源。",
    },
    {
      title: "用高点击页面反推内容资产",
      detail: strongPage
        ? `${strongPage.keys?.[0] || "高点击页面"} 已经拿到 ${formatNumber(strongPage.clicks)} 点击，适合做相关主题集群和内部链接。`
        : "暂无页面点击数据，先等待 GSC 收录或拉长周期。",
    },
    {
      title: "用 GA4 判断页面是否值得继续加码",
      detail: qualityPage
        ? `${qualityPage.pagePath || qualityPage.pageTitle || "高访问页面"} 有 ${formatNumber(qualityPage.sessions)} sessions，建议结合参与率判断是否更新或加 CTA。`
        : "暂无 GA4 页面质量数据，可先检查 Property ID 和权限。",
    },
  ];
}

function renderGoogleReviewData() {
  const container = $("googleReviewResults");
  const raw = $("googleReviewRawOutput");
  if (!container || !raw) return;

  const data = state.googleReviewData;
  if (!data) {
    container.innerHTML = `
      <div class="review-empty-state">
        <span>DATA</span>
        <strong>还没有复盘数据</strong>
        <p>先保存数据源并测试连接，再点击“生成复盘看板”。看板会把 GSC 和 GA4 转成可行动的月度复盘视图。</p>
      </div>
    `;
    raw.textContent = "";
    return;
  }

  const queryRows = data.gscQueries?.rows || [];
  const pageRows = data.gscPages?.rows || [];
  const ga4Rows = data.ga4Pages?.rows || [];
  const actions = buildReviewActions(data);
  const topGa4 = [...ga4Rows].sort((a, b) => Number(b.sessions || 0) - Number(a.sessions || 0))[0];
  const activeUsers = sumRows(ga4Rows, "activeUsers");
  const sessions = sumRows(ga4Rows, "sessions");
  const pageViews = sessions;
  const avgEngagement = averageRows(ga4Rows, "engagementRate");
  const avgSessionDuration = averageRows(ga4Rows, "averageSessionDuration");
  const coreKeywords = new Set(queryRows.map((row) => row.keys?.[0]).filter(Boolean)).size;
  const dailyClicks = data.dateRange?.startDate && data.dateRange?.endDate
    ? (sumRows(queryRows, "clicks") / Math.max(1, (new Date(data.dateRange.endDate) - new Date(data.dateRange.startDate)) / 86400000 + 1)).toFixed(1)
    : "0";

  container.innerHTML = `
    <section class="review-source-strip">
      <article><strong>GSC</strong><span>已接入：查询词 / 页面 / 点击 / 展现 / 排名</span></article>
      <article><strong>GA4</strong><span>已接入：sessions / active users / engagement / avg time</span></article>
      <article class="pending"><strong>DataForSEO / Semrush</strong><span>待接入：当前排名、竞品、SERP 类型</span></article>
      <article class="pending"><strong>Inquiry / Sales</strong><span>待接入：询盘、订单、成交价值</span></article>
    </section>

    <section class="review-report-section">
      <div class="review-report-section-head">
        <p>SEARCH DEMAND & RANK VALIDATION</p>
        <h4>搜索需求 + 排名校验</h4>
        <span>GSC 负责确认真实搜索需求，排名数据用于判断哪些词已经有苗头、哪些词需要补强页面。</span>
      </div>
      <div class="review-report-metrics">
        ${dashboardMetric("PAGES CRAWLED", formatNumber(pageRows.length), "GSC 页面数", "#2f7668")}
        ${dashboardMetric("CORE KEYWORDS", formatNumber(coreKeywords), "查询词数量", "#4f6ee8")}
        ${dashboardMetric("GSC CLICKS", formatNumber(sumRows(queryRows, "clicks")), "本月点击", "#7b3fe4")}
        ${dashboardMetric("DAILY CLICKS", String(dailyClicks), "点击 / 天", "#4e8c57")}
        ${dashboardMetric("GSC IMPRESSIONS", formatNumber(sumRows(queryRows, "impressions")), "本月曝光", "#b57b2e")}
        ${dashboardMetric("GSC AVG POSITION", averageRows(queryRows, "position").toFixed(1), "平均排名", "#101827")}
        ${dashboardMetric("RANK FOUND", formatNumber(gscOpportunityRows(queryRows).length), "机会词", "#2f7668")}
      </div>
      <div class="review-report-two-col">
        <article class="review-report-card">
          <h5>GSC 月度数据结构</h5>
          <p>把点击、曝光、核心关键词和机会词放在一起看，不只看单个指标。</p>
          <ul class="review-bar-list">
            ${reviewBarList([
              { keys: ["Site Clicks"], impressions: sumRows(queryRows, "clicks") },
              { keys: ["Site Impressions"], impressions: sumRows(queryRows, "impressions") },
              { keys: ["Core KW Impr."], impressions: sumRows(gscOpportunityRows(queryRows), "impressions") },
              { keys: ["Core KW Clicks"], impressions: sumRows(gscOpportunityRows(queryRows), "clicks") },
              { keys: ["Core KW Found"], impressions: gscOpportunityRows(queryRows).length },
            ], "impressions")}
          </ul>
        </article>
        <article class="review-report-card">
          <h5>核心机会词 Top 10</h5>
          <p>优先看有曝光、平均排名 4-20、但点击还没吃满的词。</p>
          <ul class="review-bar-list">${reviewBarList(gscOpportunityRows(queryRows), "impressions")}</ul>
        </article>
      </div>
    </section>

    <section class="review-report-section">
      <div class="review-report-section-head">
        <p>BEHAVIOR & SOURCE QUALITY</p>
        <h4>站内访客质量 + 来源价值</h4>
        <span>GA4 负责判断用户进站后是否留下来、来自哪些渠道、哪些页面真正接住访问。</span>
      </div>
      <div class="review-report-metrics">
        ${dashboardMetric("GA4 ACTIVE USERS", formatNumber(activeUsers), "独立访客", "#2f7668")}
        ${dashboardMetric("GA4 SESSIONS", formatNumber(sessions), "站内访问会话", "#4f6ee8")}
        ${dashboardMetric("GA4 PAGE VIEWS", formatNumber(pageViews), "页面浏览", "#101827")}
        ${dashboardMetric("ENGAGEMENT RATE", `${(avgEngagement * 100).toFixed(1)}%`, "参与会话占比", "#4e8c57")}
        ${dashboardMetric("AVG SESSION TIME", minutesSeconds(avgSessionDuration), "平均停留", "#7b3fe4")}
        ${dashboardMetric("TOP LANDING PAGE", topGa4?.pagePath || "/", "最高入口页", "#101827")}
        ${dashboardMetric("CORE PAGES WITH TRAFFIC", formatNumber(ga4Rows.length), "有流量页面", "#b57b2e")}
      </div>
      <div class="review-report-two-col">
        <article class="review-report-card">
          <h5>页面访问质量 Top 10</h5>
          <p>按 sessions 判断哪些页面值得继续加 CTA、内链和内容模块。</p>
          <ul class="review-bar-list">${reviewBarList(ga4Rows.slice(0, 10), "sessions")}</ul>
        </article>
        <article class="review-report-card">
          <h5>核心页面接待访问</h5>
          <p>用 GSC 页面点击和 GA4 sessions 交叉判断真正有价值的入口。</p>
          <ul class="review-bar-list">${reviewBarList(pageRows.slice(0, 10), "clicks")}</ul>
        </article>
      </div>
    </section>

    <section class="review-report-section">
      <div class="review-report-section-head">
        <p>DETAIL TABLES</p>
        <h4>运营明细表</h4>
        <span>这里保留可排查的明细：查询词、页面、点击、曝光、参与率。后续可继续接 Semrush/DataForSEO/询盘数据。</span>
      </div>
      <div class="review-report-two-col">
        <article class="review-report-card">
          <h5>GSC 查询词明细</h5>
          ${reportDataTable(["QUERY", "CLICKS", "IMPRESSIONS", "CTR", "AVG POSITION"], gscRowsForTable(queryRows))}
        </article>
        <article class="review-report-card">
          <h5>GA4 页面明细</h5>
          ${reportDataTable(["PAGE", "ACTIVE USERS", "SESSIONS", "ENGAGEMENT", "AVG TIME"], ga4RowsForTable(ga4Rows))}
        </article>
      </div>
    </section>

    <section class="review-report-section">
      <div class="review-report-section-head">
        <p>ACTION PLAN VIEW</p>
        <h4>下月 Action Plan 草案</h4>
        <span>先根据当前数据自动生成可执行方向，后续可再接 AI 产出完整复盘报告。</span>
      </div>
      <ol class="review-action-list review-action-list-report">
        ${actions.map((action) => `<li><strong>${escapeHtml(action.title)}</strong><span>${escapeHtml(action.detail)}</span></li>`).join("")}
      </ol>
    </section>
  `;
  raw.textContent = JSON.stringify(data, null, 2);
}

async function readGoogleServiceAccountJson() {
  const file = $("googleServiceAccountFileInput")?.files?.[0];
  if (file) return file.text();
  return $("googleServiceAccountJsonInput").value.trim();
}

async function readGoogleDataSourceForm() {
  return {
    id: state.selectedGoogleDataSourceId || "",
    name: $("googleDataSourceNameInput").value.trim(),
    gscSiteUrl: $("gscSiteUrlInput").value.trim(),
    ga4PropertyId: $("ga4PropertyIdInput").value.trim(),
    googleProxyUrl: $("googleProxyUrlInput").value.trim(),
    defaultStartDate: $("googleDataStartInput").value,
    defaultEndDate: $("googleDataEndInput").value,
    serviceAccountJson: await readGoogleServiceAccountJson(),
  };
}

async function loadGoogleDataSources() {
  const data = await api("/api/google-data-sources");
  state.googleDataSources = data.sources || [];
  const selectedStillExists = state.googleDataSources.some((source) => source.id === state.selectedGoogleDataSourceId);
  if ((!state.selectedGoogleDataSourceId || !selectedStillExists) && state.googleDataSources[0]) {
    state.selectedGoogleDataSourceId = state.googleDataSources[0].id;
  }
  if (!state.googleReviewData) restoreCachedGoogleReviewData(state.selectedGoogleDataSourceId);
  renderGoogleDataSources();
}

async function saveGoogleDataSource() {
  $("googleDataStatus").textContent = "正在保存 Google 复盘数据源...";
  const data = await api("/api/google-data-sources", { source: await readGoogleDataSourceForm() });
  state.googleDataSources = data.sources || [];
  state.selectedGoogleDataSourceId = data.source?.id || state.selectedGoogleDataSourceId;
  $("googleServiceAccountFileInput").value = "";
  $("googleDataStatus").textContent = `已保存数据源：${data.source?.name || "Google 数据源"}。`;
  renderGoogleDataSources();
}

async function testGoogleDataSource() {
  const sourceId = state.selectedGoogleDataSourceId;
  if (!sourceId) throw new Error("请先保存并选择一个 Google 数据源。");
  $("googleDataStatus").textContent = "正在测试 GSC / GA4 连接...";
  const data = await api("/api/google-data-sources/test", { sourceId });
  $("googleDataStatus").textContent = `连接成功：${(data.checks || []).map((check) => `${check.type} ${check.rows} 行样例`).join("；") || "已完成鉴权"}。`;
}

async function loadGoogleReviewData() {
  const sourceId = state.selectedGoogleDataSourceId;
  if (!sourceId) throw new Error("请先保存并选择一个 Google 数据源。");
  $("googleDataStatus").textContent = "正在拉取 GSC / GA4 复盘数据...";
  const data = await api("/api/google-data-sources/monthly-review", {
    sourceId,
    startDate: $("googleDataStartInput").value,
    endDate: $("googleDataEndInput").value,
    rowLimit: 100,
  });
  rememberGoogleReviewData(data, sourceId);
  $("googleDataStatus").textContent = `已拉取并缓存复盘数据：${data.dateRange?.startDate || ""} 至 ${data.dateRange?.endDate || ""}。刷新页面后会自动恢复。`;
  renderGoogleReviewData();
  saveWorkspaceDraft("Google 复盘数据已缓存到本机浏览器。");
}

function renderAll() {
  state.project = readProject();
  renderLocaleStatus();
  renderMetrics();
  renderStandard();
  renderFilters();
  renderTable();
  renderContentHub();
  renderBrief();
  renderAiStages();
  renderGeneration();
  renderWpSites();
  renderImageConfig();
  renderProductAssets();
  renderGoogleDataSources();
  renderTodos();
  applyActivePage(state.activePage);
  updateActionStates();
}

async function loadStandard() {
  const data = await api("/api/workflow/standard");
  state.standard = data.standard;
  state.standardDirty = false;
  $("standardStatus").textContent = `已读取标准版本：${state.standard.version || "unknown"}`;
  renderStandard();
}

async function reloadStandardFromDisk() {
  if (state.standardDirty) {
    const confirmed = confirm("标准配置有未保存修改。重新读取会用文件内容覆盖当前编辑区，确定继续吗？");
    if (!confirmed) return;
  }

  $("standardStatus").textContent = "正在从 workflows/seo-standard.json 重新读取标准...";
  const data = await api("/api/workflow/standard/reload", {});
  state.standard = data.standard;
  state.standardDirty = false;
  $("standardStatus").textContent = data.message || `已重新读取标准版本：${state.standard.version || "unknown"}`;
  renderStandard();

  if (state.keywords.length) {
    await analyzeKeywords(state.keywords);
  }
}

async function saveStandardFromEditor() {
  $("standardStatus").textContent = "正在校验并保存标准...";
  const nextStandard = JSON.parse($("standardEditor").value);
  const data = await api("/api/workflow/standard", { standard: nextStandard });
  state.standard = data.standard;
  state.standardDirty = false;
  $("standardStatus").textContent = data.message || "标准已保存。请重新分析关键词，让新规则生效。";
  renderStandard();

  if (state.keywords.length) {
    await analyzeKeywords(state.keywords);
  }
}

async function analyzeKeywords(keywords) {
  const data = await api("/api/workflow/analyze", {
    project: readProject(),
    keywords,
    aiStage: state.aiStages.keywordAnalysis,
  });

  state.keywords = data.keywords || [];
  state.sites = data.sites || FALLBACK_SITES;
  state.selectedId = state.keywords[0]?.id || null;
  state.tablePage = 1;
  state.article = "";
  renderAll();

  if (state.selectedId) {
    await refreshSelected();
  } else {
    saveWorkspaceDraft();
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function importFile() {
  const file = $("keywordFileInput").files?.[0];
  if (!file) {
    $("keywordFileInput").focus();
    $("importStatus").textContent = "请先选择一个 Semrush 导出的文件。";
    return;
  }

  $("importStatus").textContent = `正在解析：${file.name}`;
  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const data = await api("/api/workflow/import-file", {
    filename: file.name,
    mimeType: file.type,
    contentBase64,
    project: readProject(),
    aiStage: state.aiStages.keywordAnalysis,
  });

  const importedKeywords = data.keywords || [];
  if (!importedKeywords.length) {
    $("importStatus").textContent = `没有识别到关键词：${file.name}。请确认这是 Semrush 关键词/页面导出的 Excel，且表里有 Keyword/关键词 列。当前已有关键词不会被覆盖。`;
    return;
  }

  state.keywords = importedKeywords;
  state.sites = data.sites || FALLBACK_SITES;
  state.selectedId = state.keywords[0]?.id || null;
  state.tablePage = 1;
  state.article = "";
  $("importStatus").textContent = `已导入 ${state.keywords.length} 个关键词：${file.name}` + marketMismatchSummary(state.keywords);
  renderAll();

  if (state.selectedId) await refreshSelected();
  saveWorkspaceDraft(`已导入 ${state.keywords.length} 个关键词，并自动保存到本机浏览器。`);
}

async function importCsv() {
  const csv = $("csvInput").value;
  if (!csv.trim()) {
    $("csvInput").focus();
    $("importStatus").textContent = "请先粘贴 Semrush 导出的 CSV 内容。";
    return;
  }

  const data = await api("/api/workflow/import-csv", {
    project: readProject(),
    csv,
    aiStage: state.aiStages.keywordAnalysis,
  });

  const importedKeywords = data.keywords || [];
  if (!importedKeywords.length) {
    $("importStatus").textContent = "没有识别到关键词。请确认第一行或前 30 行里有 Keyword/关键词 表头。当前已有关键词不会被覆盖。";
    return;
  }

  state.keywords = importedKeywords;
  state.sites = data.sites || FALLBACK_SITES;
  state.selectedId = state.keywords[0]?.id || null;
  state.tablePage = 1;
  state.article = "";
  $("importStatus").textContent = `已解析 ${state.keywords.length} 个关键词。` + marketMismatchSummary(state.keywords);
  renderAll();

  if (state.selectedId) await refreshSelected();
  saveWorkspaceDraft(`已解析 ${state.keywords.length} 个关键词，并自动保存到本机浏览器。`);
}

async function reanalyzeCurrentKeywords() {
  if (!state.keywords.length && $("keywordFileInput").files?.[0]) {
    $("importStatus").textContent = "检测到已选择文件但还没有导入，正在先导入文件...";
    await importFile();
  }

  if (!state.keywords.length) {
    $("importStatus").textContent = "还没有关键词。请先选择 Semrush 文件，系统会自动导入；也可以粘贴 CSV 后点击解析。";
    return;
  }

  $("importStatus").textContent = "正在按当前网站定位重新分析关键词...";
  await analyzeKeywords(state.keywords);
  $("importStatus").textContent = `已按当前网站定位重新分析 ${state.keywords.length} 个关键词。` + marketMismatchSummary(state.keywords);
  saveWorkspaceDraft(`已按当前网站定位重新分析 ${state.keywords.length} 个关键词，并自动保存。`);
}

async function refreshSelected() {
  const item = selectedItem();
  if (!item) {
    state.brief = "";
    state.prompt = "";
    renderAll();
    return;
  }

  const project = readProject();
  const briefData = await api("/api/workflow/brief", {
    keyword: item,
    project,
    aiStage: state.aiStages.briefGeneration,
  });
  const promptData = await api("/api/workflow/prompt", {
    keyword: item,
    project,
    briefOverride: briefData.brief || "",
    aiStage: state.aiStages.briefGeneration,
  });

  state.brief = briefData.brief || "";
  state.prompt = promptData.prompt || "";
  renderAll();
  saveWorkspaceDraft();
}

async function selectKeyword(id) {
  state.selectedId = id;
  renderAll();
  await refreshSelected();
  saveWorkspaceDraft();
}

function keywordReviewPrompt() {
  const locale = readProject().locale || {};
  const sample = state.keywords.slice(0, 80).map((item) => ({
    keyword: item.keyword,
    volume: item.volume,
    kd: item.kd,
    intent: item.intent,
    serpFeatures: item.serpFeatures || "",
    assignedSite: item.assignedSite,
    pageType: item.pageType,
    priority: item.priority,
    score: item.scores?.total,
    reason: item.reason,
  }));

  return [
    "你是 Google SEO 关键词策略审稿人。请复核下面的关键词分站结果。",
    "",
    "项目背景：",
    JSON.stringify(readProject(), null, 2),
    "",
    "P0 Locale Guardrail:",
    localeStatusTextSafe(locale),
    `If you discuss Google SERP, it must be for gl=${locale.googleGl || "not-set"} and hl=${locale.googleHl || "not-set"}.`,
    "No live local Google SERP data is provided in this task. Do not claim you checked top 10. If SERP validation is required, say it needs manual/API SERP check.",
    "",
    "当前分站标准摘要：",
    JSON.stringify(
      {
        sites: state.standard?.sites,
        signals: state.standard?.signals,
        scoring: state.standard?.scoring,
      },
      null,
      2,
    ),
    "",
    "关键词样本：",
    JSON.stringify(sample, null, 2),
    "",
    "请输出：",
    "1. 哪些关键词分站可能不准。",
    "2. 哪些关键词应该从博客站改到主站博客或主站集合页。",
    "3. 哪些关键词需要人工看 Google SERP。",
    "4. 哪些规则建议写回 seo-standard.json。",
  ].join("\n");
}

async function aiReviewKeywords() {
  if (!state.keywords.length) {
    setArticleOutput("请先导入关键词，再进行 AI 复核。");
    return;
  }

  const stage = state.aiStages.keywordAnalysis;
  const prompt = keywordReviewPrompt();

  if (stage.provider === "local" || stage.apiFormat === "local") {
    setArticleOutput(`当前关键词分析阶段是 Local，本地规则已经完成第一轮分析。\n\n如果你想让 DeepSeek 复核，请在“AI 阶段路由”里把关键词分析阶段供应商设为 deepseek，并在服务端配置 AI_KEYWORD_ANALYSIS_URL。`);
    return;
  }

  setArticleOutput("正在请求关键词分析阶段 AI 复核...");
  const response = await fetch(stage.endpoint || "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: "keywordAnalysis",
      stageConfig: stageConfigForRequest(stage),
      provider: stage.provider,
      model: stage.model,
      prompt,
      project: readProject(),
      keywords: state.keywords,
    }),
  });

  const data = await response.json();
  state.article = data.content || data.text || JSON.stringify(data, null, 2);
  renderGeneration();
  saveWorkspaceDraft("AI 复核结果已自动保存到本机浏览器。");
}

function articleSiteNameFor(item) {
  return item?.siteName || item?.sourceLabel || item?.assignedSite || "未分配站点";
}

function activeOpportunityForItem(item = {}) {
  const opportunity = state.contentHub.activeOpportunity;
  if (!opportunity || !item?.id || opportunity.keywordId !== item.id) return null;
  return opportunity;
}

function articleGenerationProject() {
  const project = readProject();
  const opportunity = activeOpportunityForItem(selectedItem() || {});
  const siteMarket = opportunity?.siteMarket || "";
  const siteLanguage = opportunity?.siteLanguage || "";
  if (!siteMarket && !siteLanguage) return project;

  const market = siteMarket || `Global / ${siteLanguage}`;
  return {
    ...project,
    market,
    locale: resolveSeoLocale(market),
    contentLanguage: siteLanguage || resolveSeoLocale(market).language,
    targetSiteName: opportunity.siteName || opportunity.sourceLabel || "",
    targetSiteRole: opportunity.siteRole || "",
  };
}

function articleSaveContextFor(item = {}) {
  const opportunity = activeOpportunityForItem(item);
  if (!opportunity) return item;
  return {
    ...item,
    ...opportunity,
    id: item.id,
    keywordId: item.id,
    keyword: item.keyword || opportunity.keyword,
    originalAssignedSite: opportunity.originalAssignedSite || item.assignedSite || "",
    originalPageType: opportunity.originalPageType || item.pageType || "",
  };
}

function promptHasArticleFormat(prompt = "") {
  const text = String(prompt || "");
  return (
    text.includes("WordPress 导入格式规范") &&
    text.includes("## Title") &&
    text.includes("## Meta Title") &&
    text.includes("## Meta Description") &&
    text.includes("## URL Slug")
  );
}

function promptHasLocaleGuardrail(prompt = "") {
  const text = String(prompt || "");
  return text.includes("P0 Locale") || text.includes("Language Guardrail") || text.includes("Google SERP Locale");
}

function requiredArticleFormatPrompt() {
  const project = articleGenerationProject();
  const locale = project.locale || {};
  const targetSiteLine = project.targetSiteName
    ? `Target publishing site: ${project.targetSiteName} / ${project.targetSiteRole || "not-set"}.`
    : "";
  const format = state.standard?.articleOutputFormat;
  const order = format?.requiredOrder?.length
    ? format.requiredOrder
    : [
        "## Title",
        "## Meta Title",
        "## Meta Description",
        "## URL Slug",
        "## Primary Keyword: {primaryKeyword}",
        "## Secondary Keywords: {secondaryKeywords}",
        "## Last Updated",
        "# {H1}",
        "正文",
        "## References（仅触发时输出）",
        "## Image Placement Map",
        "## Internal Link Suggestions（需要时输出）",
        "## Evidence Needed（缺少真实证据时输出）",
        "## Content QA Checklist",
      ];
  const rules = format?.rules?.length
    ? format.rules
    : [
        "不要输出 YAML frontmatter，不要用 --- 包裹元数据。",
        "正文前必须先输出 Title、Meta Title、Meta Description、URL Slug、Primary Keyword、Secondary Keywords、Last Updated。",
        "正文从 H1 开始，H1 前不放解释性废话。",
        "References 是触发式模块，不触发时不要输出 References 标题。",
        "Image Placement Map、Internal Link Suggestions、Evidence Needed、Content QA Checklist 必须独立成块。",
      ];

  return [
    "",
    "## P0 Locale / Language Guardrail（生成前强制补充）",
    localeStatusTextSafe(locale),
    targetSiteLine,
    locale.configured
      ? `Final article language must be ${locale.language}. Match ${locale.market} spelling, terms, examples, compliance wording, and buyer context.`
      : "Target market is missing. Do not output a production-ready article; ask for target market/language in Evidence Needed.",
    `If SERP validation is mentioned, it must be for gl=${locale.googleGl || "not-set"} and hl=${locale.googleHl || "not-set"}.`,
    "Do not claim Google top 10 was checked unless real SERP data for this exact locale was provided.",
    "",
    "## WordPress 导入格式规范（生成前强制补充）",
    "你必须严格按下面的 Markdown 块格式输出，方便脚本直接导入 WordPress。不要输出 YAML frontmatter。",
    "",
    "必须按这个顺序输出：",
    ...order.map((item, index) => `${index + 1}. ${item}`),
    "",
    "格式规则：",
    ...rules.map((rule) => `- ${rule}`),
  ].filter((line) => line !== null).join("\n");
}

function stripOpportunityPromptContext(prompt = "") {
  return String(prompt || "").replace(/\n+## Content Hub Internal Link Plan[\s\S]*$/i, "").trim();
}

function opportunityPromptContext(item = selectedItem()) {
  const opportunity = state.contentHub.activeOpportunity;
  if (!opportunity || !item || opportunity.keywordId !== item.id) return "";
  const links = opportunity.internalLinks?.length
    ? opportunity.internalLinks.map((link, index) => `${index + 1}. ${link.anchor} -> ${link.url}`).join("\n")
    : "No strong same-site internal links found. Do not force irrelevant links.";
  const matched = opportunity.matchedPosts?.length
    ? opportunity.matchedPosts.map((post, index) => `${index + 1}. ${post.title} -> ${post.url || "no-url"}`).join("\n")
    : "No existing article directly covers this keyword.";

  return [
    "## Content Hub Internal Link Plan",
    `Source site: ${opportunity.sourceLabel}`,
    `Primary keyword from opportunity pool: ${opportunity.keyword}`,
    `Topic cluster: ${opportunity.topicCluster}`,
    `Coverage status: ${opportunity.coverage}`,
    `Recommended action: ${opportunity.action}`,
    `Outbound rule: ${opportunity.nonMainRule}`,
    opportunity.serpFeatureNotes ? `SERP feature notes: ${opportunity.serpFeatureNotes}` : "",
    opportunity.contentAngle ? `AI-reviewed content angle: ${opportunity.contentAngle}` : "",
    opportunity.aiReason ? `AI review reason: ${opportunity.aiReason}` : "",
    "",
    "Existing same-site coverage found:",
    matched,
    "",
    "Allowed internal links for this article:",
    links,
    "",
    "Writing rules:",
    "- If Source site is not 主站, do not add links to the main site, product pages, collection pages, or commercial landing pages.",
    "- Use only natural contextual anchors. Do not repeat the exact same anchor text for every link.",
    "- If no relevant internal link exists, say so in Internal Link Suggestions instead of forcing a weak link.",
  ].join("\n");
}

async function ensureArticlePrompt(item) {
  const currentPrompt = $("promptOutput").value || state.prompt || "";
  if (promptHasArticleFormat(currentPrompt) && promptHasLocaleGuardrail(currentPrompt)) {
    state.prompt = stripOpportunityPromptContext(currentPrompt);
    const context = opportunityPromptContext(item);
    if (context) state.prompt = `${state.prompt}\n\n${context}`.trim();
    $("promptOutput").value = state.prompt;
    return;
  }

  try {
    const promptData = await api("/api/workflow/prompt", {
      keyword: item,
      project: articleGenerationProject(),
      briefOverride: state.brief || "",
      aiStage: state.aiStages.briefGeneration,
    });
    state.brief = promptData.brief || state.brief;
    state.prompt = promptData.prompt || currentPrompt;
  } catch {
    state.prompt = currentPrompt;
  }

  state.prompt = stripOpportunityPromptContext(state.prompt);

  if (!promptHasArticleFormat(state.prompt) || !promptHasLocaleGuardrail(state.prompt)) {
    state.prompt = `${state.prompt || ""}\n${requiredArticleFormatPrompt()}`.trim();
  }

  const context = opportunityPromptContext(item);
  if (context) state.prompt = `${state.prompt}\n\n${context}`.trim();

  $("promptOutput").value = state.prompt;
}

async function saveGeneratedArticleToServer(item, options = {}) {
  if (!state.article?.trim() || !item) return null;

  const saveContext = articleSaveContextFor(item);
  const parts = state.articleParts || splitArticleForWp(state.article);
  const data = await api("/api/articles/save", {
    content: state.article,
    slug: parts.slug || slugify(saveContext.keyword || "seo-article"),
    siteName: articleSiteNameFor(saveContext),
    keyword: saveContext,
    project: articleGenerationProject(),
    batchId: options.batchId || "",
  });

  state.articleSave = data;
  if ($("articleSaveStatus")) {
    $("articleSaveStatus").textContent = `已自动保存：${data.relativePath}`;
  }
  return data;
}

function rememberGeneratedArticle(item, saveData = state.articleSave, options = {}) {
  const opportunity = activeOpportunityForItem(item);
  if (!opportunity || !state.article?.trim()) return null;

  const parts = state.articleParts || splitArticleForWp(state.article);
  const record = {
    id: `${opportunity.id}-${Date.now()}`,
    opportunityId: opportunity.id,
    keywordId: item.id,
    keyword: item.keyword || opportunity.keyword,
    title: parts.title || item.keyword || opportunity.keyword,
    slug: parts.slug || slugify(item.keyword || opportunity.keyword || "seo-article"),
    siteKey: opportunity.siteKey || state.contentHub.selectedSiteKey || "",
    siteName: opportunity.siteName || opportunity.sourceLabel || "",
    siteRole: opportunity.siteRole || "",
    siteMarket: opportunity.siteMarket || "",
    siteLanguage: opportunity.siteLanguage || "",
    batchId: options.batchId || saveData?.batchId || "",
    batchLabel: options.batchLabel || "",
    savedPath: saveData?.relativePath || "",
    content: state.article,
    createdAt: new Date().toISOString(),
  };

  const articles = state.contentHub.generatedArticles || [];
  state.contentHub.generatedArticles = [
    ...articles.filter(
      (article) => !(article.opportunityId === record.opportunityId && article.batchId === record.batchId),
    ),
    record,
  ];
  return record;
}

async function generateArticle(options = {}) {
  const item = selectedItem();
  if (!item) return;

  state.articleSave = null;
  await ensureArticlePrompt(item);
  const stageKey = $("articleStageInput").value;
  const stage = state.aiStages[stageKey] || state.aiStages.articleGeneration;

  if (stage.provider === "local" || stage.apiFormat === "local") {
    const data = await api("/api/workflow/mock-article", {
      keyword: item,
      project: articleGenerationProject(),
      aiStage: stage,
    });
    state.article = data.content || "";
    renderGeneration();
    try {
      const saveData = await saveGeneratedArticleToServer(item, options);
      rememberGeneratedArticle(item, saveData, options);
      saveWorkspaceDraft("文章草稿已自动保存到本机浏览器和本地 Markdown 目录。");
    } catch (error) {
      $("articleSaveStatus").textContent = `文章已生成，但保存到本地目录失败：${error.message}`;
      saveWorkspaceDraft("文章草稿已自动保存到本机浏览器；本地 Markdown 保存失败。");
    }
    return;
  }

  setArticleOutput(`正在请求 ${stage.label} 阶段 AI：${stage.provider} / ${stage.model}`);
  const response = await fetch(stage.endpoint || "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: stageKey,
      stageConfig: stageConfigForRequest(stage),
      provider: stage.provider,
      model: stage.model,
      prompt: state.prompt,
      project: articleGenerationProject(),
      keyword: item,
    }),
  });

  if (!response.ok) throw new Error(`API returned ${response.status}`);
  const data = await response.json();
  state.article = data.content || data.text || JSON.stringify(data, null, 2);
  renderGeneration();
  try {
    const saveData = await saveGeneratedArticleToServer(item, options);
    rememberGeneratedArticle(item, saveData, options);
    saveWorkspaceDraft("文章草稿已自动保存到本机浏览器和本地 Markdown 目录。");
  } catch (error) {
    $("articleSaveStatus").textContent = `文章已生成，但保存到本地目录失败：${error.message}`;
    saveWorkspaceDraft("文章草稿已自动保存到本机浏览器；本地 Markdown 保存失败。");
  }
}

async function batchGenerateSelectedOpportunities() {
  const selectedIds = state.contentHub.selectedIds || [];
  const opportunities = (state.contentHub.opportunities || []).filter((item) => selectedIds.includes(item.id));
  if (!opportunities.length) {
    $("contentHubStatus").textContent = "请先在内容机会池里勾选要生成的关键词。";
    return;
  }

  const site = selectedContentSite();
  if (!site) {
    $("contentHubStatus").textContent = "请先选择本次要生成文章的站点。";
    return;
  }

  const batch = createContentGenerationBatch(site);
  state.contentHub.lastBatchId = batch.batchId;
  state.contentHub.lastBatchSiteKey = site.key;
  state.contentHub.lastBatchLabel = batch.batchLabel;

  const log = [];
  $("batchGenerationLog").textContent = `准备批量生成 ${opportunities.length} 篇文章。\n批次：${batch.batchId}\n目录：generated-articles/${site.name}/${batch.batchId}/\n`;
  for (let index = 0; index < opportunities.length; index += 1) {
    const opportunity = opportunities[index];
    const keyword = state.keywords.find((item) => item.id === opportunity.keywordId);
    if (!keyword) {
      log.push(`[跳过] ${opportunity.keyword}：关键词不存在`);
      $("batchGenerationLog").textContent = log.join("\n");
      continue;
    }

    try {
      state.contentHub.activeOpportunity = opportunity;
      state.selectedId = keyword.id;
      $("contentHubStatus").textContent = `正在生成 ${index + 1}/${opportunities.length}：${opportunity.keyword}`;
      await refreshSelected();
      await generateArticle(batch);
      const savedPath = state.articleSave?.relativePath ? ` -> ${state.articleSave.relativePath}` : "";
      log.push(`[完成] ${opportunity.keyword}${savedPath}`);
    } catch (error) {
      log.push(`[失败] ${opportunity.keyword}：${error.message}`);
    }
    $("batchGenerationLog").textContent = log.join("\n");
  }

  $("contentHubStatus").textContent = `批量生成结束：${log.filter((line) => line.startsWith("[完成]")).length}/${opportunities.length} 篇完成。`;
  renderContentHub();
  saveWorkspaceDraft("批量生成任务已完成，结果已保存到本地草稿和 generated-articles 目录。");
}

async function uploadGeneratedArticlesToContentSite() {
  const site = selectedContentSite();
  if (!site) {
    $("contentHubStatus").textContent = "请先选择要导入到哪个站点。";
    return;
  }

  if (!["blog", "wp"].includes(site.type)) {
    $("contentHubStatus").textContent = "当前一键批量导入先支持自建博客后台站点。WordPress/主站批量导入会走各自接口单独适配。";
    return;
  }

  if (!state.contentHub.lastBatchId || state.contentHub.lastBatchSiteKey !== site.key) {
    $("contentHubStatus").textContent = `当前没有 ${site.name} 的最新批量生成记录。请先在内容中枢批量生成文章。`;
    return;
  }

  const generated = uploadableArticlesForLatestBatch();
  if (!generated.length) {
    $("contentHubStatus").textContent = `当前没有可导入到 ${site.name} 的生成稿。请先在内容中枢批量生成文章。`;
    return;
  }

  $("contentHubStatus").textContent = `正在把 ${generated.length} 篇文章批量导入 ${site.name}...`;
  $("batchGenerationLog").textContent = [
    $("batchGenerationLog").textContent || "",
    "",
    `[导入] 准备上传 ${generated.length} 篇到 ${site.name}。`,
  ].filter(Boolean).join("\n");

  const uploadEndpoint = site.type === "wp" ? "/api/wp-sites/batch-upload" : "/api/blog-sites/batch-upload";
  const imageOptions = imageUploadOptions();
  const data = await api(uploadEndpoint, {
    siteId: site.id,
    contents: generated.map((article) => article.content),
    relativePaths: generated.map((article) => article.savedPath || ""),
    enrichImages: imageOptions.enrichImages,
    imageProvider: imageOptions.imageProvider,
    maxImagesPerArticle: imageOptions.maxImagesPerArticle,
    imageKeywords: generated.map((article) => article.keyword || article.title || ""),
    override: {
      status: site.defaultStatus || "draft",
      author: site.defaultAuthor || "Admin",
      categoryId: site.defaultCategoryId || "",
      coverUrl: site.defaultCoverUrl || "",
      items: generated.map((article) => ({
        title: article.title,
        slug: article.slug,
      })),
    },
  });

  const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
  const createdCount = Array.isArray(data.created) ? data.created.length : data.requested - failedCount;
  const uploadedAt = new Date().toISOString();
  state.contentHub.generatedArticles = (state.contentHub.generatedArticles || []).map((article) =>
    generated.some((item) => item.id === article.id)
      ? { ...article, uploadedAt, uploadFailed: failedCount > 0 }
      : article,
  );

  $("batchGenerationLog").textContent = [
    $("batchGenerationLog").textContent || "",
    ...(Array.isArray(data.imageWarnings) && data.imageWarnings.length
      ? [`[图片提示] ${data.imageWarnings.slice(0, 5).join("；")}${data.imageWarnings.length > 5 ? "；..." : ""}`]
      : []),
    failedCount
      ? `[导入完成] 提交 ${data.requested} 篇，成功 ${createdCount} 篇，失败 ${failedCount} 篇。`
      : `[导入完成] 成功提交 ${data.requested} 篇到 ${site.name}。`,
  ].filter(Boolean).join("\n");
  $("contentHubStatus").textContent = failedCount
    ? `批量导入完成：提交 ${data.requested} 篇，成功 ${createdCount} 篇，失败 ${failedCount} 篇。`
    : `批量导入成功：${data.requested} 篇文章已提交到 ${site.name}。`;
  saveWorkspaceDraft("本次生成稿已批量导入当前自建博客站点。");
  renderContentHub();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function downloadFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function exportKeywordCsv() {
  const headers = [
    "Keyword",
    "Topic Cluster",
    "Seed Keyword",
    "Page Group",
    "Target Market",
    "Content Language",
    "Google GL",
    "Google HL",
    "Semrush Database",
    "Market Mismatch",
    "Volume",
    "KD",
    "Intent",
    "Assigned Site",
    "Page Type",
    "Page Role",
    "Target Asset",
    "Asset Status",
    "Content Action",
    "Planned URL",
    "Priority",
    "Score",
    "Reason",
    "Parent Page",
    "References Triggered",
    "AI Reviewed",
    "AI Confidence",
    "Needs SERP Check",
    "Local Assigned Site",
    "Local Score",
  ];
  const lines = [headers.join(",")];
  const projectLocale = readProject().locale || {};

  for (const item of state.keywords) {
    const locale = item.locale || projectLocale;
    lines.push(
      [
        item.keyword,
        item.topicCluster || "",
        item.seedKeyword || "",
        item.pageGroup || "",
        locale.rawMarket || "",
        locale.language || "",
        locale.googleGl || "",
        locale.googleHl || "",
        item.database || "",
        item.marketMismatch ? "Yes" : "No",
        item.volume,
        item.kd,
        item.intent,
        item.assignedSite,
        item.pageType,
        item.pageRole || "",
        item.targetAsset || "",
        item.assetStatus || "",
        item.contentAction || "",
        item.plannedUrl || "",
        item.priority,
        item.scores?.total || 0,
        item.reason,
        item.parentPage || "",
        item.reference?.triggered ? "Yes" : "No",
        item.aiReview ? "Yes" : "No",
        item.aiReview?.confidence ?? "",
        item.aiReview?.needsSerpCheck ? "Yes" : "No",
        item.localReview?.assignedSite || "",
        item.localReview?.score ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  downloadFile("seo-keyword-allocation.csv", lines.join("\n"), "text/csv;charset=utf-8");
}

function exportCalendarCsv() {
  const headers = ["Week", "Site", "Topic Cluster", "Keyword", "Content Type", "Content Action", "Asset Status", "Target Asset", "Priority", "Image Count", "Reference Rule"];
  const candidates = state.keywords
    .filter((item) => item.priority === "P0" || item.priority === "P1")
    .sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0));
  const lines = [headers.join(",")];

  candidates.forEach((item, index) => {
    lines.push(
      [
        `Week ${Math.floor(index / 3) + 1}`,
        item.assignedSite,
        item.topicCluster || "",
        item.keyword,
        item.pageType,
        item.contentAction || "",
        item.assetStatus || "",
        item.targetAsset || item.plannedUrl || "",
        item.priority,
        item.imagePlan?.length || 0,
        item.reference?.triggered ? "Use official references if cited" : "0 references by default",
      ]
        .map(csvEscape)
        .join(","),
    );
  });

  downloadFile("seo-content-calendar.csv", lines.join("\n"), "text/csv;charset=utf-8");
}

async function exportStateJson() {
  const data = await api("/api/workflow/project-package", {
    project: readProject(),
    keywords: state.keywords,
    selectedKeyword: selectedItem(),
    aiStages: state.aiStages,
    standard: state.standard,
    contentHub: state.contentHub,
    todos: state.todos,
  });
  downloadFile("seo-workbench-project.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

function slugify(keyword) {
  return String(keyword || "seo-article")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function bindEvents() {
  const projectInputs = [
    "domainInput",
    "siteTypeInput",
    "marketInput",
    "customMarketInput",
    "conversionInput",
    "customConversionInput",
    "coreProductsInput",
    "mainPagesInput",
    "blogRolesInput",
    "mainSiteApiInput",
    "mainBlogApiInput",
    "blogApisInput",
  ];
  for (const id of projectInputs) {
    const eventName = $(id).tagName === "SELECT" ? "change" : "input";
    $(id).addEventListener(eventName, () => {
      if (id === "marketInput") syncCustomField("marketInput", "customMarketField");
      if (id === "conversionInput") syncCustomField("conversionInput", "customConversionField");
      state.project = readProject();
      renderLocaleStatus();
      renderContentHub();
      saveWorkspaceDraft();
    });
  }

  document.querySelectorAll("[data-page-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const page = link.dataset.pageTarget;
      applyActivePage(page);
      history.pushState(null, "", routeForPage(page));
      window.scrollTo({ top: 0, behavior: "smooth" });
      saveWorkspaceDraft();
    });
  });
  window.addEventListener("popstate", activatePageForLocation);
  window.addEventListener("hashchange", activatePageForLocation);

  document.querySelectorAll("[data-project-preset]").forEach((button) => {
    button.addEventListener("click", () => applyProjectPreset(button.dataset.projectPreset));
  });
  $("previewSiteApisBtn").addEventListener("click", () =>
    withButtonBusy("previewSiteApisBtn", () =>
      previewSiteApis().catch((error) => ($("siteApiPreview").textContent = `抓取失败：${error.message}`)),
    ),
  );
  $("saveProductApiBtn").addEventListener("click", () =>
    withButtonBusy("saveProductApiBtn", () =>
      saveProductApiConfig().catch((error) => ($("productAssetsStatus").textContent = `保存产品 API 失败：${error.message}`)),
    ),
  );
  $("extractProductsBtn").addEventListener("click", () =>
    withButtonBusy("extractProductsBtn", () =>
      extractProductAssets().catch((error) => ($("productAssetsStatus").textContent = `提取产品资产失败：${error.message}`)),
    ),
  );
  $("syncProductsToMainPagesBtn").addEventListener("click", syncProductsToMainPages);
  ["productApiEndpointInput", "productApiHeadersInput"].forEach((id) => {
    $(id)?.addEventListener("input", updateActionStates);
  });

  $("standardEditor").addEventListener("input", () => {
    state.standardDirty = true;
    $("standardStatus").textContent = "标准有未保存修改。保存后才会写入流程。";
  });
  $("reloadStandardBtn").addEventListener("click", () =>
    withButtonBusy("reloadStandardBtn", () =>
      reloadStandardFromDisk().catch((error) => ($("standardStatus").textContent = `重新读取失败：${error.message}`)),
    ),
  );
  $("saveStandardBtn").addEventListener("click", () =>
    withButtonBusy("saveStandardBtn", () =>
      saveStandardFromEditor().catch((error) => ($("standardStatus").textContent = `保存失败：${error.message}`)),
    ),
  );
  $("downloadStandardBtn").addEventListener("click", () => {
    downloadFile("seo-standard.json", JSON.stringify(state.standard || {}, null, 2), "application/json;charset=utf-8");
  });
  $("importFileBtn").addEventListener("click", () =>
    withButtonBusy("importFileBtn", () => importFile().catch((error) => ($("importStatus").textContent = `导入失败：${error.message}`))),
  );
  $("keywordFileInput").addEventListener("change", () => {
    if ($("keywordFileInput").files?.[0]) {
      importFile().catch((error) => ($("importStatus").textContent = `导入失败：${error.message}`));
    }
  });
  $("parseCsvBtn").addEventListener("click", () =>
    withButtonBusy("parseCsvBtn", () => importCsv().catch((error) => ($("importStatus").textContent = `解析失败：${error.message}`))),
  );
  $("reanalyzeKeywordsBtn").addEventListener("click", () =>
    withButtonBusy("reanalyzeKeywordsBtn", () =>
      reanalyzeCurrentKeywords().catch((error) => ($("importStatus").textContent = `重新分析失败：${error.message}`)),
    ),
  );
  $("clearKeywordsBtn").addEventListener("click", () => {
    if (!confirmAction(`确定要清空当前 ${state.keywords.length} 个关键词吗？这会同时清空当前 Brief、Prompt 和生成结果。`)) return;
    state.keywords = [];
    state.selectedId = null;
    state.tablePage = 1;
    state.brief = "";
    state.prompt = "";
    state.article = "";
    state.articleParts = null;
    state.articleSave = null;
    $("importStatus").textContent = "关键词已清空。";
    renderAll();
    saveWorkspaceDraft("关键词已清空，并自动保存。");
  });
  $("copyBriefBtn").addEventListener("click", async () => {
    await copyText(state.brief || "");
    $("copyBriefBtn").textContent = "已复制";
    setTimeout(() => {
      $("copyBriefBtn").textContent = "复制 Brief";
    }, 1200);
  });
  $("saveAiConfigBtn").addEventListener("click", () => {
    withButtonBusy("saveAiConfigBtn", () => saveAiStagesToServer()).catch((error) => {
      const message = `AI 配置保存失败：${error.message}。请确认你是通过 http://localhost:5177 打开页面，并且 npm start 正在运行。`;
      $("aiConfigStatus").textContent = message;
      setArticleOutput(message);
    });
  });
  $("applyDeepSeekAllBtn").addEventListener("click", applyDeepSeekToAllStages);
  $("applyDeepSeekKeyBtn").addEventListener("click", applyDeepSeekKeyToAllStages);
  $("resetAiConfigBtn").addEventListener("click", () => {
    if (!confirmAction("确定要把 AI 阶段路由恢复为默认值吗？保存到服务端前不会覆盖配置文件，但页面里的当前修改会被重置。")) return;
    state.aiStages = mergeAiStages({});
    renderAll();
    $("aiConfigStatus").textContent = "已恢复默认 AI 阶段配置。点击“保存到服务端”后才会覆盖本地配置文件。";
    setArticleOutput("已恢复默认 AI 阶段配置。点击“保存到服务端”后才会覆盖本地配置文件。");
  });
  $("buildPromptBtn").addEventListener("click", () =>
    withButtonBusy("buildPromptBtn", () => refreshSelected().catch((error) => setArticleOutput(error.message))),
  );
  $("promptOutput").addEventListener("input", () => {
    state.prompt = $("promptOutput").value;
    saveWorkspaceDraft();
  });
  $("mockGenerateBtn").addEventListener("click", () =>
    withButtonBusy("mockGenerateBtn", () => generateArticle().catch((error) => setArticleOutput(`生成失败：${error.message}`))),
  );
  $("copyMetaBtn").addEventListener("click", async () => {
    const content = state.articleParts?.meta || $("articleMetaOutput").textContent || "";
    await copyText(content);
    $("copyMetaBtn").textContent = "已复制";
    setTimeout(() => {
      $("copyMetaBtn").textContent = "复制 WP 字段";
    }, 1200);
  });
  $("copyBodyBtn").addEventListener("click", async () => {
    const content = state.articleParts?.body || $("articleBodyOutput").textContent || "";
    await copyText(content);
    $("copyBodyBtn").textContent = "已复制";
    setTimeout(() => {
      $("copyBodyBtn").textContent = "复制正文";
    }, 1200);
  });
  $("copyArticleBtn").addEventListener("click", async () => {
    const content = state.article || $("articleOutput").textContent || "";
    if (!content.trim()) {
      $("copyArticleBtn").textContent = "暂无内容";
      setTimeout(() => {
        $("copyArticleBtn").textContent = "复制结果";
      }, 1200);
      return;
    }

    await copyText(content);
    $("copyArticleBtn").textContent = "已复制";
    setTimeout(() => {
      $("copyArticleBtn").textContent = "复制结果";
    }, 1200);
  });
  $("downloadArticleBtn").addEventListener("click", () => {
    const item = selectedItem();
    const slug = state.articleParts?.slug || slugify(item?.keyword || "seo-article");
    downloadFile(`${slug}.md`, state.article || "");
  });
  $("wpSiteSelect").addEventListener("change", () => {
    const site = state.wpSites.find((item) => item.id === $("wpSiteSelect").value);
    setWpSiteForm(site || {});
  });
  $("wpSiteUrlInput").addEventListener("blur", () => {
    $("wpSiteUrlInput").value = normalizeWpSiteUrl($("wpSiteUrlInput").value);
  });
  $("saveWpSiteBtn").addEventListener("click", () =>
    withButtonBusy("saveWpSiteBtn", () => saveWpSiteFromForm().catch((error) => ($("wpPublishStatus").textContent = `保存失败：${error.message}`))),
  );
  $("testWpSiteBtn").addEventListener("click", () =>
    withButtonBusy("testWpSiteBtn", () => testWpSiteConnection().catch((error) => ($("wpPublishStatus").textContent = `连接失败：${error.message}`))),
  );
  $("diagnoseWpSiteBtn").addEventListener("click", () =>
    withButtonBusy("diagnoseWpSiteBtn", () =>
      diagnoseWpSiteConnection().catch((error) => ($("wpPublishStatus").textContent = `诊断失败：${error.message}`)),
    ),
  );
  $("listWpPostsBtn").addEventListener("click", () =>
    withButtonBusy("listWpPostsBtn", () => listWpPosts().catch((error) => ($("wpPublishStatus").textContent = `读取文章列表失败：${error.message}`))),
  );
  $("getWpPostBtn").addEventListener("click", () =>
    withButtonBusy("getWpPostBtn", () => getWpPost().catch((error) => ($("wpPublishStatus").textContent = `读取单篇文章失败：${error.message}`))),
  );
  $("aiDiagnoseWpPostsBtn").addEventListener("click", () =>
    withButtonBusy("aiDiagnoseWpPostsBtn", () =>
      aiDiagnoseWpPosts().catch((error) => ($("wpPublishStatus").textContent = `AI 诊断失败：${error.message}`)),
    ),
  );
  $("deleteWpSiteBtn").addEventListener("click", () =>
    confirmAction("确定要删除当前 WordPress 站点配置吗？这只删除本地配置，不会删除远程站点。") &&
    deleteCurrentWpSite().catch((error) => ($("wpPublishStatus").textContent = `删除失败：${error.message}`)),
  );
  $("uploadCurrentArticleBtn").addEventListener("click", () =>
    withButtonBusy("uploadCurrentArticleBtn", () =>
      uploadCurrentArticleToWp().catch((error) => ($("wpPublishStatus").textContent = `上传失败：${error.message}`)),
    ),
  );
  $("blogSiteSelect").addEventListener("change", () => {
    const site = state.blogSites.find((item) => item.id === $("blogSiteSelect").value);
    setBlogSiteForm(site || {});
  });
  $("blogApiBaseUrlInput").addEventListener("blur", () => {
    $("blogApiBaseUrlInput").value = normalizeBlogApiBaseUrl($("blogApiBaseUrlInput").value);
  });
  $("saveBlogSiteBtn").addEventListener("click", () =>
    withButtonBusy("saveBlogSiteBtn", () => saveBlogSiteFromForm().catch((error) => ($("blogPublishStatus").textContent = `保存失败：${error.message}`))),
  );
  $("testBlogSiteBtn").addEventListener("click", () =>
    withButtonBusy("testBlogSiteBtn", () => testBlogSiteConnection().catch((error) => ($("blogPublishStatus").textContent = `连接失败：${error.message}`))),
  );
  $("deleteBlogSiteBtn").addEventListener("click", () =>
    confirmAction("确定要删除当前自建博客站点配置吗？这只删除本地配置，不会删除远程站点。") &&
    deleteCurrentBlogSite().catch((error) => ($("blogPublishStatus").textContent = `删除失败：${error.message}`)),
  );
  $("listBlogPostsBtn").addEventListener("click", () =>
    withButtonBusy("listBlogPostsBtn", () => listBlogPosts().catch((error) => ($("blogPublishStatus").textContent = `读取列表失败：${error.message}`))),
  );
  $("aiDiagnoseBlogPostsBtn").addEventListener("click", () =>
    withButtonBusy("aiDiagnoseBlogPostsBtn", () =>
      aiDiagnoseBlogPosts().catch((error) => ($("blogPublishStatus").textContent = `AI 诊断失败：${error.message}`)),
    ),
  );
  $("getBlogPostBtn").addEventListener("click", () =>
    withButtonBusy("getBlogPostBtn", () => getBlogPost().catch((error) => ($("blogPublishStatus").textContent = `读取文章失败：${error.message}`))),
  );
  $("uploadCurrentBlogArticleBtn").addEventListener("click", () =>
    withButtonBusy("uploadCurrentBlogArticleBtn", () =>
      uploadCurrentArticleToBlog().catch((error) => ($("blogPublishStatus").textContent = `上传失败：${error.message}`)),
    ),
  );
  $("uploadBlogMarkdownFilesBtn").addEventListener("click", () =>
    withButtonBusy("uploadBlogMarkdownFilesBtn", () =>
      uploadMarkdownFilesToBlog().catch((error) => ($("blogPublishStatus").textContent = `批量上传失败：${error.message}`)),
    ),
  );
  $("mainSiteSelect").addEventListener("change", () => {
    const site = state.mainSites.find((item) => item.id === $("mainSiteSelect").value);
    setMainSiteForm(site || {});
  });
  $("mainApiBaseUrlInput").addEventListener("blur", () => {
    $("mainApiBaseUrlInput").value = $("mainApiBaseUrlInput").value.trim().replace(/\/+$/g, "").replace(/\/posts$/i, "");
  });
  $("saveMainSiteBtn").addEventListener("click", () =>
    withButtonBusy("saveMainSiteBtn", () => saveMainSiteFromForm().catch((error) => ($("mainPublishStatus").textContent = `保存失败：${error.message}`))),
  );
  $("testMainSiteBtn").addEventListener("click", () =>
    withButtonBusy("testMainSiteBtn", () => testMainSiteConnection().catch((error) => ($("mainPublishStatus").textContent = `连接失败：${error.message}`))),
  );
  $("deleteMainSiteBtn").addEventListener("click", () =>
    confirmAction("确定要删除当前主站 OpenAPI 配置吗？这只删除本地配置，不会删除远程站点。") &&
    deleteCurrentMainSite().catch((error) => ($("mainPublishStatus").textContent = `删除失败：${error.message}`)),
  );
  $("listMainPostsBtn").addEventListener("click", () =>
    withButtonBusy("listMainPostsBtn", () =>
      listMainPosts({ force: true }).catch((error) => ($("mainPublishStatus").textContent = `读取列表失败：${error.message}`)),
    ),
  );
  $("aiDiagnoseMainPostsBtn").addEventListener("click", () =>
    withButtonBusy("aiDiagnoseMainPostsBtn", () =>
      aiDiagnoseMainPosts().catch((error) => ($("mainPublishStatus").textContent = `AI 诊断失败：${error.message}`)),
    ),
  );
  $("uploadCurrentMainArticleBtn").addEventListener("click", () =>
    withButtonBusy("uploadCurrentMainArticleBtn", () =>
      uploadCurrentArticleToMain().catch((error) => ($("mainPublishStatus").textContent = `上传失败：${error.message}`)),
    ),
  );
  $("contentSiteSelect").addEventListener("change", () => {
    state.contentHub.selectedSiteKey = $("contentSiteSelect").value;
    state.contentHub.source = contentSourceType();
    state.contentHub.posts = [];
    state.contentHub.opportunities = [];
    state.contentHub.selectedIds = [];
    state.contentHub.activeOpportunity = null;
    state.contentHub.opportunityPage = 1;
    state.contentHub.lastSummary = null;
    contentHubLoadState.lastLoadedKey = "";
    contentHubLoadState.lastLoadedAt = 0;
    renderContentHub();
    const site = selectedContentSite();
    $("contentHubStatus").textContent = site
      ? `已选择 ${site.name}。为避免重复请求远程 API，请点击“读取/刷新文章”后再规划内容机会。`
      : "请先选择一个具体站点。";
    saveWorkspaceDraft();
  });
  $("contentNoMainLinksInput").addEventListener("change", () => {
    state.contentHub.noMainOutboundLinks = $("contentNoMainLinksInput").checked;
    if (state.contentHub.opportunities.length) planContentOpportunities();
    else saveWorkspaceDraft();
  });
  $("contentShowIncompatibleInput").addEventListener("change", () => {
    state.contentHub.showIncompatibleSites = $("contentShowIncompatibleInput").checked;
    renderContentHub();
    saveWorkspaceDraft();
  });
  $("loadContentSitePostsBtn").addEventListener("click", () =>
    withButtonBusy("loadContentSitePostsBtn", () =>
      (() => {
        contentHubLoadState.lastLoadedKey = "";
        contentHubLoadState.lastLoadedAt = 0;
        return loadContentHubSitePosts({ autoPlan: true, force: true });
      })().catch((error) => ($("contentHubStatus").textContent = `读取文章失败：${error.message}`)),
    ),
  );
  $("planContentOpportunitiesBtn").addEventListener("click", () =>
    withButtonBusy("planContentOpportunitiesBtn", () =>
      ensureContentOpportunities({ aiReview: true }).catch((error) => ($("contentHubStatus").textContent = `生成机会池失败：${error.message}`)),
    ),
  );
  $("contentOpportunityPageSizeInput").addEventListener("change", () => {
    state.contentHub.opportunityPageSize = Number($("contentOpportunityPageSizeInput").value) || 25;
    state.contentHub.opportunityPage = 1;
    renderContentHub();
    saveWorkspaceDraft();
  });
  $("prevOpportunityPageBtn").addEventListener("click", () => {
    state.contentHub.opportunityPage = Math.max(1, Number(state.contentHub.opportunityPage || 1) - 1);
    renderContentHub();
    saveWorkspaceDraft();
  });
  $("nextOpportunityPageBtn").addEventListener("click", () => {
    state.contentHub.opportunityPage = Number(state.contentHub.opportunityPage || 1) + 1;
    renderContentHub();
    saveWorkspaceDraft();
  });
  $("selectTopOpportunitiesBtn").addEventListener("click", selectTopContentOpportunities);
  $("clearOpportunitySelectionBtn").addEventListener("click", clearContentOpportunitySelection);
  $("batchGenerateSelectedBtn").addEventListener("click", () =>
    withButtonBusy("batchGenerateSelectedBtn", () =>
      batchGenerateSelectedOpportunities().catch((error) => ($("contentHubStatus").textContent = `批量生成失败：${error.message}`)),
    ),
  );
  $("batchUploadGeneratedBtn").addEventListener("click", () =>
    withButtonBusy("batchUploadGeneratedBtn", () =>
      uploadGeneratedArticlesToContentSite().catch((error) => ($("contentHubStatus").textContent = `批量导入失败：${error.message}`)),
    ),
  );
  $("googleDataSourceSelect").addEventListener("change", () => {
    state.selectedGoogleDataSourceId = $("googleDataSourceSelect").value;
    restoreCachedGoogleReviewData(state.selectedGoogleDataSourceId);
    renderGoogleDataSources();
    saveWorkspaceDraft();
  });
  $("reloadGoogleDataSourcesBtn").addEventListener("click", () =>
    loadGoogleDataSources().catch((error) => ($("googleDataStatus").textContent = `读取失败：${error.message}`)),
  );
  $("saveGoogleDataSourceBtn").addEventListener("click", () =>
    saveGoogleDataSource().catch((error) => ($("googleDataStatus").textContent = `保存失败：${error.message}`)),
  );
  $("testGoogleDataSourceBtn").addEventListener("click", () =>
    testGoogleDataSource().catch((error) => ($("googleDataStatus").textContent = `连接失败：${error.message}`)),
  );
  $("loadGoogleReviewDataBtn").addEventListener("click", () =>
    loadGoogleReviewData().catch((error) => ($("googleDataStatus").textContent = `拉取失败：${error.message}`)),
  );
  $("exportCsvBtn").addEventListener("click", exportKeywordCsv);
  $("exportCalendarBtn").addEventListener("click", exportCalendarCsv);
  $("exportStateBtn").addEventListener("click", () => exportStateJson().catch((error) => setArticleOutput(error.message)));
  $("pageSizeInput").addEventListener("change", () => {
    state.pageSize = Number($("pageSizeInput").value) || 50;
    state.tablePage = 1;
    renderTable();
    saveWorkspaceDraft();
  });
  $("prevPageBtn").addEventListener("click", () => {
    state.tablePage = Math.max(1, state.tablePage - 1);
    renderTable();
    saveWorkspaceDraft();
  });
  $("nextPageBtn").addEventListener("click", () => {
    state.tablePage += 1;
    renderTable();
    saveWorkspaceDraft();
  });
  $("addTodoBtn").addEventListener("click", addTodo);
  $("saveTodosBtn").addEventListener("click", () => saveTodos().catch((error) => ($("todoStatusMessage").textContent = `保存失败：${error.message}`)));
  $("exportTodosBtn").addEventListener("click", () => {
    downloadFile("seo-workbench-todos.json", JSON.stringify({ todos: state.todos }, null, 2), "application/json;charset=utf-8");
  });
  $("saveImageConfigBtn").addEventListener("click", () =>
    withButtonBusy("saveImageConfigBtn", () => saveImageConfig().catch((error) => ($("imageConfigStatus").textContent = `保存失败：${error.message}`))),
  );
  $("testImageSearchBtn").addEventListener("click", () =>
    withButtonBusy("testImageSearchBtn", () => testImageSearch().catch((error) => ($("imageConfigStatus").textContent = `搜图失败：${error.message}`))),
  );
  $("imageProviderInput").addEventListener("change", () => {
    $("imageApiKeyInput").value = "";
    $("clearImageApiKeyInput").checked = false;
    renderImageConfig();
  });
}

async function init() {
  state.project = readProject();
  bindEvents();
  const restored = restoreWorkspaceDraft();
  renderAll();
  activatePageForLocation();

  try {
    await loadStandard();
    await loadAiStagesFromServer();
    await loadWpSites().catch((error) => {
      $("wpPublishStatus").textContent = `WordPress 站点配置读取失败：${error.message}`;
    });
    await loadBlogSites().catch((error) => {
      $("blogPublishStatus").textContent = `自建博客站点配置读取失败：${error.message}`;
    });
    await loadMainSites().catch((error) => {
      $("mainPublishStatus").textContent = `主站 OpenAPI 配置读取失败：${error.message}`;
    });
    await loadGoogleDataSources().catch((error) => {
      $("googleDataStatus").textContent = `Google 复盘数据源读取失败：${error.message}`;
    });
    await loadImageConfig().catch((error) => {
      $("imageConfigStatus").textContent = `图片 API 配置读取失败：${error.message}`;
    });
    await loadProductAssets().catch((error) => {
      $("productAssetsStatus").textContent = `产品资产读取失败：${error.message}`;
    });
    await loadTodos();
    renderAll();
    activatePageForLocation();
  } catch (error) {
    setArticleOutput(`本地服务暂时不可用：${error.message}\n\n请在 seo-workbench 目录运行 npm start。`);
  }
}

init();
