import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

const PROVIDERS = ["pexels", "unsplash", "pixabay"];

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function providerKey(provider) {
  if (provider === "pexels") return process.env.PEXELS_API_KEY || "";
  if (provider === "unsplash") return process.env.UNSPLASH_ACCESS_KEY || "";
  if (provider === "pixabay") return process.env.PIXABAY_API_KEY || "";
  return "";
}

function configuredProviders(preferred = "auto") {
  const requested = String(preferred || "auto").toLowerCase();
  const candidates = requested === "auto" ? PROVIDERS : [requested, ...PROVIDERS.filter((item) => item !== requested)];
  return candidates.filter((provider) => PROVIDERS.includes(provider) && providerKey(provider));
}

function imageUserAgent() {
  return "SEO-Workbench/0.2 image-enrichment";
}

async function readProviderJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": imageUserAgent(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail = data.error || data.message || data.errors?.join(", ") || data.raw || `${response.status}`;
    throw new Error(`${url} returned ${response.status}: ${detail}`);
  }
  return data;
}

function normalizePexels(photo = {}) {
  return {
    id: String(photo.id || ""),
    provider: "pexels",
    url: photo.src?.large2x || photo.src?.large || photo.src?.original || photo.url || "",
    thumb: photo.src?.medium || photo.src?.small || "",
    alt: photo.alt || "",
    photographer: photo.photographer || "",
    sourceUrl: photo.url || "",
    license: "Pexels License",
    width: photo.width || null,
    height: photo.height || null,
  };
}

function normalizeUnsplash(photo = {}) {
  return {
    id: String(photo.id || ""),
    provider: "unsplash",
    url: photo.urls?.regular || photo.urls?.full || photo.urls?.raw || "",
    thumb: photo.urls?.small || photo.urls?.thumb || "",
    alt: photo.alt_description || photo.description || "",
    photographer: photo.user?.name || "",
    sourceUrl: photo.links?.html || "",
    downloadLocation: photo.links?.download_location || "",
    license: "Unsplash License",
    width: photo.width || null,
    height: photo.height || null,
  };
}

function normalizePixabay(hit = {}) {
  return {
    id: String(hit.id || ""),
    provider: "pixabay",
    url: hit.largeImageURL || hit.webformatURL || hit.previewURL || "",
    thumb: hit.previewURL || hit.webformatURL || "",
    alt: hit.tags || "",
    photographer: hit.user || "",
    sourceUrl: hit.pageURL || "",
    license: "Pixabay Content License",
    width: hit.imageWidth || null,
    height: hit.imageHeight || null,
  };
}

async function searchProvider(provider, query, perPage) {
  const key = providerKey(provider);
  if (!key) throw new Error(`${provider} is not configured.`);

  if (provider === "pexels") {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("orientation", "landscape");
    const data = await readProviderJson(url, { headers: { Authorization: key } });
    return (data.photos || []).map(normalizePexels).filter((image) => image.url);
  }

  if (provider === "unsplash") {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("orientation", "landscape");
    const data = await readProviderJson(url, { headers: { Authorization: `Client-ID ${key}` } });
    return (data.results || []).map(normalizeUnsplash).filter((image) => image.url);
  }

  if (provider === "pixabay") {
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", key);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("orientation", "horizontal");
    url.searchParams.set("safesearch", "true");
    const data = await readProviderJson(url);
    return (data.hits || []).map(normalizePixabay).filter((image) => image.url);
  }

  throw new Error(`Unsupported image provider: ${provider}`);
}

async function searchImages({ query, provider = "auto", perPage = 6 } = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) throw new Error("Image query is required.");
  const limit = clampNumber(perPage, 6, 1, 20);
  const providers = configuredProviders(provider);
  if (!providers.length) {
    throw new Error("No image provider is configured. Set PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, or PIXABAY_API_KEY.");
  }

  const errors = [];
  for (const candidate of providers) {
    try {
      const images = await searchProvider(candidate, cleanQuery, limit);
      if (images.length) {
        return {
          provider: candidate,
          query: cleanQuery,
          images: images.slice(0, limit),
          errors,
        };
      }
      errors.push(`${candidate}: no results`);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }

  return { provider: providers[0], query: cleanQuery, images: [], errors };
}

function parseImagePlan(markdown = "") {
  const match = /^##\s+(Image Placement Map|Images? \/ Tables?|图片)\s*$/im.exec(markdown);
  if (!match) return [];
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/\n##\s+/);
  const block = rest.slice(0, next >= 0 ? next : undefined);
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line, index) => {
      const alt = /alt\s*=\s*"([^"]+)"/i.exec(line)?.[1] || "";
      const [name = `Image ${index + 1}`, position = ""] = line.split(/[：:]/);
      return { name: name.trim(), position: position.trim(), alt };
    });
}

function markdownImage(image, fallbackAlt = "") {
  const alt = String(fallbackAlt || image.alt || "Article image")
    .replace(/[[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `![${alt}](${image.url})`;
}

function replacePlaceholders(markdown, imageEntries) {
  let output = markdown;
  let inserted = 0;
  for (const entry of imageEntries) {
    const image = entry.image;
    if (!image?.url) continue;
    const block = markdownImage(image, entry.alt);
    const patterns = [
      /<!--\s*image(?::[^-]+)?\s*-->/i,
      /\{\{\s*image(?::[^}]+)?\s*\}\}/i,
      /\[\s*IMAGE(?::[^\]]+)?\s*]/i,
      /!\[[^\]]*]\((?:IMAGE_PLACEHOLDER|image-placeholder|TODO_IMAGE)[^)]*\)/i,
    ];
    const pattern = patterns.find((item) => item.test(output));
    if (!pattern) continue;
    output = output.replace(pattern, block);
    inserted += 1;
  }
  return { markdown: output, inserted };
}

function insertImagesIntoBody(markdown, imageEntries) {
  const existing = replacePlaceholders(markdown, imageEntries);
  if (existing.inserted >= imageEntries.length) return existing;

  const remaining = imageEntries.slice(existing.inserted).filter((entry) => entry.image?.url);
  if (!remaining.length) return existing;

  let output = existing.markdown;
  let inserted = existing.inserted;
  const firstHeading = /^#\s+.+$/m.exec(output);
  const firstImage = remaining.shift();
  if (firstImage) {
    const block = `\n\n${markdownImage(firstImage.image, firstImage.alt)}\n`;
    if (firstHeading) {
      const insertAt = firstHeading.index + firstHeading[0].length;
      output = `${output.slice(0, insertAt)}${block}${output.slice(insertAt)}`;
    } else {
      output = `${block.trim()}\n\n${output}`;
    }
    inserted += 1;
  }

  for (const entry of remaining) {
    const block = `\n${markdownImage(entry.image, entry.alt)}\n\n`;
    const heading = /^##\s+.+$/m.exec(output);
    if (heading) {
      output = `${output.slice(0, heading.index)}${block}${output.slice(heading.index)}`;
    } else {
      output = `${output.trimEnd()}\n\n${block.trim()}\n`;
    }
    inserted += 1;
  }

  return { markdown: output, inserted };
}

export async function enrichMarkdownWithImages(body = {}) {
  const markdown = String(body.markdown || body.content || "").trim();
  if (!markdown) throw new Error("Markdown content is required.");
  const keyword = String(body.keyword || body.query || "").trim();
  const maxImages = clampNumber(body.maxImages, 2, 1, 5);
  const plan = Array.isArray(body.imagePlan) && body.imagePlan.length ? body.imagePlan : parseImagePlan(markdown);
  const targets = (plan.length ? plan : [{ name: "Cover", alt: keyword }]).slice(0, maxImages);

  const entries = [];
  const warnings = [];
  for (const target of targets) {
    const query = [keyword, target.name]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    try {
      const result = await searchImages({
        query: query || keyword || target.alt,
        provider: body.provider || "auto",
        perPage: 3,
      });
      const image = result.images[0] || null;
      if (!image) warnings.push(`No image found for ${query || target.name}.`);
      entries.push({
        ...target,
        query: result.query,
        provider: result.provider,
        image,
      });
    } catch (error) {
      warnings.push(error.message);
    }
  }

  const enriched = insertImagesIntoBody(markdown, entries);
  return {
    ok: true,
    markdown: enriched.markdown,
    insertedCount: enriched.inserted,
    images: entries.filter((entry) => entry.image),
    warnings,
  };
}

export async function handleImagesRoute(request, response, pathname) {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return true;
  }

  const body = await readJson(request);
  if (pathname === "/api/images/search") {
    sendJson(response, 200, { ok: true, ...(await searchImages(body)) });
    return true;
  }

  if (pathname === "/api/images/enrich-markdown") {
    sendJson(response, 200, await enrichMarkdownWithImages(body));
    return true;
  }

  sendJson(response, 404, { error: "Image endpoint not found" });
  return true;
}
