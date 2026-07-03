import { generateAiContent } from "./generate.mjs";
import { readJson, sendJson } from "../http.mjs";
import { readProductAssets, saveExtractedProducts, saveProductApiConfig } from "../product-assets-store.mjs";

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
    // Fall back to "Header: value" lines.
  }

  for (const line of clean.split(/\r?\n/)) {
    const [name, ...rest] = line.split(":");
    if (!name || !rest.length) continue;
    headers[name.trim()] = rest.join(":").trim();
  }
  return headers;
}

function findProductArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const paths = [
    ["data", "list"],
    ["data", "items"],
    ["data", "products"],
    ["data"],
    ["list"],
    ["items"],
    ["products"],
    ["rows"],
    ["result", "list"],
    ["result", "items"],
  ];

  for (const path of paths) {
    let current = value;
    for (const key of path) current = current?.[key];
    if (Array.isArray(current)) return current;
  }

  return Object.values(value).find(Array.isArray) || [];
}

function firstText(object = {}, keys = []) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function firstNumber(object = {}, keys = []) {
  for (const key of keys) {
    const value = Number(object?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function normalizeProductLocal(product = {}, index = 0) {
  const title = firstText(product, ["title", "name", "product_title", "productName", "seo_title"]);
  const handle = firstText(product, ["handle", "slug", "src", "url_path", "path"]);
  const url = firstText(product, ["url", "link", "href", "product_url"]) || handle;
  const description = firstText(product, ["description", "descript", "excerpt", "summary", "meta_descript", "content"]);
  const image = firstText(product, ["image", "image_url", "cover_url", "cover", "thumbnail", "src_image"]);
  const category = firstText(product, ["category", "category_name", "collection", "type", "product_type"]);
  const id = firstText(product, ["id", "product_id", "sku", "spu"]) || `product-${index + 1}`;

  return {
    id,
    title: title || id,
    handle,
    url,
    category,
    price: firstNumber(product, ["price", "sale_price", "min_price"]),
    status: firstText(product, ["status", "published", "state"]),
    image,
    description: description.slice(0, 600),
    keywords: [],
  };
}

function compactRawProducts(rawProducts = [], limit = 120) {
  return rawProducts.slice(0, limit).map((product, index) => normalizeProductLocal(product, index));
}

function extractJson(text = "") {
  const clean = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("AI did not return JSON.");
    return JSON.parse(match[0]);
  }
}

async function fetchProductApi(api = {}) {
  if (!api.endpoint) throw new Error("Product API endpoint is required.");
  const response = await fetch(api.endpoint, {
    method: api.method || "GET",
    headers: {
      Accept: "application/json",
      ...parseHeaders(api.headersText || ""),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) throw new Error(data.message || data.error || data.msg || `Product API returned ${response.status}`);
  return data;
}

function productExtractionPrompt({ project = {}, products = [] } = {}) {
  return [
    "Extract ecommerce product assets from the provided API sample.",
    "Return strict JSON only in this shape:",
    '{"products":[{"id":"","title":"","handle":"","url":"","category":"","description":"","image":"","primaryKeywords":[],"commercialPageHint":"","articleAnchorHint":""}]}',
    "Rules:",
    "- Do not invent products, URLs, specs, prices, or categories.",
    "- Keep only real products or product/category landing assets useful for SEO content planning.",
    "- Merge obvious duplicates by URL/handle/title.",
    "- primaryKeywords should be short commercial or product terms derived from the product title/category.",
    "- commercialPageHint should be the best URL/path to use as a commercial page if available.",
    "- articleAnchorHint should describe how an article could naturally link to this asset.",
    "",
    `Project domain: ${project.domain || ""}`,
    `Core products/categories: ${project.coreProducts || ""}`,
    `Target market: ${project.market || ""}`,
    "",
    JSON.stringify(products, null, 2),
  ].join("\n");
}

async function extractProducts({ project = {}, api = {}, stageConfig = {}, useAi = true } = {}) {
  const raw = await fetchProductApi(api);
  const rawProducts = findProductArray(raw);
  const localProducts = compactRawProducts(rawProducts);
  let products = localProducts;
  let aiMeta = { used: false };

  if (useAi && localProducts.length) {
    const ai = await generateAiContent({
      stage: "productExtraction",
      stageConfig,
      provider: stageConfig.provider,
      model: stageConfig.model,
      prompt: productExtractionPrompt({ project, products: localProducts }),
    });

    aiMeta = {
      used: Boolean(ai.configured),
      configured: Boolean(ai.configured),
      provider: ai.provider || stageConfig.provider || "",
      model: ai.model || stageConfig.model || "",
      status: ai.status || null,
    };

    if (ai.configured && !ai.status) {
      const parsed = extractJson(ai.content || "");
      if (Array.isArray(parsed)) products = parsed;
      else if (Array.isArray(parsed.products)) products = parsed.products;
    }
  }

  const saved = saveExtractedProducts(products, {
    fetched: rawProducts.length,
    extracted: products.length,
    ai: aiMeta,
  });

  return {
    ...saved,
    fetched: rawProducts.length,
    extracted: products.length,
    ai: aiMeta,
  };
}

export async function handleProductsRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/products") {
    sendJson(response, 200, readProductAssets());
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJson(request);

  if (pathname === "/api/products/config") {
    sendJson(response, 200, saveProductApiConfig(body.api || {}));
    return;
  }

  if (pathname === "/api/products/extract") {
    const saved = readProductAssets({ includeSecrets: true });
    const api = {
      ...saved.api,
      ...(body.api || {}),
      headersText: body.api?.headersText || saved.api?.headersText || "",
    };
    sendJson(response, 200, await extractProducts({
      project: body.project || {},
      api,
      stageConfig: body.stageConfig || {},
      useAi: body.useAi !== false,
    }));
    return;
  }

  sendJson(response, 404, { error: "Products endpoint not found" });
}
